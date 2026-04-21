const { info, error, warn, logCommand } = require('../utils/logger.js');
const { pool } = require('../config/database');

class RandomMediaSender {
  constructor(bot, messageService) {
    this.bot = bot;
    this.messageService = messageService;
    this.MAX_RETRIES = 3;
    this.CAPTION_MAX_LENGTH = 1024;
    this.SINGLE_VIDEO_WEIGHT = 0.5;
  }

  async handleCommand(msg) {
    info(`[faBuBot] 收到随机媒体请求 [用户:${msg.from.id}]`);
    try {
      const mediaData = await this._fetchRandomMedia();
      if (!mediaData) {
        return this._safeSend(msg.chat.id, "❌ 媒体库为空，请先上传内容", msg);
      }

      if (mediaData.type === 'media_group') {
        info(`[faBuBot] 准备发送媒体组 [ID:${mediaData.id}]`);
        await this._sendMediaGroup(msg.chat.id, mediaData, msg);
      } else {
        info(`[faBuBot] 准备发送单个视频 [ID:${mediaData.id}]`);
        await this._sendSingleVideo(msg.chat.id, mediaData, msg);
      }

      info(`[faBuBot] 随机媒体发送成功 [类型:${mediaData.type} ID:${mediaData.id}]`);
    } catch (err) {
      error(`[faBuBot] 随机媒体发送失败: ${err.message}`);
    }
  }

  async _fetchRandomMedia() {
    const conn = await pool.getConnection();
    try {
      const fetchType = Math.random() < this.SINGLE_VIDEO_WEIGHT ?
                        'single_video' : 'media_group';

      let result = fetchType === 'single_video' ?
        await this._fetchRandomSingleVideo(conn) :
        await this._fetchRandomMediaGroup(conn);

      if (!result) {
        const fallbackType = fetchType === 'single_video' ?
                           'media_group' : 'single_video';
        result = fallbackType === 'single_video' ?
          await this._fetchRandomSingleVideo(conn) :
          await this._fetchRandomMediaGroup(conn);
      }

      return result;
    } finally {
      conn.release();
    }
  }

  async _fetchRandomSingleVideo(conn) {
    const [videos] = await conn.query(`
      SELECT 
        id, 
        COALESCE(caption, '') AS caption,
        file_id
      FROM fabubot_single_videos
      ORDER BY RAND()
      LIMIT 1
    `);

    if (videos.length > 0) {
      return {
        type: 'single_video',
        id: videos[0].id,
        file_id: videos[0].file_id,
        caption: this._formatCaption(videos[0].caption)
      };
    }
    return null;
  }

  async _fetchRandomMediaGroup(conn) {
    const [groups] = await conn.query(`
      SELECT media_group_id, chat_id
      FROM fabubot_media_groups
      ORDER BY RAND()
      LIMIT 1
    `);

    if (groups.length === 0) return null;

    const [items] = await conn.query(`
      SELECT type, file_id, caption
      FROM fabubot_media_items
      WHERE media_group_id = ?
      ORDER BY id ASC
    `, [groups[0].media_group_id]);

    if (items.length === 0) return null;

    return {
      type: 'media_group',
      id: groups[0].media_group_id,
      items: items.map(item => ({
        type: item.type,
        file_id: item.file_id,
        caption: this._formatCaption(item.caption)
      })),
      mainCaption: this._formatCaption(items[0].caption)
    };
  }

  async _sendMediaGroup(chatId, mediaData, originalMsg) {
    try {
      const mediaGroup = mediaData.items.map((item, index) => ({
        type: item.type,
        media: item.file_id,
        caption: index === 0 ? mediaData.mainCaption : undefined,
        parse_mode: 'HTML'
      }));

      await this.messageService.sendMediaGroup(chatId, mediaGroup, {}, originalMsg);
    } catch (err) {
      info(`[faBuBot] 媒体组发送失败 [ID:${mediaData.id}]`);
      // 不自动删除，只记录失败日志
    }
  }

  async _removeInvalidMediaGroup(mediaGroupId) {
    const conn = await pool.getConnection();
    try {
      await conn.execute('DELETE FROM fabubot_media_items WHERE media_group_id = ?', [mediaGroupId]);
      await conn.execute('DELETE FROM fabubot_media_groups WHERE media_group_id = ?', [mediaGroupId]);
      warn(`[faBuBot] 已删除无效媒体组记录 [ID:${mediaGroupId}]`);
    } catch (err) {
      error(`[faBuBot] 删除无效媒体组记录失败: ${err.message}`);
    } finally {
      conn.release();
    }
  }

  async _sendSingleVideo(chatId, videoData, originalMsg) {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        await this.messageService.sendVideo(chatId, videoData.file_id, {
          caption: videoData.caption,
          parse_mode: 'HTML'
        }, originalMsg);
        return;
      } catch (err) {
        if (attempt === this.MAX_RETRIES) {
          info(`[faBuBot] 视频发送失败 [ID:${videoData.id}]`);
          // 不自动删除，只记录失败日志
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  async _removeInvalidVideo(videoId) {
    const conn = await pool.getConnection();
    try {
      await conn.execute('DELETE FROM fabubot_single_videos WHERE id = ?', [videoId]);
      warn(`[faBuBot] 已删除无效视频记录 [ID:${videoId}]`);
    } catch (err) {
      error(`[faBuBot] 删除无效视频记录失败: ${err.message}`);
    } finally {
      conn.release();
    }
  }

  _formatCaption(rawCaption) {
    const sanitized = String(rawCaption || '')
      .substring(0, this.CAPTION_MAX_LENGTH)
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return sanitized.length > 0 ? sanitized : undefined;
  }

  async _safeSend(chatId, text, originalMsg) {
    try {
      await this.messageService.sendText(chatId, text, {}, originalMsg);
    } catch (err) {
      error(`消息发送失败: ${err.message}`);
    }
  }
}

module.exports = RandomMediaSender;
