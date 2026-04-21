
const fs = require('fs');
const path = require('path');
const bunyan = require('bunyan');
const RotatingFileStream = require('bunyan-rotating-file-stream');

// 日志目录 - 相对于项目根目录
const logDir = path.resolve(__dirname, '../log');

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const rotatingFileStreams = {};

function getRotatingFileStream(name, type) {
    const key = `${name}-${type}`;
    if (!rotatingFileStreams[key]) {
        rotatingFileStreams[key] = new RotatingFileStream({
            path: path.join(logDir, `${name}-${type}-%Y-%m-%d.log`),
            period: '1d',
            totalFiles: 30,
            rotateExisting: true,
            threshold: '10m',
            totalSize: '20m',
            gzip: true
        });
    }
    return rotatingFileStreams[key];
}

function Logger(name) {
    return bunyan.createLogger({
        name: name,
        streams: [
            {
                level: 'info',
                stream: process.stdout
            },
            {
                level: 'info',
                stream: getRotatingFileStream(name, 'info')
            },
            {
                level: 'error',
                stream: getRotatingFileStream(name, 'error')
            }
        ]
    });
}

// 创建 fabuBot 专用的 logger
const logger = Logger('fabuBot');

// 机器人操作日志函数
function logBotAction(botName, action, status, message = '', extraData = {}) {
    const logEntry = {
        botName,
        action,
        status,
        message,
        ...extraData,
        timestamp: new Date().toISOString()
    };

    if (status === 'error') {
        logger.error({ bot: logEntry }, `[${botName}] ERROR: ${action} - ${message}`);
    } else if (status === 'warn') {
        logger.warn({ bot: logEntry }, `[${botName}] WARN: ${action} - ${message}`);
    } else {
        logger.info({ bot: logEntry }, `[${botName}] INFO: ${action} - ${message}`);
    }
}

// 群组操作日志
function logGroupAction(groupId, action, userId, adminId, extraData = {}, messageId = null) {
    const logEntry = {
        groupId,
        action,
        userId,
        adminId,
        messageId,
        ...extraData,
        timestamp: new Date().toISOString()
    };

    logger.info({ group: logEntry }, `[fabuBot][Group ${groupId}] ${action} - User: ${userId}, Admin: ${adminId}`);
}

// 消息处理日志
function logMessage(chatId, messageType, userId, action, messageText = '') {
    const logEntry = {
        chatId,
        messageType,
        userId,
        action,
        messageText: messageText.substring(0, 200),
        timestamp: new Date().toISOString()
    };

    logger.info({ message: logEntry }, `[fabuBot][Message] ${action} - Chat: ${chatId}, Type: ${messageType}, User: ${userId}`);
}

// 命令执行日志
function logCommand(command, chatId, userId, args = [], success = true) {
    const logEntry = {
        command,
        chatId,
        userId,
        args,
        success,
        timestamp: new Date().toISOString()
    };

    if (success) {
        logger.info({ command: logEntry }, `[fabuBot][Command] /${command} executed - Chat: ${chatId}, User: ${userId}`);
    } else {
        logger.error({ command: logEntry }, `[fabuBot][Command] /${command} failed - Chat: ${chatId}, User: ${userId}`);
    }
}

// 导出所有日志方法
module.exports = {
    Logger,
    logger,
    info: (...args) => logger.info(...args),
    error: (...args) => logger.error(...args),
    warn: (...args) => logger.warn(...args),
    debug: (...args) => logger.debug(...args),
    trace: (...args) => logger.trace(...args),
    logBotAction,
    logGroupAction,
    logMessage,
    logCommand
};
