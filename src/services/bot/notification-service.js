const db = require('../../config/db');

class NotificationService {
  async sendSystemNotification(message, userId = null) {
    try {
      console.log(`发送系统通知: ${message}`);
      
      if (userId) {
        await db.execute(
          'INSERT INTO notifications (userId, message, type, createdAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
          [userId, message, 'system']
        );
      } else {
        await db.execute(
          'INSERT INTO notifications (message, type, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [message, 'system']
        );
      }

      return { success: true, message: '通知发送成功' };
    } catch (error) {
      console.error('发送系统通知失败:', error);
      return { success: false, message: '发送通知失败', error: error.message };
    }
  }

  async getUserNotifications(userId) {
    try {
      const [notifications] = await db.execute(
        'SELECT * FROM notifications WHERE userId = ? OR userId IS NULL ORDER BY createdAt DESC LIMIT 50',
        [userId]
      );

      return { success: true, notifications };
    } catch (error) {
      console.error('获取用户通知失败:', error);
      return { success: false, message: '获取通知失败', error: error.message };
    }
  }

  async markAsRead(notificationId) {
    try {
      await db.execute(
        'UPDATE notifications SET isRead = true WHERE id = ?',
        [notificationId]
      );

      return { success: true, message: '通知已标记为已读' };
    } catch (error) {
      console.error('标记通知为已读失败:', error);
      return { success: false, message: '标记失败', error: error.message };
    }
  }
}

module.exports = new NotificationService();