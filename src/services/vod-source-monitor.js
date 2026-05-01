const logger = require('../utils/log-utils');
const pool = require('../config/db');
const axios = require('axios');

// 自动测速服务
class VodSourceMonitor {
  constructor() {
    this.monitorInterval = null;
    this.isRunning = false;
    this.intervalMinutes = 30; // 默认每30分钟测试一次
  }

  // 启动监控
  async start() {
    if (this.isRunning) {
      logger.info('VodSourceMonitor 已经在运行');
      return;
    }
    
    logger.info('🚀 启动影视资源自动测速监控');
    this.isRunning = true;
    
    // 异步执行一次，不阻塞启动
    this.testAllSources().catch(error => {
      logger.error('❌ 首次影视资源测试失败:', error);
    });
    
    // 设置定时任务
    this.monitorInterval = setInterval(async () => {
      await this.testAllSources();
    }, this.intervalMinutes * 60 * 1000);
    
    logger.info(`✅ 影视资源自动测速监控启动完成，间隔: ${this.intervalMinutes}分钟`);
  }

  // 停止监控
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isRunning = false;
    logger.info('⏹️ 影视资源自动测速监控已停止');
  }

  // 测试所有源
  async testAllSources() {
    try {
      const conn = await pool.getConnection();
      try {
        // 获取所有未删除的源
        const [sources] = await conn.execute(
          'SELECT * FROM fabubot_vod_sources WHERE deleted = 0'
        );
        
        if (sources.length === 0) {
          logger.info('没有需要测试的影视资源');
          return;
        }
        
        logger.info(`开始测试 ${sources.length} 个影视资源...`);
        
        // 并发测试，限制最大并发数为10
        const concurrency = 10;
        const results = [];
        const chunks = [];
        
        for (let i = 0; i < sources.length; i += concurrency) {
          chunks.push(sources.slice(i, i + concurrency));
        }
        
        for (const chunk of chunks) {
          const chunkResults = await Promise.all(
            chunk.map(source => this.testSingleSource(conn, source))
          );
          results.push(...chunkResults);
        }
        
        const successCount = results.filter(r => r.success).length;
        logger.info(`✅ 影视资源测试完成，成功: ${successCount}/${results.length}`);
        
      } finally {
        conn.release();
      }
    } catch (error) {
      logger.error('❌ 影视资源测试失败:', error);
    }
  }

  // 测试单个源
  async testSingleSource(conn, source) {
    const startTime = Date.now();
    let ping = null;
    let success = false;
    
    try {
      const response = await axios.get(source.url, {
        timeout: 5000
      });
      
      ping = Date.now() - startTime;
      success = true;
    } catch (error) {
      ping = null;
      success = false;
    }
    
    // 更新数据库
    const enabled = success ? 1 : 0;
    await conn.execute(
      'UPDATE fabubot_vod_sources SET ping = ?, enabled = ?, updated_at = NOW() WHERE id = ?',
      [ping, enabled, source.id]
    );
    
    return {
      id: source.id,
      name: source.name,
      ping: ping,
      success: success,
      enabled: enabled
    };
  }

  // 获取状态
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMinutes
    };
  }
}

// 单例模式
let instance = null;

function getVodSourceMonitor() {
  if (!instance) {
    instance = new VodSourceMonitor();
  }
  return instance;
}

module.exports = {
  getVodSourceMonitor
};
