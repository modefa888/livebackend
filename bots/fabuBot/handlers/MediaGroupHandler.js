const { info, error, warn, logMessage } = require('../utils/logger.js');
const { pool } = require('../config/database');

class MediaGroupHandler {
  constructor(bot, currentConfig, messageService) {
    this.bot = bot;
    this.pool = pool;
    this.config = currentConfig;
    this.messageService = messageService;
    this.mediaGroupCache = new Map();
  }

  _escapeHTML(text) {
    if (!text) return undefined;
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async handleMessage(msg) {
    try {
      if (!msg.media_group_id) return;

      const mgId = msg.media_group_id;
      const timestamp = new Date(msg.date * 1000);
      
      info(`[faBuBot] 处理媒体组: 媒体组ID=${mgId}, 消息ID=${msg.message_id}`);

      if (!this.mediaGroupCache.has(mgId)) {
        this._initializeMediaGroupCache(msg, mgId);
      }

      const cache = this.mediaGroupCache.get(mgId);
      const mediaData = this._extractMediaData(msg);

      if (mediaData) {
        cache.mediaItems.push({
          ...mediaData,
          timestamp
        });

        clearTimeout(cache.timer);
        cache.timer = setTimeout(() => this.finalizeMediaGroup(mgId), 2500);
        
        info(`[faBuBot] 媒体组已添加 ${cache.mediaItems.length} 个项目`);
      }
    } catch (err) {
      error(`[faBuBot] 媒体组消息处理失败 [${msg.message_id}]:`, err);
    }
  }

  _initializeMediaGroupCache(msg, mgId) {
    this.mediaGroupCache.set(mgId, {
      chatInfo: {
        id: msg.chat.id,
        type: msg.chat.type
      },
      userInfo: {
        id: msg.from.id,
        username: msg.from.username || null,
        firstName: msg.from.first_name || null,
        lastName: msg.from.last_name || null
      },
      mediaItems: [],
      timer: setTimeout(() => this.finalizeMediaGroup(mgId), 2500)
    });
  }

  _extractMediaData(msg) {
    let mediaType, fileId;

    if (msg.photo) {
      mediaType = 'photo';
      fileId = msg.photo[msg.photo.length - 1].file_id;
    } else if (msg.video) {
      mediaType = 'video';
      fileId = msg.video.file_id;
    } else if (msg.document) {
      mediaType = 'document';
      fileId = msg.document.file_id;
    } else if (msg.audio) {
      mediaType = 'audio';
      fileId = msg.audio.file_id;
    }

    return mediaType ? {
      type: mediaType,
      fileId,
      caption: msg.caption || null
    } : null;
  }

  async finalizeMediaGroup(mgId) {
    const cache = this.mediaGroupCache.get(mgId);
    if (!cache) return;

    const chatId = cache.chatInfo.id;
    const conn = await this.pool.getConnection();

    try {
      await conn.beginTransaction();

      const [groupResult] = await conn.query(
        `INSERT INTO fabubot_media_groups 
          (media_group_id, chat_id, chat_type, user_id, username, first_name, last_name, message_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           message_count = VALUES(message_count)`,
        [
          mgId,
          cache.chatInfo.id,
          cache.chatInfo.type,
          cache.userInfo.id,
          cache.userInfo.username,
          cache.userInfo.firstName,
          cache.userInfo.lastName,
          cache.mediaItems.length
        ]
      );

      await Promise.all(
        cache.mediaItems.map(item =>
          conn.query(
            `INSERT INTO fabubot_media_items 
              (media_group_id, type, file_id, caption, timestamp)
             VALUES (?, ?, ?, ?, ?)`,
            [mgId, item.type, item.fileId, item.caption, item.timestamp]
          )
        )
      );

      await conn.commit();
      info(`媒体组保存成功: ${mgId} (${cache.mediaItems.length} 项)`);

      await this.messageService.sendText(
        chatId,
        `✅ 已保存 ${cache.mediaItems.length} 个文件 (ID: ${mgId.slice(-6)})`,
        {},
        { from: { id: cache.userInfo.id } }
      );

      await this._resendSavedMedia(chatId, cache.mediaItems, { from: { id: cache.userInfo.id } });

    } catch (err) {
      await conn.rollback();
      error(`保存失败 [${mgId}]:`, err.message);
      await this.messageService.sendText(
        chatId,
        `❌ 保存失败: ${err.message.split(':')[0]}`,
        {},
        { from: { id: cache.userInfo.id } }
      );
    } finally {
      conn.release();
      this.mediaGroupCache.delete(mgId);
    }

    // 从 fabubot_configs 表获取转发目标群组列表
    let forwardChatIds = [];
    try {
      const conn = await this.pool.getConnection();
      try {
        const [configs] = await conn.execute(
          'SELECT config_value FROM fabubot_configs WHERE config_key = ?',
          ['FORWARD_CHAT_ID']
        );
        
        if (configs.length > 0 && configs[0].config_value) {
          try {
            forwardChatIds = JSON.parse(configs[0].config_value);
            // 确保每个ID都是数值类型
            forwardChatIds = forwardChatIds.map(id => Number(id));
          } catch (e) {
            // 如果不是有效的JSON，尝试作为单个ID处理
            forwardChatIds = [Number(configs[0].config_value)];
          }
        }
        
        // 确保是数组
        if (!Array.isArray(forwardChatIds)) {
          forwardChatIds = [];
        }
        
        // 如果数据库没有配置，回退到原来的 config 中的设置
        if (forwardChatIds.length === 0 && this.config.FORWARD_CHAT_ID) {
          forwardChatIds = [this.config.FORWARD_CHAT_ID];
        }
      } finally {
        conn.release();
      }
    } catch (err) {
      error(`获取转发设置失败: ${err.message}`);
      // 回退到原来的配置
      if (this.config.FORWARD_CHAT_ID) {
        forwardChatIds = [this.config.FORWARD_CHAT_ID];
      }
    }

    let forwardedMessageIds = {};
    if (forwardChatIds.length > 0) {
      const mediaGroup = cache.mediaItems.map(item => ({
        type: item.type,
        media: item.fileId,
        caption: this._escapeHTML(item.caption),
        parse_mode: 'HTML'
      }));

      let successCount = 0;
      for (const targetChatId of forwardChatIds) {
        try {
          const sentMessages = await this.messageService.sendMediaGroup(
            targetChatId,
            mediaGroup,
            {},
            { from: { id: cache.userInfo.id } }
          );
          forwardedMessageIds[targetChatId] = sentMessages.map(msg => msg.message_id);
          info(`媒体组已转发至群组 ${targetChatId}，消息ID: ${forwardedMessageIds[targetChatId].join(', ')}`);
          successCount++;
        } catch (err) {
          error(`媒体组转发至群组 ${targetChatId} 失败: ${err.message}`);
        }
      }

      if (successCount > 0) {
        await this.messageService.sendText(
          chatId,
          `✅ 媒体组已转发至 ${successCount} 个群组`,
          {},
          { from: { id: cache.userInfo.id } }
        );
      } else if (forwardChatIds.length > 0) {
        await this.messageService.sendText(
          chatId,
          `❌ 媒体组转发失败，请检查设置`,
          {},
          { from: { id: cache.userInfo.id } }
        );
      }
    }

    if (Object.keys(forwardedMessageIds).length > 0) {
      try {
        const conn = await this.pool.getConnection();
        try {
          await conn.query(
            `UPDATE fabubot_media_groups 
             SET forwarded_message_ids = ?
             WHERE media_group_id = ?`,
            [JSON.stringify(forwardedMessageIds), mgId]
          );
          info(`转发消息ID已保存: ${mgId}`);
        } finally {
          conn.release();
        }
      } catch (err) {
        error(`保存转发消息ID失败: ${err.message}`);
      }
    }
  }

  async _resendSavedMedia(chatId, mediaItems, originalMsg) {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let lastError = null;

    const mediaGroup = mediaItems.map((item, index) => ({
      type: item.type,
      media: item.fileId,
      caption: index === 0 ? this._escapeHTML(item.caption) : undefined,
      parse_mode: 'HTML'
    }));

    while (attempt < MAX_RETRIES) {
      try {
        info(`[尝试 ${attempt + 1}/${MAX_RETRIES}] 发送媒体组...`);
        const sentMessages = await this.messageService.sendMediaGroup(chatId, mediaGroup, {}, originalMsg);

        await this.messageService.sendText(
          chatId,
          `✅ 已重新发送完整媒体组（共 ${mediaItems.length} 项）`,
          { reply_to_message_id: sentMessages[0].message_id },
          originalMsg
        );
        info(`发送媒体组成功！`);
        return;
      } catch (err) {
        lastError = err;
        attempt++;
        const delay = 1000 * Math.pow(2, attempt - 1);
        warn(`发送失败，${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    error(`所有 ${MAX_RETRIES} 次尝试均失败`);
    await this.messageService.sendText(
      chatId,
      `⚠️ 保存成功但媒体发送失败，错误代码：${lastError.response?.body?.error_code || '未知'}`,
      {},
      originalMsg
    );
  }
}

module.exports = MediaGroupHandler;
