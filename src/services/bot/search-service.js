const db = require('../../config/db');

class SearchService {
  // 搜索直播
  async searchLive(keyword) {
    try {
      console.log(`搜索直播: ${keyword}`);

      const [results] = await db.execute(
        'SELECT * FROM vtbs WHERE username LIKE ? OR title LIKE ?',
        [`%${keyword}%`, `%${keyword}%`]
      );

      return { success: true, results };
    } catch (error) {
      console.error('搜索直播失败:', error);
      return { success: false, message: '搜索直播失败', error: error.message };
    }
  }

  // 搜索用户
  async searchUser(keyword) {
    try {
      console.log(`搜索用户: ${keyword}`);

      const [results] = await db.execute(
        'SELECT * FROM users WHERE username LIKE ?',
        [`%${keyword}%`]
      );

      return { success: true, results };
    } catch (error) {
      console.error('搜索用户失败:', error);
      return { success: false, message: '搜索用户失败', error: error.message };
    }
  }

  // 搜索内容
  async searchContent(keyword, category = 'all') {
    try {
      console.log(`搜索内容: ${keyword} (分类: ${category})`);

      let query = 'SELECT * FROM content_items WHERE title LIKE ? OR content LIKE ?';
      const params = [`%${keyword}%`, `%${keyword}%`];

      if (category !== 'all') {
        query += ' AND category = ?';
        params.push(category);
      }

      query += ' ORDER BY publishTime DESC';

      const [results] = await db.execute(query, params);

      return { success: true, results };
    } catch (error) {
      console.error('搜索内容失败:', error);
      return { success: false, message: '搜索内容失败', error: error.message };
    }
  }

  // 搜索日志
  async searchLogs(keyword, type = 'all') {
    try {
      console.log(`搜索日志: ${keyword} (类型: ${type})`);

      let query = '';
      const params = [`%${keyword}%`];

      switch (type) {
        case 'system':
          query = 'SELECT * FROM system_logs WHERE message LIKE ? ORDER BY createdAt DESC';
          break;
        case 'monitor':
          query = 'SELECT * FROM monitor_logs WHERE message LIKE ? ORDER BY createdAt DESC';
          break;
        case 'spider':
          query = 'SELECT * FROM spider_logs WHERE message LIKE ? ORDER BY createdAt DESC';
          break;
        case 'task':
          query = 'SELECT * FROM task_execution_logs WHERE message LIKE ? ORDER BY createdAt DESC';
          break;
        default:
          // 搜索所有类型的日志
          query = `
            SELECT id, 'system' as type, message, createdAt FROM system_logs WHERE message LIKE ?
            UNION ALL
            SELECT id, 'monitor' as type, message, createdAt FROM monitor_logs WHERE message LIKE ?
            UNION ALL
            SELECT id, 'spider' as type, message, createdAt FROM spider_logs WHERE message LIKE ?
            UNION ALL
            SELECT id, 'task' as type, message, createdAt FROM task_execution_logs WHERE message LIKE ?
            ORDER BY createdAt DESC
          `;
          params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }

      const [results] = await db.execute(query, params);

      return { success: true, results };
    } catch (error) {
      console.error('搜索日志失败:', error);
      return { success: false, message: '搜索日志失败', error: error.message };
    }
  }
}

module.exports = new SearchService();