const { info, error, warn, logMessage } = require('../utils/logger.js');
const { pool } = require('../config/database');

class MessageService {
  constructor(bot) {
    this.bot = bot;
  }

  async saveMessage(originalMsg, sentMsg, direction = 'outgoing', messageType = 'text', extraData = {}) {
    try {
      const from = originalMsg.from;
      if (!from) return;

      info(`[faBuBot] 保存${direction}消息: 类型=${messageType}, 用户ID=${from.id}, 消息ID=${sentMsg.message_id}`);

      const conn = await pool.getConnection();
      try {
        let content = extraData.content || '';
        let fileId = extraData.file_id || null;
        let fileUniqueId = extraData.file_unique_id || null;
        let fileSize = extraData.file_size || null;
        let mimeType = extraData.mime_type || null;
        let duration = extraData.duration || null;
        let width = extraData.width || null;
        let height = extraData.height || null;
        let caption = extraData.caption || null;

        await conn.execute(
          `INSERT INTO fabubot_messages 
           (user_id, chat_id, message_id, direction, message_type, 
            content, file_id, file_unique_id, file_size, mime_type, 
            duration, width, height, caption, reply_to_message_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            from.id,
            sentMsg.chat.id,
            sentMsg.message_id,
            direction,
            messageType,
            content,
            fileId,
            fileUniqueId,
            fileSize,
            mimeType,
            duration,
            width,
            height,
            caption,
            originalMsg.reply_to_message ? originalMsg.reply_to_message.message_id : null
          ]
        );
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 保存消息失败:', err);
    }
  }

  async sendText(chatId, text, options = {}, originalMsg = null) {
    try {
      info(`[faBuBot] 发送文本消息: 聊天ID=${chatId}`);
      let sentMsg;
      try {
        sentMsg = await this.bot.sendMessage(chatId, text, options);
      } catch (formatErr) {
        warn('[faBuBot] 格式化消息失败，尝试纯文本格式:', formatErr);
        const plainOptions = { ...options };
        delete plainOptions.parse_mode;
        sentMsg = await this.bot.sendMessage(chatId, text, plainOptions);
      }
      if (originalMsg) {
        await this.saveMessage(originalMsg, sentMsg, 'outgoing', 'text', { content: text });
      }
      return sentMsg;
    } catch (err) {
      error('[faBuBot] 发送文本消息失败:', err);
      throw err;
    }
  }

  async sendPhoto(chatId, photo, options = {}, originalMsg = null) {
    try {
      info(`[faBuBot] 发送图片: 聊天ID=${chatId}`);
      let sentMsg;
      try {
        sentMsg = await this.bot.sendPhoto(chatId, photo, options);
      } catch (formatErr) {
        warn('[faBuBot] 图片格式化消息失败，尝试纯文本:', formatErr);
        const plainOptions = { ...options };
        delete plainOptions.parse_mode;
        sentMsg = await this.bot.sendPhoto(chatId, photo, plainOptions);
      }
      if (originalMsg && sentMsg.photo && sentMsg.photo.length > 0) {
        const photoData = sentMsg.photo[sentMsg.photo.length - 1];
        await this.saveMessage(originalMsg, sentMsg, 'outgoing', 'photo', {
          content: `[图片] ${options.caption || ''}`,
          file_id: photoData.file_id,
          file_unique_id: photoData.file_unique_id,
          file_size: photoData.file_size,
          width: photoData.width,
          height: photoData.height,
          caption: options.caption || null
        });
      }
      return sentMsg;
    } catch (err) {
      error('[faBuBot] 发送图片失败:', err);
      throw err;
    }
  }

  async sendVideo(chatId, video, options = {}, originalMsg = null) {
    try {
      info(`[faBuBot] 发送视频: 聊天ID=${chatId}`);
      let sentMsg;
      try {
        sentMsg = await this.bot.sendVideo(chatId, video, options);
      } catch (formatErr) {
        warn('[faBuBot] 视频格式化消息失败，尝试纯文本:', formatErr);
        const plainOptions = { ...options };
        delete plainOptions.parse_mode;
        sentMsg = await this.bot.sendVideo(chatId, video, plainOptions);
      }
      if (originalMsg && sentMsg.video) {
        await this.saveMessage(originalMsg, sentMsg, 'outgoing', 'video', {
          content: `[视频] ${options.caption || ''}`,
          file_id: sentMsg.video.file_id,
          file_unique_id: sentMsg.video.file_unique_id,
          file_size: sentMsg.video.file_size,
          mime_type: sentMsg.video.mime_type,
          duration: sentMsg.video.duration,
          width: sentMsg.video.width,
          height: sentMsg.video.height,
          caption: options.caption || null
        });
      }
      return sentMsg;
    } catch (err) {
      error('[faBuBot] 发送视频失败:', err);
      throw err;
    }
  }

  async sendDocument(chatId, document, options = {}, originalMsg = null) {
    try {
      info(`[faBuBot] 发送文档: 聊天ID=${chatId}`);
      let sentMsg;
      try {
        sentMsg = await this.bot.sendDocument(chatId, document, options);
      } catch (formatErr) {
        warn('[faBuBot] 文档格式化消息失败，尝试纯文本:', formatErr);
        const plainOptions = { ...options };
        delete plainOptions.parse_mode;
        sentMsg = await this.bot.sendDocument(chatId, document, plainOptions);
      }
      if (originalMsg && sentMsg.document) {
        await this.saveMessage(originalMsg, sentMsg, 'outgoing', 'document', {
          content: `[文件] ${sentMsg.document.file_name || ''} ${options.caption || ''}`,
          file_id: sentMsg.document.file_id,
          file_unique_id: sentMsg.document.file_unique_id,
          file_size: sentMsg.document.file_size,
          mime_type: sentMsg.document.mime_type,
          caption: options.caption || null
        });
      }
      return sentMsg;
    } catch (err) {
      error('[faBuBot] 发送文档失败:', err);
      throw err;
    }
  }

  async sendAudio(chatId, audio, options = {}, originalMsg = null) {
    try {
      info(`[faBuBot] 发送音频: 聊天ID=${chatId}`);
      let sentMsg;
      try {
        sentMsg = await this.bot.sendAudio(chatId, audio, options);
      } catch (formatErr) {
        warn('[faBuBot] 音频格式化消息失败，尝试纯文本:', formatErr);
        const plainOptions = { ...options };
        delete plainOptions.parse_mode;
        sentMsg = await this.bot.sendAudio(chatId, audio, plainOptions);
      }
      if (originalMsg && sentMsg.audio) {
        await this.saveMessage(originalMsg, sentMsg, 'outgoing', 'audio', {
          content: '[音频]',
          file_id: sentMsg.audio.file_id,
          file_unique_id: sentMsg.audio.file_unique_id,
          file_size: sentMsg.audio.file_size,
          mime_type: sentMsg.audio.mime_type,
          duration: sentMsg.audio.duration
        });
      }
      return sentMsg;
    } catch (err) {
      error('[faBuBot] 发送音频失败:', err);
      throw err;
    }
  }

  async sendMediaGroup(chatId, media, options = {}, originalMsg = null) {
    try {
      info(`[faBuBot] 发送媒体组: 聊天ID=${chatId}, 媒体数=${media.length}`);
      let sentMessages;
      try {
        sentMessages = await this.bot.sendMediaGroup(chatId, media, options);
      } catch (formatErr) {
        warn('[faBuBot] 媒体组格式化消息失败，尝试纯文本:', formatErr);
        const plainOptions = { ...options };
        delete plainOptions.parse_mode;
        const plainMedia = media.map(m => {
          const copy = { ...m };
          delete copy.parse_mode;
          return copy;
        });
        sentMessages = await this.bot.sendMediaGroup(chatId, plainMedia, plainOptions);
      }
      if (originalMsg && sentMessages && sentMessages.length > 0) {
        for (let i = 0; i < sentMessages.length; i++) {
          const sentMsg = sentMessages[i];
          let messageType = 'photo';
          let extraData = {};

          if (sentMsg.photo && sentMsg.photo.length > 0) {
            const photoData = sentMsg.photo[sentMsg.photo.length - 1];
            messageType = 'photo';
            extraData = {
              content: `[媒体组图片 ${i + 1}] ${sentMsg.caption || ''}`,
              file_id: photoData.file_id,
              file_unique_id: photoData.file_unique_id,
              file_size: photoData.file_size,
              width: photoData.width,
              height: photoData.height,
              caption: sentMsg.caption || null
            };
          } else if (sentMsg.video) {
            messageType = 'video';
            extraData = {
              content: `[媒体组视频 ${i + 1}] ${sentMsg.caption || ''}`,
              file_id: sentMsg.video.file_id,
              file_unique_id: sentMsg.video.file_unique_id,
              file_size: sentMsg.video.file_size,
              mime_type: sentMsg.video.mime_type,
              duration: sentMsg.video.duration,
              width: sentMsg.video.width,
              height: sentMsg.video.height,
              caption: sentMsg.caption || null
            };
          }

          await this.saveMessage(originalMsg, sentMsg, 'outgoing', messageType, extraData);
        }
      }
      return sentMessages;
    } catch (err) {
      error('[faBuBot] 发送媒体组失败:', err);
      throw err;
    }
  }
}

module.exports = MessageService;
