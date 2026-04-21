const BaseSpider = require('./base-spider');
const db = require('../../config/db');

class LivePlatformSpider extends BaseSpider {
  constructor(config) {
    super(config);
    this.platform = config.platform || 'unknown';
  }

  // 解析页面
  async parsePage(html) {
    // 这里根据不同平台的页面结构进行解析
    // 暂时返回模拟数据
    return [
      {
        username: 'test-streamer-1',
        roomId: '123456',
        title: '测试直播 1',
        viewers: 1234,
        isLive: true,
        platform: this.platform
      },
      {
        username: 'test-streamer-2',
        roomId: '789012',
        title: '测试直播 2',
        viewers: 5678,
        isLive: false,
        platform: this.platform
      }
    ];
  }

  // 处理数据
  async processData(data) {
    for (const streamer of data) {
      try {
        // 检查是否已存在
        const [existing] = await db.execute('SELECT * FROM vtbs WHERE username = ? AND site = ?', [streamer.username, this.platform]);

        if (existing.length > 0) {
          // 更新现有记录
          await db.execute(
            'UPDATE vtbs SET roomid = ?, title = ?, isLive = ?, viewers = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [streamer.roomId, streamer.title, streamer.isLive, streamer.viewers, existing[0].id]
          );
        } else {
          // 创建新记录
          await db.execute(
            'INSERT INTO vtbs (username, roomid, title, site, isLive, viewers, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            [streamer.username, streamer.roomId, streamer.title, this.platform, streamer.isLive, streamer.viewers]
          );
        }
      } catch (error) {
        console.error(`处理主播 ${streamer.username} 数据失败:`, error);
      }
    }
  }
}

module.exports = LivePlatformSpider;