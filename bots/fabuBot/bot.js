process.env["NTBA_FIX_319"] = 1;

const TelegramBot = require('node-telegram-bot-api');
const { default: nodeGlobalProxy } = require('node-global-proxy');
const { pool } = require('./config/database');
const MediaGroupHandler = require('./handlers/MediaGroupHandler');
const VideoHandler = require('./handlers/VideoHandler');
const RandomMediaSender = require('./handlers/RandomMediaSender');
const MessageService = require('./services/MessageService');
const registerCommands = require('./commands');
const registerBotEvents = require('./registers/bot-register');
const { info, error, logBotAction } = require('./utils/logger.js');
const { getFaBuBotConfig } = require('./config');

let bot = null;
let mediaHandler = null;
let videoHandler = null;
let randomSender = null;
let currentConfig = null;
let isStarting = false; // 防止并发启动

const getFabuBotStatus = () => {
  return {
    isRunning: bot !== null,
    botName: currentConfig?.BOT_NAME || 'faBuBot'
  };
};

const startFabuBot = async () => {
  try {
    if (isStarting) {
      info('faBuBot 正在启动中，请稍候...');
      return false;
    }
    if (bot) {
      info('faBuBot 已经在运行中');
      return true;
    }
    isStarting = true;

    currentConfig = await getFaBuBotConfig();
    
    info('📋 faBuBot 配置参数:');
    info(`  BOT_NAME: ${currentConfig.BOT_NAME || '未配置'}`);
    info(`  FABU_TELEGRAM_TOKEN: ${currentConfig.FABU_TELEGRAM_TOKEN ? (currentConfig.FABU_TELEGRAM_TOKEN.length > 10 ? currentConfig.FABU_TELEGRAM_TOKEN.substring(0, 10) + '...' : currentConfig.FABU_TELEGRAM_TOKEN) : '未配置'}`);
    info(`  FABU_NOTIFY_USER_ID: ${currentConfig.FABU_NOTIFY_USER_ID || '未配置'}`);
    info(`  FORWARD_CHAT_ID: ${currentConfig.FORWARD_CHAT_ID || '未配置'}`);
    info(`  PROXY_HOST: ${currentConfig.PROXY_HOST || '未配置'}`);
    info(`  PROXY_PORT: ${currentConfig.PROXY_PORT || '未配置'}`);
    info(`  PROXY_HOST (清理后): ${currentConfig.PROXY_HOST ? currentConfig.PROXY_HOST.replace(/^https?:\/\//, '') : '未配置'}`);
    
    const token = currentConfig.FABU_TELEGRAM_TOKEN;
    if (!token) {
      error('faBuBot Token 未配置');
      return false;
    }

    const botOptions = {
      polling: {
        interval: 300,
        autoStart: true,
        params: { timeout: 60 }
      }
    };

    let proxyHost = currentConfig.PROXY_HOST;
    const proxyPort = currentConfig.PROXY_PORT;
    if (proxyHost && proxyPort) {
      proxyHost = proxyHost.replace(/^https?:\/\//, '');
      const proxyUrl = `http://${proxyHost}:${proxyPort}`;
      info(`  代理配置: ${proxyUrl}`);
      nodeGlobalProxy.setConfig(proxyUrl);
      nodeGlobalProxy.start();
    }

    bot = new TelegramBot(token, botOptions);

    // 初始化消息处理器
    const messageService = new MessageService(bot);
    mediaHandler = new MediaGroupHandler(bot, currentConfig, messageService);
    videoHandler = new VideoHandler(bot, currentConfig, messageService);
    randomSender = new RandomMediaSender(bot, messageService);

    // 注册命令
    await registerCommands({ bot }, pool);

    // 注册机器人事件
    await registerBotEvents(bot, pool, messageService, mediaHandler, videoHandler, randomSender);

    const notifyUserId = currentConfig.FABU_NOTIFY_USER_ID;
    if (notifyUserId) {
      try {
        await bot.sendMessage(notifyUserId, '🤖 faBuBot 启动成功');
        info('✅ faBuBot 启动通知已发送');
      } catch (err) {
        error('❌ faBuBot 发送启动通知失败:', err.message);
      }
    }

    info('🚀 faBuBot 启动成功');
    return true;
  } catch (err) {
    error('❌ faBuBot 启动失败:', err.message);
    bot = null;
    return false;
  } finally {
    isStarting = false;
  }
};

const stopFabuBot = async () => {
  try {
    if (!bot) {
      info('faBuBot 未在运行');
      return true;
    }

    await bot.stopPolling();
    bot = null;
    mediaHandler = null;
    videoHandler = null;
    randomSender = null;
    currentConfig = null;
    
    // 停止代理
    try {
      nodeGlobalProxy.stop();
    } catch (err) {
      // 忽略停止代理时的错误
    }
    
    info('✅ faBuBot 已停止');
    return true;
  } catch (err) {
    error('❌ faBuBot 停止失败:', err.message);
    return false;
  }
};

const updateFaBuBotCommands = async () => {
  try {
    if (!bot) {
      error('faBuBot 未运行，无法更新命令');
      return false;
    }
    await registerCommands({ bot }, pool);
    info('✅ faBuBot 命令更新成功');
    return true;
  } catch (err) {
    error('❌ faBuBot 更新命令失败:', err.message);
    return false;
  }
};

// 获取机器人实例
const getBotInstance = () => {
  return bot;
};

// 保存机器人发送的消息（使用messageHandler）
const saveOutgoingMessage = async (originalMsg, sentMsg) => {
  // 这个函数现在通过messageHandler来处理，不再需要单独实现
  // 保持函数签名不变以向后兼容
  return;
};

module.exports = {
  startFabuBot,
  stopFabuBot,
  getFabuBotStatus,
  updateFaBuBotCommands,
  getBotInstance,
  saveOutgoingMessage
};