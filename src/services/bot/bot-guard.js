const { info, error } = require('../../utils/log-utils');
const { startBot, stopBot, getBotStatus } = require('../../../bots/livebot/bot');
const { startFabuBot, stopFabuBot, getFabuBotStatus } = require('../../../bots/fabuBot/bot');
const db = require('../../config/db');

class BotGuard {
  constructor() {
    this.isRunning = false;
    this.livebotHealthCheckInterval = null;
    this.fabubotHealthCheckInterval = null;
    this.livebotAutoRestartInterval = null;
    this.fabubotAutoRestartInterval = null;
    this.livebotLastActive = Date.now();
    this.fabuBotLastActive = Date.now();
    this.livebotRestartCount = 0;
    this.fabuBotRestartCount = 0;
    this.maxRestartAttempts = 5;
    this.healthCheckIntervalMs = 30000;
    this.autoRestartIntervalMs = 60000;
    this.restartBackoff = 0;
    this.disabledBots = {
      livebot: false,
      fabubot: false
    };
    this.botConfigs = {};
    this.lastHealthStatus = {
      livebot: null,
      fabubot: null
    };
  }

  async getAllSettings() {
    try {
      const [rows] = await db.execute('SELECT * FROM bot_guard_settings ORDER BY bot_name');
      return rows;
    } catch (err) {
      error('获取守护服务配置失败:', err);
      return [];
    }
  }

  async getSettingByBotName(botName) {
    try {
      const [rows] = await db.execute('SELECT * FROM bot_guard_settings WHERE bot_name = ?', [botName]);
      return rows[0] || null;
    } catch (err) {
      error('获取机器人配置失败:', err);
      return null;
    }
  }

  async updateSetting(botName, settings) {
    const { health_check_interval, auto_restart_interval, auto_restart_enabled, enabled, max_restart_attempts } = settings;
    try {
      const [result] = await db.execute(
        `UPDATE bot_guard_settings 
         SET health_check_interval = ?, 
             auto_restart_interval = ?, 
             auto_restart_enabled = ?, 
             enabled = ?, 
             max_restart_attempts = ?,
             updated_at = CURRENT_TIMESTAMP 
         WHERE bot_name = ?`,
        [health_check_interval, auto_restart_interval, auto_restart_enabled, enabled, max_restart_attempts, botName]
      );
      return result.affectedRows > 0;
    } catch (err) {
      error('更新守护服务配置失败:', err);
      return false;
    }
  }

  async incrementRestartCount(botName) {
    try {
      const [result] = await db.execute(
        'UPDATE bot_guard_settings SET restart_count = restart_count + 1, last_restart_at = CURRENT_TIMESTAMP WHERE bot_name = ?',
        [botName]
      );
      return result.affectedRows > 0;
    } catch (err) {
      error('更新重启计数失败:', err);
      return false;
    }
  }

  async updateRestartBackoff(botName, backoff) {
    try {
      const [result] = await db.execute(
        'UPDATE bot_guard_settings SET restart_backoff = ? WHERE bot_name = ?',
        [backoff, botName]
      );
      return result.affectedRows > 0;
    } catch (err) {
      error('更新退避值失败:', err);
      return false;
    }
  }

  async resetRestartCount(botName) {
    try {
      const [result] = await db.execute(
        'UPDATE bot_guard_settings SET restart_count = 0, restart_backoff = 0 WHERE bot_name = ?',
        [botName]
      );
      return result.affectedRows > 0;
    } catch (err) {
      error('重置重启计数失败:', err);
      return false;
    }
  }

  async loadSettingsFromDB() {
    try {
      const settings = await this.getAllSettings();
      if (settings && settings.length > 0) {
        settings.forEach(setting => {
          this.botConfigs[setting.bot_name] = {
            health_check_interval: setting.health_check_interval,
            auto_restart_interval: setting.auto_restart_interval,
            auto_restart_enabled: setting.auto_restart_enabled === 1,
            enabled: setting.enabled === 1,
            max_restart_attempts: setting.max_restart_attempts,
            restart_backoff: setting.restart_backoff,
            restart_count: setting.restart_count,
            last_restart_at: setting.last_restart_at
          };
          if (setting.bot_name === 'livebot') {
            this.livebotRestartCount = setting.restart_count;
            this.disabledBots.livebot = !setting.auto_restart_enabled;
          } else if (setting.bot_name === 'fabubot') {
            this.fabuBotRestartCount = setting.restart_count;
            this.disabledBots.fabubot = !setting.auto_restart_enabled;
          }
        });
        info('✅ 从数据库加载守护服务配置成功');
      } else {
        info('⚠️ 数据库中未找到守护服务配置，使用默认值');
        this.botConfigs['livebot'] = {
          health_check_interval: 30000,
          auto_restart_interval: 60000,
          auto_restart_enabled: true,
          enabled: true,
          max_restart_attempts: 5,
          restart_backoff: 0,
          restart_count: 0
        };
        this.botConfigs['fabubot'] = {
          health_check_interval: 30000,
          auto_restart_interval: 60000,
          auto_restart_enabled: true,
          enabled: true,
          max_restart_attempts: 5,
          restart_backoff: 0,
          restart_count: 0
        };
      }
    } catch (err) {
      error('❌ 从数据库加载守护服务配置失败:', err);
      this.botConfigs['livebot'] = {
        health_check_interval: 30000,
        auto_restart_interval: 60000,
        auto_restart_enabled: true,
        enabled: true,
        max_restart_attempts: 5,
        restart_backoff: 0,
        restart_count: 0
      };
      this.botConfigs['fabubot'] = {
        health_check_interval: 30000,
        auto_restart_interval: 60000,
        auto_restart_enabled: true,
        enabled: true,
        max_restart_attempts: 5,
        restart_backoff: 0,
        restart_count: 0
      };
    }
  }

  async start() {
    if (this.isRunning) {
      info('🔒 BotGuard 已经在运行中');
      return;
    }

    info('🔒 启动 BotGuard 机器人守护服务');
    this.isRunning = true;

    await this.loadSettingsFromDB();

    this.setupGlobalErrorHandlers();
    this.startHealthCheck();
    this.startAutoRestart();

    info('✅ BotGuard 机器人守护服务启动成功');
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    info('🔒 正在停止 BotGuard 机器人守护服务');

    if (this.livebotHealthCheckInterval) {
      clearInterval(this.livebotHealthCheckInterval);
      this.livebotHealthCheckInterval = null;
    }
    if (this.fabubotHealthCheckInterval) {
      clearInterval(this.fabubotHealthCheckInterval);
      this.fabubotHealthCheckInterval = null;
    }

    if (this.livebotAutoRestartInterval) {
      clearInterval(this.livebotAutoRestartInterval);
      this.livebotAutoRestartInterval = null;
    }
    if (this.fabubotAutoRestartInterval) {
      clearInterval(this.fabubotAutoRestartInterval);
      this.fabubotAutoRestartInterval = null;
    }

    this.isRunning = false;
    info('✅ BotGuard 机器人守护服务已停止');
  }

  setupGlobalErrorHandlers() {
    process.on('uncaughtException', (err) => {
      error('❌ 未捕获的异常:', err);
      this.handleCriticalError('uncaughtException', err);
    });

    process.on('unhandledRejection', (reason, promise) => {
      if (this.isTelegramCommonError(reason)) {
        info(`[忽略的错误] ${reason?.response?.body?.description || reason?.message}`);
        return;
      }
      error('❌ 未处理的 Promise 拒绝:', promise, '原因:', reason);
      this.handleCriticalError('unhandledRejection', reason);
    });

    process.on('warning', (warning) => {
      info(`⚠️ 警告: ${warning.name} - ${warning.message}`);
    });
  }

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

  async handleCriticalError(type, error) {
    error(`⚠️ 检测到严重错误 [${type}]，尝试自动重启机器人...`);
    
    this.restartBackoff = Math.min(this.restartBackoff + 1, 5);
    await this.updateRestartBackoff('livebot', this.restartBackoff);
    await this.updateRestartBackoff('fabubot', this.restartBackoff);
    
    const delay = Math.pow(2, this.restartBackoff) * 1000;
    
    info(`⏰ 将在 ${delay/1000} 秒后尝试重启...`);
    
    setTimeout(async () => {
      await this.attemptRestartAll();
    }, delay);
  }

  async attemptRestartAll() {
    info('🔄 尝试重启所有机器人...');

    try {
      await this.safeStopBot();
      await this.safeStopFabuBot();

      await this.sleep(2000);

      const livebotConfig = this.botConfigs['livebot'];
      const fabubotConfig = this.botConfigs['fabubot'];

      let livebotSuccess = false;
      let fabuBotSuccess = false;

      if (livebotConfig) {
        if (this.livebotRestartCount >= livebotConfig.max_restart_attempts) {
          warning(`⚠️ LiveBot 已达到最大重启次数 (${livebotConfig.max_restart_attempts}次)，跳过重启`);
        } else {
          livebotSuccess = await this.safeStartBot();
          if (!livebotSuccess) {
            this.livebotRestartCount++;
            await this.incrementRestartCount('livebot');
            error(`❌ LiveBot 重启失败 (已尝试 ${this.livebotRestartCount}/${livebotConfig.max_restart_attempts} 次)`);
          } else {
            this.livebotRestartCount = 0;
            await this.resetRestartCount('livebot');
          }
        }
      }

      if (fabubotConfig) {
        if (this.fabuBotRestartCount >= fabubotConfig.max_restart_attempts) {
          warning(`⚠️ FaBuBot 已达到最大重启次数 (${fabubotConfig.max_restart_attempts}次)，跳过重启`);
        } else {
          fabuBotSuccess = await this.safeStartFabuBot();
          if (!fabuBotSuccess) {
            this.fabuBotRestartCount++;
            await this.incrementRestartCount('fabubot');
            error(`❌ FaBuBot 重启失败 (已尝试 ${this.fabuBotRestartCount}/${fabubotConfig.max_restart_attempts} 次)`);
          } else {
            this.fabuBotRestartCount = 0;
            await this.resetRestartCount('fabubot');
          }
        }
      }

      if (livebotSuccess || fabuBotSuccess) {
        info('✅ 机器人重启成功');
        this.restartBackoff = 0;
        await this.updateRestartBackoff('livebot', 0);
        await this.updateRestartBackoff('fabubot', 0);
      } else {
        error('❌ 所有机器人重启失败');
      }
    } catch (err) {
      error('❌ 重启过程出错:', err);
    }
  }

  async safeStartBot() {
    try {
      const config = this.botConfigs['livebot'];
      if (config && !config.enabled) {
        info('⚠️ LiveBot 已被禁用，跳过启动');
        return false;
      }

      const status = getBotStatus();
      if (status.isRunning) {
        return true;
      }
      
      info('🔄 尝试启动 LiveBot...');
      const success = await startBot();
      if (success) {
        this.livebotLastActive = Date.now();
        info('✅ LiveBot 启动成功');
      }
      return success;
    } catch (err) {
      error('❌ LiveBot 启动失败:', err);
      return false;
    }
  }

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

  async safeStartFabuBot() {
    try {
      const config = this.botConfigs['fabubot'];
      if (config && !config.enabled) {
        info('⚠️ FaBuBot 已被禁用，跳过启动');
        return false;
      }

      const status = getFabuBotStatus();
      if (status.isRunning) {
        return true;
      }
      
      info('🔄 尝试启动 FaBuBot...');
      const success = await startFabuBot();
      if (success) {
        this.fabuBotLastActive = Date.now();
        info('✅ FaBuBot 启动成功');
      }
      return success;
    } catch (err) {
      error('❌ FaBuBot 启动失败:', err);
      return false;
    }
  }

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

  startHealthCheck() {
    const livebotInterval = this.botConfigs['livebot']?.health_check_interval || this.healthCheckIntervalMs;
    const fabubotInterval = this.botConfigs['fabubot']?.health_check_interval || this.healthCheckIntervalMs;

    this.livebotHealthCheckInterval = setInterval(async () => {
      await this.checkHealth('livebot');
    }, livebotInterval);

    this.fabubotHealthCheckInterval = setInterval(async () => {
      await this.checkHealth('fabubot');
    }, fabubotInterval);
    
    info(`🔍 LiveBot 健康检查已启动，间隔: ${livebotInterval/1000} 秒`);
    info(`🔍 FaBuBot 健康检查已启动，间隔: ${fabubotInterval/1000} 秒`);
  }

  async checkHealth(botName) {
    try {
      let status, displayName;
      if (botName === 'livebot') {
        status = getBotStatus();
        displayName = 'LiveBot';
      } else if (botName === 'fabubot') {
        status = getFabuBotStatus();
        displayName = 'FaBuBot';
      } else {
        return;
      }

      const currentStatus = status.isRunning;
      const lastStatus = this.lastHealthStatus[botName];
      
      if (lastStatus !== currentStatus) {
        info(`💚 ${displayName} 健康检查: ${currentStatus ? '✅ 运行中' : '❌ 已停止'}`);
        this.lastHealthStatus[botName] = currentStatus;
      }
    } catch (err) {
      error(`❌ ${botName} 健康检查失败:`, err);
    }
  }

  startAutoRestart() {
    const livebotInterval = this.botConfigs['livebot']?.auto_restart_interval || this.autoRestartIntervalMs;
    const fabubotInterval = this.botConfigs['fabubot']?.auto_restart_interval || this.autoRestartIntervalMs;

    this.livebotAutoRestartInterval = setInterval(async () => {
      await this.checkAndRestart('livebot');
    }, livebotInterval);

    this.fabubotAutoRestartInterval = setInterval(async () => {
      await this.checkAndRestart('fabubot');
    }, fabubotInterval);
    
    info(`🔄 LiveBot 自动重启监控已启动，间隔: ${livebotInterval/1000} 秒`);
    info(`🔄 FaBuBot 自动重启监控已启动，间隔: ${fabubotInterval/1000} 秒`);
  }

  async checkAndRestart(botName) {
    try {
      let status, config, disabled, displayName;
      
      if (botName === 'livebot') {
        status = getBotStatus();
        config = this.botConfigs['livebot'];
        disabled = this.disabledBots.livebot;
        displayName = 'LiveBot';
      } else if (botName === 'fabubot') {
        status = getFabuBotStatus();
        config = this.botConfigs['fabubot'];
        disabled = this.disabledBots.fabubot;
        displayName = 'FaBuBot';
      } else {
        return;
      }

      if (!status.isRunning && config?.enabled && !disabled) {
        info(`⚠️ ${displayName} 检测到停止，尝试启动...`);
        if (botName === 'livebot') {
          await this.safeStartBot();
        } else if (botName === 'fabubot') {
          await this.safeStartFabuBot();
        }
      }
    } catch (err) {
      error(`❌ ${botName} 自动重启检查失败:`, err);
    }
  }

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

  async startBotByName(botName) {
    try {
      botName = botName.toLowerCase();
      
      if (botName === 'livebot') {
        const config = this.botConfigs['livebot'];
        if (config && !config.enabled) {
          info('⚠️ LiveBot 已被禁用，无法启动');
          return false;
        }
        info(`🔄 正在手动启动 LiveBot...`);
        const result = await this.safeStartBot();
        if (result) {
          info('✅ LiveBot 启动成功');
        }
        return result;
      } else if (botName === 'fabubot') {
        const config = this.botConfigs['fabubot'];
        if (config && !config.enabled) {
          info('⚠️ FaBuBot 已被禁用，无法启动');
          return false;
        }
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

  async setBotAutoRestart(botName, enabled) {
    botName = botName.toLowerCase();
    
    if (botName === 'livebot') {
      this.disabledBots.livebot = !enabled;
      await this.updateSetting(botName, {
        ...this.botConfigs['livebot'],
        auto_restart_enabled: enabled ? 1 : 0
      });
      info(`🔧 LiveBot 自动重启 ${enabled ? '已启用' : '已禁用'}`);
      return true;
    } else if (botName === 'fabubot') {
      this.disabledBots.fabubot = !enabled;
      await this.updateSetting(botName, {
        ...this.botConfigs['fabubot'],
        auto_restart_enabled: enabled ? 1 : 0
      });
      info(`🔧 FaBuBot 自动重启 ${enabled ? '已启用' : '已禁用'}`);
      return true;
    } else {
      error(`❌ 未知的机器人名称: ${botName}`);
      return false;
    }
  }

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

  async updateBotConfig(botName, config) {
    botName = botName.toLowerCase();
    
    if (!this.botConfigs[botName]) {
      error(`❌ 未知的机器人名称: ${botName}`);
      return false;
    }

    const updateData = {
      health_check_interval: config.health_check_interval || this.botConfigs[botName].health_check_interval,
      auto_restart_interval: config.auto_restart_interval || this.botConfigs[botName].auto_restart_interval,
      auto_restart_enabled: config.auto_restart_enabled !== undefined ? (config.auto_restart_enabled ? 1 : 0) : this.botConfigs[botName].auto_restart_enabled,
      enabled: config.enabled !== undefined ? (config.enabled ? 1 : 0) : this.botConfigs[botName].enabled,
      max_restart_attempts: config.max_restart_attempts || this.botConfigs[botName].max_restart_attempts
    };

    const success = await this.updateSetting(botName, updateData);
    
    if (success) {
      this.botConfigs[botName] = {
        ...this.botConfigs[botName],
        ...updateData,
        auto_restart_enabled: updateData.auto_restart_enabled === 1,
        enabled: updateData.enabled === 1
      };
      
      if (botName === 'livebot') {
        this.disabledBots.livebot = !this.botConfigs[botName].auto_restart_enabled;
      } else if (botName === 'fabubot') {
        this.disabledBots.fabubot = !this.botConfigs[botName].auto_restart_enabled;
      }

      this.restartTimers();
      info(`🔧 ${botName} 配置已更新并持久化`);
    }
    
    return success;
  }

  restartTimers() {
    if (this.livebotHealthCheckInterval) {
      clearInterval(this.livebotHealthCheckInterval);
      this.livebotHealthCheckInterval = null;
    }
    if (this.fabubotHealthCheckInterval) {
      clearInterval(this.fabubotHealthCheckInterval);
      this.fabubotHealthCheckInterval = null;
    }
    if (this.livebotAutoRestartInterval) {
      clearInterval(this.livebotAutoRestartInterval);
      this.livebotAutoRestartInterval = null;
    }
    if (this.fabubotAutoRestartInterval) {
      clearInterval(this.fabubotAutoRestartInterval);
      this.fabubotAutoRestartInterval = null;
    }
    
    if (this.isRunning) {
      this.startHealthCheck();
      this.startAutoRestart();
    }
  }

  async getBotConfigs() {
    return this.botConfigs;
  }

  async resetRestartCounts() {
    await this.resetRestartCount('livebot');
    await this.resetRestartCount('fabubot');
    this.livebotRestartCount = 0;
    this.fabuBotRestartCount = 0;
    info('🔄 重启计数已重置');
    return true;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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
          autoRestartEnabled: !this.disabledBots.livebot,
          config: this.botConfigs['livebot'],
          healthCheckInterval: `${(this.botConfigs['livebot']?.health_check_interval || this.healthCheckIntervalMs)/1000} 秒`,
          autoRestartInterval: `${(this.botConfigs['livebot']?.auto_restart_interval || this.autoRestartIntervalMs)/1000} 秒`
        },
        fabuBot: {
          ...fabuBotStatus,
          restartCount: this.fabuBotRestartCount,
          lastActive: formatDate(this.fabuBotLastActive),
          autoRestartEnabled: !this.disabledBots.fabubot,
          config: this.botConfigs['fabubot'],
          healthCheckInterval: `${(this.botConfigs['fabubot']?.health_check_interval || this.healthCheckIntervalMs)/1000} 秒`,
          autoRestartInterval: `${(this.botConfigs['fabubot']?.auto_restart_interval || this.autoRestartIntervalMs)/1000} 秒`
        },
        restartBackoff: this.restartBackoff
      };
    } catch (error) {
      error('获取 BotGuard 状态时发生错误:', error);
      return {
        guardRunning: this.isRunning,
        livebot: { isRunning: false, error: error ? error.message : '未知错误', restartCount: this.livebotRestartCount },
        fabuBot: { isRunning: false, error: error ? error.message : '未知错误', restartCount: this.fabuBotRestartCount },
        restartBackoff: this.restartBackoff
      };
    }
  }
}

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