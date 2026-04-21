const BaseSpider = require('./base-spider');
const db = require('../../config/db');

class ContentSpider extends BaseSpider {
  constructor(config) {
    super(config);
    this.category = config.category || 'general';
  }

  // 解析页面
  async parsePage(html) {
    // 这里根据不同网站的页面结构进行解析
    // 暂时返回模拟数据
    return [
      {
        title: '测试新闻 1',
        content: '这是测试新闻 1 的内容',
        url: 'https://example.com/news/1',
        category: this.category,
        publishTime: new Date().toISOString()
      },
      {
        title: '测试新闻 2',
        content: '这是测试新闻 2 的内容',
        url: 'https://example.com/news/2',
        category: this.category,
        publishTime: new Date().toISOString()
      }
    ];
  }

  // 处理数据
  async processData(data) {
    for (const item of data) {
      try {
        // 检查是否已存在
        const [existing] = await db.execute('SELECT * FROM content_items WHERE url = ?', [item.url]);

        if (existing.length === 0) {
          // 创建新记录
          await db.execute(
            'INSERT INTO content_items (title, content, url, category, publishTime, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            [item.title, item.content, item.url, item.category, item.publishTime]
          );
        }
      } catch (error) {
        console.error(`处理内容 ${item.title} 数据失败:`, error);
      }
    }
  }
}

module.exports = ContentSpider;