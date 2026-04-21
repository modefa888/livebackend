const { info, error, warn, logMessage } = require('../utils/logger.js');
const { pool } = require('../config/database');

class VideoHandler {
  constructor(bot, currentConfig, messageService) {
    this.bot = bot;
    this.pool = pool;
    this.config = currentConfig;
    this.messageService = messageService;
  }

  async handleMessage(msg) {
    try {
      if (msg.media_group_id || !msg.video) return;

      info(`[faBuBot] 处理单个视频: 消息ID=${msg.message_id}, 用户ID=${msg.from.id}`);
      
      const videoInfo = this._extractVideoData(msg);
      if (!videoInfo) return;

      const conn = await this.pool.getConnection();

      try {
        await conn.beginTransaction();
        const [existing] = await conn.query(
          `SELECT id FROM fabubot_single_videos 
           WHERE file_id = ? 
           LIMIT 1 
           FOR UPDATE`,
          [videoInfo.fileId]
        );

        if (existing.length > 0) {
          await conn.query(
            `DELETE FROM fabubot_single_videos 
             WHERE file_id = ?`,
            [videoInfo.fileId]
          );
          info(`[faBuBot] 发现重复文件 ${videoInfo.fileId.slice(-8)}，已删除`);
        }
        const [insertResult] = await conn.query(
          `INSERT INTO fabubot_single_videos 
            (file_id, chat_id, user_id, caption, duration, mime_type, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            videoInfo.fileId,
            msg.chat.id,
            msg.from.id,
            videoInfo.caption,
            videoInfo.duration,
            videoInfo.mimeType,
            new Date(msg.date * 1000)
          ]
        );
        const recordId = insertResult.insertId;

        await conn.commit();
        info(`[faBuBot] 单个视频保存成功: ${videoInfo.fileId.slice(-10)}, 记录ID=${recordId}`);

        await this._confirmAndResend(msg, videoInfo, recordId);

      } catch (err) {
        await conn.rollback();
        error(`[faBuBot] 视频保存失败: ${err.message}`, err);
        await this.messageService.sendText(
          msg.chat.id,
          `❌ 视频保存失败: ${err.code || '数据库错误'}`,
          { reply_to_message_id: msg.message_id },
          msg
        );
      } finally {
        conn.release();
      }
    } catch (err) {
      error(`[faBuBot] 视频处理异常: ${err.message}`, err);
    }
  }

  _extractVideoData(msg) {
    return {
      fileId: msg.video.file_id,
      caption: msg.caption || null,
      duration: msg.video.duration,
      mimeType: msg.video.mime_type
    };
  }

  async _confirmAndResend(originalMsg, videoInfo, recordId) {
    try {
      await this.messageService.sendText(
        originalMsg.chat.id,
        `✅ 视频已保存 (${Math.round(videoInfo.duration)}秒)`,
        { reply_to_message_id: originalMsg.message_id },
        originalMsg
      );

      await this._retrySendVideo(
        originalMsg.chat.id,
        videoInfo.fileId,
        videoInfo.caption,
        3,
        originalMsg
      );

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
        let successCount = 0;
        for (const targetChatId of forwardChatIds) {
          try {
            const sentMessage = await this.bot.sendVideo(
              targetChatId,
              videoInfo.fileId,
              { caption: videoInfo.caption }
            );
            forwardedMessageIds[targetChatId] = sentMessage.message_id;
            info(`媒体已转发至群组 ${targetChatId}，消息ID: ${forwardedMessageIds[targetChatId]}`);
            successCount++;
          } catch (err) {
            error(`媒体转发至群组 ${targetChatId} 失败: ${err.message}`);
          }
        }

        if (successCount > 0) {
          await this.messageService.sendText(
            originalMsg.chat.id,
            `✅ 媒体已转发至 ${successCount} 个群组`,
            {},
            originalMsg
          );
        } else if (forwardChatIds.length > 0) {
          await this.messageService.sendText(
            originalMsg.chat.id,
            `❌ 媒体转发失败，请检查设置`,
            {},
            originalMsg
          );
        }
      }

      if (Object.keys(forwardedMessageIds).length > 0) {
        try {
          const conn = await this.pool.getConnection();
          try {
            await conn.query(
              `UPDATE fabubot_single_videos 
               SET forwarded_message_ids = ?
               WHERE id = ?`,
              [JSON.stringify(forwardedMessageIds), recordId]
            );
            info(`转发消息ID已保存: ${recordId}`);
          } finally {
            conn.release();
          }
        } catch (err) {
          error(`保存转发消息ID失败: ${err.message}`);
        }
      }
    } catch (err) {
      error(`确认消息发送失败: ${err.message}`);
    }
  }

  async _retrySendVideo(chatId, fileId, caption, maxRetries, originalMsg) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.messageService.sendVideo(
          chatId,
          fileId,
          {
            caption: caption || '已保存的单个视频',
            parse_mode: 'HTML'
          },
          originalMsg
        );
        return;
      } catch (err) {
        if (attempt === maxRetries) throw err;
        await new Promise(resolve =>
          setTimeout(resolve, 1000 * attempt * 2)
        );
      }
    }
  }
}

module.exports = VideoHandler;
