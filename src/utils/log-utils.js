const fs = require('fs');
const path = require('path');
const bunyan = require('bunyan');

const logDir = path.resolve(__dirname, '../../log');

try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
} catch (e) {
    console.log('创建日志文件夹失败，仅使用控制台日志');
}

function Logger(name) {
    // 先尝试仅使用控制台日志，避免文件权限问题
    return bunyan.createLogger({
        name: name,
        streams: [
            {
                level: 'info',
                stream: process.stdout
            }
        ]
    });
}

const logger = Logger('backend');

function logRequest(req, res, next) {
    const { method, url, ip, headers } = req;
    const startTime = Date.now();

    const userAgent = headers['user-agent'] || 'unknown';
    const referer = headers['referer'] || '-';

    res.on('finish', () => {
        const { statusCode } = res;
        const duration = Date.now() - startTime;
        
        const userId = req.userId || (req.user && req.user.id) || (req.user && req.user.userId) || '未登录用户';
        const username = req.user && req.user.username || '未知用户';

        const logEntry = {
            method,
            url,
            statusCode,
            duration: `${duration}ms`,
            ip,
            userId,
            username,
            userAgent,
            referer,
            timestamp: new Date().toISOString()
        };

        if (statusCode >= 400) {
            logger.error({ req: logEntry }, `Request failed [${method}] ${url} -> ${statusCode}`);
        } else {
            logger.info({ req: logEntry }, `Request success [${method}] ${url} -> ${statusCode} (${duration}ms)`);
        }
    });

    next();
}

function logSpider(spiderName, action, status, message = '') {
    const logEntry = {
        spiderName,
        action,
        status,
        message,
        timestamp: new Date().toISOString()
    };

    if (status === 'error') {
        logger.error({ spider: logEntry }, `Spider error [${spiderName}] ${action}: ${message}`);
    } else if (status === 'warn') {
        logger.warn({ spider: logEntry }, `Spider warning [${spiderName}] ${action}: ${message}`);
    } else {
        logger.info({ spider: logEntry }, `Spider action [${spiderName}] ${action}: ${message}`);
    }
}

function logBot(botName, action, status, message = '') {
    const logEntry = {
        botName,
        action,
        status,
        message,
        timestamp: new Date().toISOString()
    };

    if (status === 'error') {
        logger.error({ bot: logEntry }, `Bot error [${botName}] ${action}: ${message}`);
    } else if (status === 'warn') {
        logger.warn({ bot: logEntry }, `Bot warning [${botName}] ${action}: ${message}`);
    } else {
        logger.info({ bot: logEntry }, `Bot action [${botName}] ${action}: ${message}`);
    }
}

function logSystem(action, status, message = '') {
    const logEntry = {
        action,
        status,
        message,
        timestamp: new Date().toISOString()
    };

    if (status === 'error') {
        logger.error({ system: logEntry }, `System error ${action}: ${message}`);
    } else if (status === 'warn') {
        logger.warn({ system: logEntry }, `System warning ${action}: ${message}`);
    } else {
        logger.info({ system: logEntry }, `System action ${action}: ${message}`);
    }
}

module.exports = {
    Logger,
    logger,
    info: (...args) => logger.info(...args),
    error: (...args) => logger.error(...args),
    warn: (...args) => logger.warn(...args),
    debug: (...args) => logger.debug(...args),
    trace: (...args) => logger.trace(...args),
    logRequest,
    logSpider,
    logBot,
    logSystem
};