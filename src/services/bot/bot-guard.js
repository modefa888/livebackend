const { info, error } = require('../../utils/log-utils');
const { startBot, stopBot, getBotStatus } = require('../../../bots/livebot/bot');
const { startFabuBot, stopFabuBot, getFabuBotStatus } = require('../../../bots/fabuBot/bot');

class BotGuard {
  constructor() {
    this.isRunning = false;
    this.healthCheckInterval = null;
    this.autoRestartInterval = null;
    this.livebotLastActive = Date.now();
    this.fabuBotLastActive = Date.now();
    this.livebotRestartCount = 0;
    this.fabuBotRestartCount = 0;
    this.maxRestartAttempts = 5;
    this.healthCheckIntervalMs = 30000; // 30秒检查一次
    this.autoRestartIntervalMs = 60000; // 1分钟检查一次
    this.restartBackoff = 0;
    this.disabledBots = {
      livebot: false, // 是否禁用自动重启
      fabubot: false  // 是否禁用自动重启
    };
  }

  // 启动守护服务
  async start() {
    if (this.isRunning) {
      info('🔒 BotGuard 已经在运行中');
      return;
    }

    info('🔒 启动 BotGuard 机器人守护服务');
    this.isRunning = true;

    // 设置全局错误捕获
    this.setupGlobalErrorHandlers();

    // 启动健康检查
    this.startHealthCheck();

    // 启动自动重启监控
    this.startAutoRestart();

    info('✅ BotGuard 机器人守护服务启动成功');
  }

  // 停止守护服务
  async stop() {
    if (!this.isRunning) {
      return;
    }

    info('🔒 正在停止 BotGuard 机器人守护服务');

    // 清除定时器
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.autoRestartInterval) {
      clearInterval(this.autoRestartInterval);
      this.autoRestartInterval = null;
    }

    this.isRunning = false;
    info('✅ BotGuard 机器人守护服务已停止');
  }

  // 设置全局错误处理
  setupGlobalErrorHandlers() {
    // 未捕获的异常
    process.on('uncaughtException', (err) => {
      error('❌ 未捕获的异常:', err);
      this.handleCriticalError('uncaughtException', err);
    });

    // 未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason, promise) => {
      // 检查是否是 Telegram 常见错误，如果是则忽略
      if (this.isTelegramCommonError(reason)) {
        info(`[忽略的错误] ${reason?.response?.body?.description || reason?.message}`);
        return;
      }
      error('❌ 未处理的 Promise 拒绝:', promise, '原因:', reason);
      this.handleCriticalError('unhandledRejection', reason);
    });

    // 警告事件
    process.on('warning', (warning) => {
      info(`⚠️ 警告: ${warning.name} - ${warning.message}`);
    });
  }

  // 检查是否是 Telegram 常见错误
  isTelegramCommonError(error) {
    if (error && error.code === 'ETELEGRAM' && error.response && error.response.body) {
      const errorBody = error.response.body;
      return errorBody.description && (
        errorBody.description.includes('chat not found') ||
        errorBody.description.includes('bot was blocked') ||
        errorBody.description.includes('user is deactivated') ||
        errorBody.description.includes('Forbidden')
      );
    }
    return false;
  }

  // 处理严重错误
  async handleCriticalError(type, error) {
    error(`⚠️ 检测到严重错误 [${type}]，尝试自动重启机器人...`);
    
    // 增加指数退避时间
    this.restartBackoff = Math.min(this.restartBackoff + 1, 5);
    const delay = Math.pow(2, this.restartBackoff) * 1000;
    
    info(`⏰ 将在 ${delay/1000} 秒后尝试重启...`);
    
    setTimeout(async () => {
      await this.attemptRestartAll();
    }, delay);
  }

  // 尝试重启所有机器人
  async attemptRestartAll() {
    info('🔄 尝试重启所有机器人...');

    try {
      // 先停止机器人
      await this.safeStopBot();
      await this.safeStopFabuBot();

      // 等待一段时间
      await this.sleep(2000);

      // 重新启动
      const livebotSuccess = await this.safeStartBot();
      const fabuBotSuccess = await this.safeStartFabuBot();

      if (livebotSuccess || fabuBotSuccess) {
        info('✅ 机器人重启成功');
        // 重置退避时间
        this.restartBackoff = 0;
      } else {
        error('❌ 所有机器人重启失败');
      }
    } catch (err) {
      error('❌ 重启过程出错:', err);
    }
  }

  // 安全启动 LiveBot
  async safeStartBot() {
    try {
      const status = getBotStatus();
      if (status.isRunning) {
        return true;
      }
      
      info('🔄 尝试启动 LiveBot...');
      const success = await startBot();
      if (success) {
        this.livebotLastActive = Date.now();
        this.livebotRestartCount++;
        info(`✅ LiveBot 启动成功 (重启次数: ${this.livebotRestartCount})`);
      }
      return success;
    } catch (err) {
      error('❌ LiveBot 启动失败:', err);
      return false;
    }
  }

  // 安全停止 LiveBot
  async safeStopBot() {
    try {
      const status = getBotStatus();
      if (!status.isRunning) {
        return true;
      }
      
      info('🛑 正在停止 LiveBot...');
      return await stopBot();
    } catch (err) {
      error('❌ LiveBot 停止失败:', err);
      return false;
    }
  }

  // 安全启动 FaBuBot
  async safeStartFabuBot() {
    try {
      const status = getFabuBotStatus();
      if (status.isRunning) {
        return true;
      }
      
      info('🔄 尝试启动 FaBuBot...');
      const success = await startFabuBot();
      if (success) {
        this.fabuBotLastActive = Date.now();
        this.fabuBotRestartCount++;
        info(`✅ FaBuBot 启动成功 (重启次数: ${this.fabuBotRestartCount})`);
      }
      return success;
    } catch (err) {
      error('❌ FaBuBot 启动失败:', err);
      return false;
    }
  }

  // 安全停止 FaBuBot
  async safeStopFabuBot() {
    try {
      const status = getFabuBotStatus();
      if (!status.isRunning) {
        return true;
      }
      
      info('🛑 正在停止 FaBuBot...');
      return await stopFabuBot();
    } catch (err) {
      error('❌ FaBuBot 停止失败:', err);
      return false;
    }
  }

  // 启动健康检查
  startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkHealth();
    }, this.healthCheckIntervalMs);
    
    info(`🔍 健康检查已启动，间隔: ${this.healthCheckIntervalMs/1000} 秒`);
  }

  // 健康检查
  async checkHealth() {
    try {
      const livebotStatus = getBotStatus();
      const fabuBotStatus = getFabuBotStatus();

      info('💚 健康检查:');
      info(`  LiveBot: ${livebotStatus.isRunning ? '✅ 运行中' : '❌ 已停止'}`);
      info(`  FaBuBot: ${fabuBotStatus.isRunning ? '✅ 运行中' : '❌ 已停止'}`);
    } catch (err) {
      error('❌ 健康检查失败:', err);
    }
  }

  // 启动自动重启监控
  startAutoRestart() {
    this.autoRestartInterval = setInterval(async () => {
      await this.checkAndRestart();
    }, this.autoRestartIntervalMs);
    
    info(`🔄 自动重启监控已启动，间隔: ${this.autoRestartIntervalMs/1000} 秒`);
  }

  // 检查并重启
  async checkAndRestart() {
    try {
      const livebotStatus = getBotStatus();
      const fabuBotStatus = getFabuBotStatus();

      // 检查 LiveBot（如果没有被禁用自动重启）
      if (!livebotStatus.isRunning && !this.disabledBots.livebot) {
        info('⚠️ LiveBot 检测到停止，尝试启动...');
        await this.safeStartBot();
      }

      // 检查 FaBuBot（如果没有被禁用自动重启）
      if (!fabuBotStatus.isRunning && !this.disabledBots.fabubot) {
        info('⚠️ FaBuBot 检测到停止，尝试启动...');
        await this.safeStartFabuBot();
      }
    } catch (err) {
      error('❌ 自动重启检查失败:', err);
    }
  }

  // 停止单个机器人
  async stopBotByName(botName) {
    try {
      botName = botName.toLowerCase();
      
      if (botName === 'livebot') {
        info(`🛑 正在手动停止 LiveBot...`);
        const result = await this.safeStopBot();
        if (result) {
          info('✅ LiveBot 已停止');
        }
        return result;
      } else if (botName === 'fabubot') {
        info(`🛑 正在手动停止 FaBuBot...`);
        const result = await this.safeStopFabuBot();
        if (result) {
          info('✅ FaBuBot 已停止');
        }
        return result;
      } else {
        error(`❌ 未知的机器人名称: ${botName}`);
        return false;
      }
    } catch (err) {
      error(`❌ 停止机器人失败:`, err);
      return false;
    }
  }

  // 启动单个机器人
  async startBotByName(botName) {
    try {
      botName = botName.toLowerCase();
      
      if (botName === 'livebot') {
        info(`🔄 正在手动启动 LiveBot...`);
        const result = await this.safeStartBot();
        if (result) {
          info('✅ LiveBot 启动成功');
        }
        return result;
      } else if (botName === 'fabubot') {
        info(`🔄 正在手动启动 FaBuBot...`);
        const result = await this.safeStartFabuBot();
        if (result) {
          info('✅ FaBuBot 启动成功');
        }
        return result;
      } else {
        error(`❌ 未知的机器人名称: ${botName}`);
        return false;
      }
    } catch (err) {
      error(`❌ 启动机器人失败:`, err);
      return false;
    }
  }

  // 禁用/启用机器人自动重启
  setBotAutoRestart(botName, enabled) {
    botName = botName.toLowerCase();
    
    if (botName === 'livebot') {
      this.disabledBots.livebot = !enabled;
      info(`🔧 LiveBot 自动重启 ${enabled ? '已启用' : '已禁用'}`);
      return true;
    } else if (botName === 'fabubot') {
      this.disabledBots.fabubot = !enabled;
      info(`🔧 FaBuBot 自动重启 ${enabled ? '已启用' : '已禁用'}`);
      return true;
    } else {
      error(`❌ 未知的机器人名称: ${botName}`);
      return false;
    }
  }

  // 获取机器人自动重启状态
  getBotAutoRestartStatus(botName) {
    botName = botName.toLowerCase();
    
    if (botName === 'livebot') {
      return !this.disabledBots.livebot;
    } else if (botName === 'fabubot') {
      return !this.disabledBots.fabubot;
    } else {
      return null;
    }
  }

  // 辅助函数：延迟
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取守护服务状态
  getStatus() {
    try {
      let livebotStatus = { isRunning: false, error: '获取状态失败' };
      let fabuBotStatus = { isRunning: false, error: '获取状态失败' };
      
      try {
        livebotStatus = getBotStatus();
      } catch (err) {
        error('获取 LiveBot 状态失败:', err);
        livebotStatus = { isRunning: false, error: err ? err.message : '未知错误' };
      }
      
      try {
        fabuBotStatus = getFabuBotStatus();
      } catch (err) {
        error('获取 FaBuBot 状态失败:', err);
        fabuBotStatus = { isRunning: false, error: err ? err.message : '未知错误' };
      }

      // 安全地格式化日期
      const formatDate = (timestamp) => {
        try {
          if (!timestamp) return new Date(0).toISOString();
          return new Date(timestamp).toISOString();
        } catch (err) {
          return new Date(0).toISOString();
        }
      };

      return {
        guardRunning: this.isRunning,
        livebot: {
          ...livebotStatus,
          restartCount: this.livebotRestartCount,
          lastActive: formatDate(this.livebotLastActive),
          autoRestartEnabled: !this.disabledBots.livebot
        },
        fabuBot: {
          ...fabuBotStatus,
          restartCount: this.fabuBotRestartCount,
          lastActive: formatDate(this.fabuBotLastActive),
          autoRestartEnabled: !this.disabledBots.fabubot
        },
        healthCheckInterval: `${this.healthCheckIntervalMs/1000} 秒`,
        autoRestartInterval: `${this.autoRestartIntervalMs/1000} 秒`,
        restartBackoff: this.restartBackoff
      };
    } catch (error) {
      error('获取 BotGuard 状态时发生错误:', error);
      return {
        guardRunning: this.isRunning,
        livebot: { isRunning: false, error: error ? error.message : '未知错误', restartCount: this.livebotRestartCount },
        fabuBot: { isRunning: false, error: error ? error.message : '未知错误', restartCount: this.fabuBotRestartCount },
        healthCheckInterval: `${this.healthCheckIntervalMs/1000} 秒`,
        autoRestartInterval: `${this.autoRestartIntervalMs/1000} 秒`,
        restartBackoff: this.restartBackoff
      };
    }
  }
}

// 单例模式
let instance = null;
const getBotGuard = () => {
  if (!instance) {
    instance = new BotGuard();
  }
  return instance;
};

module.exports = {
  BotGuard,
  getBotGuard
};
