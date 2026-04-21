const db = require('../../config/db');
const LivePlatformSpider = require('./live-platform-spider');
const ContentSpider = require('./content-spider');
const { logSpider, info, error } = require('../../utils/log-utils');

class SpiderManager {
  constructor() {
    this.spiders = new Map(); // 存储爬虫实例
  }

  // 初始化爬虫
  async initialize() {
    try {
      // 从数据库获取所有爬虫配置
      const [spiderConfigs] = await db.execute('SELECT * FROM spider_configs WHERE isEnabled = true');

      info(`发现 ${spiderConfigs.length} 个启用的爬虫配置`);
      logSpider('manager', 'initialize', 'success', `发现 ${spiderConfigs.length} 个启用的爬虫配置`);
      info('爬虫初始化完成，等待手动启动');
    } catch (err) {
      error('爬虫初始化失败:', err);
      logSpider('manager', 'initialize', 'error', err.message);
    }
  }

  // 创建爬虫实例
  async createSpider(config) {
    try {
      let spider;

      // 根据类型创建不同的爬虫
      switch (config.type) {
        case 'live':
          spider = new LivePlatformSpider(config);
          break;
        case 'content':
          spider = new ContentSpider(config);
          break;
        default:
          error(`未知的爬虫类型: ${config.type}`);
          logSpider(config.name || 'unknown', 'create', 'error', `未知的爬虫类型: ${config.type}`);
          return;
      }

      // 启动爬虫
      await spider.start();

      // 存储爬虫实例
      this.spiders.set(config.id, spider);

      info(`爬虫 ${config.name} 已创建并启动`);
      logSpider(config.name, 'create', 'success', '爬虫已创建并启动');
    } catch (err) {
      error(`创建爬虫 ${config.name} 失败:`, err);
      logSpider(config.name || 'unknown', 'create', 'error', err.message);
    }
  }

  // 停止所有爬虫
  async stopAllSpiders() {
    // 直接更新数据库中所有爬虫的状态为禁用
    await db.execute('UPDATE spider_configs SET isEnabled = false, updatedAt = CURRENT_TIMESTAMP');
    
    // 异步停止所有爬虫实例
    setTimeout(async () => {
      for (const [id, spider] of this.spiders.entries()) {
        await spider.stop();
        this.spiders.delete(id);
      }
      info('所有爬虫已停止');
      logSpider('manager', 'stopAll', 'success', '所有爬虫已停止');
    }, 0);
  }

  // 启动所有爬虫
  async startAllSpiders() {
    // 直接更新数据库中所有爬虫的状态为启用
    await db.execute('UPDATE spider_configs SET isEnabled = true, updatedAt = CURRENT_TIMESTAMP');
    
    info('所有爬虫已启动');
    logSpider('manager', 'startAll', 'success', '所有爬虫已启动');
  }

  // 获取爬虫状态
  async getSpiderStatus() {
    const statusList = [];

    for (const [id, spider] of this.spiders.entries()) {
      statusList.push(spider.getStatus());
    }

    return {
      totalCount: this.spiders.size,
      runningCount: statusList.filter(item => item.isRunning).length,
      statusList
    };
  }

  // 添加爬虫
  async addSpider(config) {
    try {
      // 确保所有参数都有值，避免undefined
      const name = config.name || 'unknown';
      const type = config.type || 'live';
      const url = config.url || '';
      const crawlInterval = config.interval !== undefined ? parseInt(config.interval, 10) : 300;
      const isEnabled = config.isEnabled !== undefined ? config.isEnabled : true;
      const testKeyword = config.testKeyword !== undefined ? config.testKeyword : null;
      const callFunction = config.callFunction !== undefined ? config.callFunction : null;

      // 插入数据库
      const [result] = await db.execute(
        'INSERT INTO spider_configs (name, type, url, crawlInterval, isEnabled, testKeyword, callFunction, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [name, type, url, crawlInterval, isEnabled, testKeyword, callFunction]
      );

      info(`爬虫 ${name} 添加成功`);
      logSpider(name, 'add', 'success', '爬虫添加成功');
      return { success: true, message: '爬虫添加成功' };
    } catch (err) {
      error('添加爬虫失败:', err);
      logSpider(config.name || 'unknown', 'add', 'error', err.message);
      return { success: false, message: '添加爬虫失败', error: err.message };
    }
  }

  // 删除爬虫
  async deleteSpider(spiderId) {
    try {
      // 停止爬虫
      const spider = this.spiders.get(spiderId);
      if (spider) {
        await spider.stop();
        this.spiders.delete(spiderId);
      }

      // 从数据库删除
      await db.execute('DELETE FROM spider_configs WHERE id = ?', [spiderId]);

      info(`爬虫 ${spiderId} 删除成功`);
      logSpider(spiderId.toString(), 'delete', 'success', '爬虫删除成功');
      return { success: true, message: '爬虫删除成功' };
    } catch (err) {
      error('删除爬虫失败:', err);
      logSpider(spiderId.toString(), 'delete', 'error', err.message);
      return { success: false, message: '删除爬虫失败', error: err.message };
    }
  }

  // 更新爬虫配置
  async updateSpider(spiderId, config) {
    try {
      info('更新爬虫配置:', spiderId, config);
      
      // 先从数据库获取爬虫的当前配置
      const [existingSpiders] = await db.execute('SELECT * FROM spider_configs WHERE id = ?', [spiderId]);
      if (existingSpiders.length === 0) {
        return { success: false, message: '爬虫不存在' };
      }
      
      const existingSpider = existingSpiders[0];
      info('现有爬虫配置:', existingSpider);
      
      // 停止旧爬虫
      const oldSpider = this.spiders.get(spiderId);
      if (oldSpider) {
        await oldSpider.stop();
        this.spiders.delete(spiderId);
      }

      // 准备更新参数，确保所有参数都有值
      const name = config.name || existingSpider.name || 'unknown';
      const type = config.type || existingSpider.type || 'live';
      const url = config.url || existingSpider.url || 'https://example.com';
      // 将 interval 转换为数字，处理字符串类型的数字
      const crawlInterval = config.interval !== undefined ? parseInt(config.interval, 10) : (existingSpider.crawlInterval || 300);
      const isEnabled = config.isEnabled !== undefined ? config.isEnabled : (existingSpider.isEnabled || 0);
      const testKeyword = config.testKeyword !== undefined ? config.testKeyword : (existingSpider.testKeyword || null);
      const callFunction = config.callFunction !== undefined ? config.callFunction : (existingSpider.callFunction || null);

      // 确保所有参数都不是 undefined
      const finalName = typeof name === 'string' ? name : 'unknown';
      const finalType = typeof type === 'string' ? type : 'live';
      const finalUrl = typeof url === 'string' ? url : 'https://example.com';
      const finalCrawlInterval = typeof crawlInterval === 'number' ? crawlInterval : 300;
      const finalIsEnabled = typeof isEnabled === 'number' ? isEnabled : 0;
      const finalTestKeyword = typeof testKeyword === 'string' ? testKeyword : null;
      const finalCallFunction = typeof callFunction === 'string' ? callFunction : null;

      // 更新数据库
      await db.execute(
        'UPDATE spider_configs SET name = ?, type = ?, url = ?, crawlInterval = ?, isEnabled = ?, testKeyword = ?, callFunction = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [finalName, finalType, finalUrl, finalCrawlInterval, finalIsEnabled, finalTestKeyword, finalCallFunction, spiderId]
      );

      info(`爬虫 ${finalName} 更新成功`);
      logSpider(finalName, 'update', 'success', '爬虫更新成功');
      return { success: true, message: '爬虫更新成功' };
    } catch (err) {
      error('更新爬虫失败:', err);
      logSpider('unknown', 'update', 'error', err.message);
      return { success: false, message: '更新爬虫失败', error: err.message };
    }
  }

  // 根据名称更新爬虫状态
  async updateSpiderStatus(name, isEnabled) {
    try {
      info('根据名称更新爬虫状态:', name, isEnabled);
      
      // 先从数据库获取爬虫的当前配置
      const [existingSpiders] = await db.execute('SELECT * FROM spider_configs WHERE name = ?', [name]);
      if (existingSpiders.length === 0) {
        return { success: false, message: '爬虫不存在' };
      }
      
      // 确保 isEnabled 是数字
      const finalIsEnabled = typeof isEnabled === 'number' ? isEnabled : (isEnabled ? 1 : 0);

      // 更新数据库
      await db.execute(
        'UPDATE spider_configs SET isEnabled = ?, updatedAt = CURRENT_TIMESTAMP WHERE name = ?',
        [finalIsEnabled, name]
      );

      info(`爬虫 ${name} 状态更新为 ${finalIsEnabled ? '启用' : '禁用'}`);
      logSpider(name, 'updateStatus', 'success', `状态更新为 ${finalIsEnabled ? '启用' : '禁用'}`);
      return { success: true, message: '爬虫状态更新成功' };
    } catch (err) {
      error('更新爬虫状态失败:', err);
      logSpider(name, 'updateStatus', 'error', err.message);
      return { success: false, message: '更新爬虫状态失败', error: err.message };
    }
  }
}

module.exports = new SpiderManager();