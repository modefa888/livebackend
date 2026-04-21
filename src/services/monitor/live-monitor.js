const db = require('../../config/db');

class LiveMonitor {
  constructor() {
    this.isRunning = false;
    this.monitorInterval = null;
    this.intervalTime = 5 * 60 * 1000; // 默认5分钟
  }

  // 从数据库加载监控频率
  async loadIntervalFromDb() {
    try {
      const [settings] = await db.execute('SELECT setting_value FROM bot_settings WHERE user_id IS NULL AND setting_key = ? AND status = 1', ['live_monitor_interval']);
      if (settings && settings.length > 0 && settings[0].setting_value) {
        const intervalMinutes = parseInt(settings[0].setting_value);
        if (!isNaN(intervalMinutes) && intervalMinutes > 0) {
          this.intervalTime = intervalMinutes * 60 * 1000;
          console.log(`从数据库加载直播监控频率: ${intervalMinutes}分钟`);
        }
      }
    } catch (error) {
      console.error('加载直播监控频率设置失败:', error);
    }
  }

  // 保存监控频率到数据库
  async saveIntervalToDb(minutes) {
    try {
      const [existing] = await db.execute('SELECT id FROM bot_settings WHERE user_id IS NULL AND setting_key = ?', ['live_monitor_interval']);
      if (existing.length > 0) {
        await db.execute('UPDATE bot_settings SET setting_value = ?, status = 1, description = ? WHERE user_id IS NULL AND setting_key = ?', [minutes.toString(), '直播监控频率（分钟）', 'live_monitor_interval']);
      } else {
        await db.execute('INSERT INTO bot_settings (user_id, setting_key, setting_value, status, description, setting_type, category) VALUES (?, ?, ?, ?, ?, ?, ?)', [null, 'live_monitor_interval', minutes.toString(), 1, '直播监控频率（分钟）', 'number', 'monitor']);
      }
      console.log(`保存直播监控频率到数据库: ${minutes}分钟`);
    } catch (error) {
      console.error('保存直播监控频率设置失败:', error);
    }
  }

  // 设置监控频率（分钟）
  async setIntervalTime(minutes) {
    this.intervalTime = minutes * 60 * 1000;
    console.log(`直播监控频率已设置为 ${minutes} 分钟`);
    
    // 保存到数据库
    await this.saveIntervalToDb(minutes);
    
    // 如果监控正在运行，重新启动以应用新的频率
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  // 启动直播监控
  async start() {
    if (this.isRunning) {
      return { success: false, message: '监控已经在运行' };
    }

    // 从数据库加载监控频率
    await this.loadIntervalFromDb();

    this.isRunning = true;
    console.log('直播监控已启动');

    // 按照设置的频率检查直播状态
    this.monitorInterval = setInterval(async () => {
      await this.checkLiveStatus();
    }, this.intervalTime);

    // 立即执行一次
    await this.checkLiveStatus();

    return { success: true, message: '直播监控已启动' };
  }

  // 停止直播监控
  stop() {
    if (!this.isRunning) {
      return { success: false, message: '监控未运行' };
    }

    clearInterval(this.monitorInterval);
    this.isRunning = false;
    console.log('直播监控已停止');

    return { success: true, message: '直播监控已停止' };
  }

  // 检查直播状态
  async checkLiveStatus() {
    try {
      // 从数据库获取所有主播
      const [vtbs] = await db.execute('SELECT * FROM vtbs');
      
      console.log(`获取到 ${vtbs.length} 个主播`);

      for (const vtb of vtbs) {
        try {
          // 这里应该调用具体的直播平台API检查直播状态
          // 暂时模拟直播状态
          const isLive = Math.random() > 0.7; // 30%的概率直播中

          // 更新直播状态
          await this.updateLiveStatus(vtb.id, isLive);
        } catch (error) {
          console.error(`检查主播 ${vtb.username} 直播状态失败:`, error);
        }
      }

      console.log('直播状态检查完成');
    } catch (error) {
      console.error('直播监控出错:', error);
    }
  }

  // 更新直播状态
  async updateLiveStatus(vtbId, isLive) {
    try {
      // 检查是否已有直播状态记录
      const [existing] = await db.execute('SELECT * FROM live_status WHERE vtbId = ?', [vtbId]);
      
      // 获取主播信息
      const [vtbInfo] = await db.execute('SELECT targetUrl FROM vtbs WHERE id = ?', [vtbId]);
      const targetUrl = vtbInfo.length > 0 ? vtbInfo[0].targetUrl : null;

      if (existing.length > 0) {
        // 更新现有记录
        await db.execute(
          'UPDATE live_status SET isLive = ?, targetUrl = ?, updatedAt = CURRENT_TIMESTAMP WHERE vtbId = ?',
          [isLive, targetUrl, vtbId]
        );
      } else {
        // 创建新记录
        await db.execute(
          'INSERT INTO live_status (vtbId, isLive, targetUrl, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
          [vtbId, isLive, targetUrl]
        );
      }

      // 记录监控日志
      await db.execute(
        'INSERT INTO monitor_logs (type, targetId, message, createdAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        ['live', vtbId, `直播状态: ${isLive ? '直播中' : '未直播'}`]
      );
    } catch (error) {
      console.error('更新直播状态失败:', error);
    }
  }

  // 获取直播监控状态
  async getStatus() {
    try {
      // 获取所有直播状态
      const [liveStatus] = await db.execute('SELECT ls.*, v.username, v.site, v.targetUrl FROM live_status ls JOIN vtbs v ON ls.vtbId = v.id');

      return {
        isRunning: this.isRunning,
        liveCount: liveStatus.filter(item => item.isLive).length,
        totalCount: liveStatus.length,
        statusList: liveStatus
      };
    } catch (error) {
      console.error('获取直播监控状态失败:', error);
      return { isRunning: this.isRunning, error: error.message };
    }
  }
}

module.exports = new LiveMonitor();