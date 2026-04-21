const db = require('../../config/db');

class SpiderMonitor {
  constructor() {
    this.isRunning = false;
    this.monitorInterval = null;
    this.spiders = new Map(); // 存储爬虫实例
    this.intervalTime = 3 * 60 * 1000; // 默认3分钟
  }

  // 从数据库加载监控频率
  async loadIntervalFromDb() {
    try {
      const [settings] = await db.execute('SELECT setting_value FROM bot_settings WHERE user_id IS NULL AND setting_key = ? AND status = 1', ['spider_monitor_interval']);
      if (settings && settings.length > 0 && settings[0].setting_value) {
        const intervalMinutes = parseInt(settings[0].setting_value);
        if (!isNaN(intervalMinutes) && intervalMinutes > 0) {
          this.intervalTime = intervalMinutes * 60 * 1000;
          console.log(`从数据库加载爬虫监控频率: ${intervalMinutes}分钟`);
        }
      }
    } catch (error) {
      console.error('加载爬虫监控频率设置失败:', error);
    }
  }

  // 保存监控频率到数据库
  async saveIntervalToDb(minutes) {
    try {
      const [existing] = await db.execute('SELECT id FROM bot_settings WHERE user_id IS NULL AND setting_key = ?', ['spider_monitor_interval']);
      if (existing.length > 0) {
        await db.execute('UPDATE bot_settings SET setting_value = ?, status = 1, description = ? WHERE user_id IS NULL AND setting_key = ?', [minutes.toString(), '爬虫监控频率（分钟）', 'spider_monitor_interval']);
      } else {
        await db.execute('INSERT INTO bot_settings (user_id, setting_key, setting_value, status, description, setting_type, category) VALUES (?, ?, ?, ?, ?, ?, ?)', [null, 'spider_monitor_interval', minutes.toString(), 1, '爬虫监控频率（分钟）', 'number', 'monitor']);
      }
      console.log(`保存爬虫监控频率到数据库: ${minutes}分钟`);
    } catch (error) {
      console.error('保存爬虫监控频率设置失败:', error);
    }
  }

  // 设置监控频率（分钟）
  async setIntervalTime(minutes) {
    this.intervalTime = minutes * 60 * 1000;
    console.log(`爬虫监控频率已设置为 ${minutes} 分钟`);
    
    // 保存到数据库
    await this.saveIntervalToDb(minutes);
    
    // 如果监控正在运行，重新启动以应用新的频率
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  // 启动爬虫监控
  async start() {
    if (this.isRunning) {
      return { success: false, message: '监控已经在运行' };
    }

    // 从数据库加载监控频率
    await this.loadIntervalFromDb();

    this.isRunning = true;
    console.log('爬虫监控已启动');

    // 启动所有爬虫
    await this.startAllSpiders();

    // 按照设置的频率检查爬虫状态
    this.monitorInterval = setInterval(async () => {
      await this.checkSpiderStatus();
    }, this.intervalTime);

    // 立即执行一次
    await this.checkSpiderStatus();

    return { success: true, message: '爬虫监控已启动' };
  }

  // 启动所有爬虫
  async startAllSpiders() {
    try {
      // 从数据库获取所有爬虫配置
      const [spiders] = await db.execute('SELECT * FROM spider_configs WHERE isEnabled = 1');

      for (const spider of spiders) {
        try {
          // 模拟启动爬虫
          console.log(`启动爬虫: ${spider.name}`);
          // 注册爬虫实例
          this.registerSpider(spider.id, { isRunning: true });
        } catch (error) {
          console.error(`启动爬虫 ${spider.name} 失败:`, error);
        }
      }

      console.log('所有爬虫已启动');
    } catch (error) {
      console.error('启动所有爬虫失败:', error);
    }
  }

  // 停止爬虫监控
  stop() {
    if (!this.isRunning) {
      return { success: false, message: '监控未运行' };
    }

    // 停止所有爬虫
    this.stopAllSpiders();

    clearInterval(this.monitorInterval);
    this.isRunning = false;
    console.log('爬虫监控已停止');

    return { success: true, message: '爬虫监控已停止' };
  }

  // 停止所有爬虫
  stopAllSpiders() {
    try {
      // 遍历所有已注册的爬虫
      this.spiders.forEach((spiderInstance, spiderId) => {
        try {
          // 模拟停止爬虫
          console.log(`停止爬虫: ${spiderId}`);
          // 更新爬虫状态
          spiderInstance.isRunning = false;
        } catch (error) {
          console.error(`停止爬虫 ${spiderId} 失败:`, error);
        }
      });

      console.log('所有爬虫已停止');
    } catch (error) {
      console.error('停止所有爬虫失败:', error);
    }
  }

  // 检查爬虫状态
  async checkSpiderStatus() {
    try {
      // 从数据库获取所有爬虫配置
      const [spiders] = await db.execute('SELECT * FROM spider_configs');

      for (const spider of spiders) {
        try {
          // 检查爬虫状态
          const spiderStatus = this.spiders.get(spider.id) || { isRunning: false };

          // 更新爬虫状态
          await this.updateSpiderStatus(spider.id, spiderStatus.isRunning);
        } catch (error) {
          console.error(`检查爬虫 ${spider.name} 状态失败:`, error);
        }
      }

      console.log('爬虫状态检查完成');
    } catch (error) {
      console.error('爬虫监控出错:', error);
    }
  }

  // 更新爬虫状态
  async updateSpiderStatus(spiderId, isRunning) {
    try {
      // 检查是否已有爬虫状态记录
      const [existing] = await db.execute('SELECT * FROM spider_logs WHERE spiderId = ? ORDER BY createdAt DESC LIMIT 1', [spiderId]);

      // 记录爬虫日志
      await db.execute(
        'INSERT INTO spider_logs (spiderId, status, message, createdAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [spiderId, isRunning ? 'running' : 'stopped', `爬虫状态: ${isRunning ? '运行中' : '已停止'}`]
      );
    } catch (error) {
      console.error('更新爬虫状态失败:', error);
    }
  }

  // 注册爬虫
  registerSpider(spiderId, spiderInstance) {
    this.spiders.set(spiderId, spiderInstance);
    console.log(`爬虫 ${spiderId} 已注册`);
  }

  // 移除爬虫
  removeSpider(spiderId) {
    this.spiders.delete(spiderId);
    console.log(`爬虫 ${spiderId} 已移除`);
  }

  // 获取爬虫监控状态
  async getStatus() {
    try {
      // 获取所有爬虫配置和状态
      const [spiders] = await db.execute('SELECT * FROM spider_configs');
      const statusList = [];

      for (const spider of spiders) {
        const spiderStatus = this.spiders.get(spider.id) || { isRunning: false };
        statusList.push({
          ...spider,
          isRunning: spiderStatus.isRunning
        });
      }

      return {
        isRunning: this.isRunning,
        runningCount: statusList.filter(item => item.isRunning).length,
        totalCount: statusList.length,
        statusList
      };
    } catch (error) {
      console.error('获取爬虫监控状态失败:', error);
      return { isRunning: this.isRunning, error: error.message };
    }
  }
}

module.exports = new SpiderMonitor();