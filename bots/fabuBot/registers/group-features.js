const { info, error, warn, logMessage, logGroupAction: logGroupEvent } = require('../utils/logger.js');
// =============================================================
// faBuBot 群组核心功能模块
// =============================================================

module.exports = (bot, pool, messageService, groupRegisterModule) => {
  const { logGroupAction } = groupRegisterModule;

  // 检查用户消息频率（防刷屏）
  const userMessageTimestamps = new Map();

  // 检查违禁词
  const checkForbiddenWords = async (chatId, text) => {
    if (!text) return false;

    try {
      const conn = await pool.getConnection();
      try {
        const [words] = await conn.execute(
          'SELECT word FROM fabubot_group_forbidden_words WHERE group_id = ? OR group_id = 0',
          [chatId]
        );

        for (const w of words) {
          if (text.toLowerCase().includes(w.word.toLowerCase())) {
            return w.word;
          }
        }
        return false;
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 检查违禁词失败:', error);
      return false;
    }
  };

  // 检查链接
  const checkForbiddenLinks = (text) => {
    if (!text) return false;
    const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    return urlPattern.test(text);
  };

  // 获取群组自定义设置
  const getGroupCustomSetting = async (groupId, key, defaultValue) => {
    try {
      const conn = await pool.getConnection();
      try {
        const [result] = await conn.execute(
          'SELECT setting_value FROM fabubot_group_settings WHERE group_id = ? AND setting_key = ?',
          [groupId, key]
        );

        if (result.length > 0) {
          return JSON.parse(result[0].setting_value);
        }
        return defaultValue;
      } finally {
        conn.release();
      }
    } catch (err) {
      error(`[faBuBot] 获取群组设置 ${key} 失败:`, error);
      return defaultValue;
    }
  };

  // 检查消息频率
  const checkMessageFrequency = async (groupId, userId) => {
    // 从数据库获取设置
    const maxMessages = await getGroupCustomSetting(groupId, 'flood_max_messages', 5);
    const timeWindow = await getGroupCustomSetting(groupId, 'flood_time_window', 5000);

    const now = Date.now();
    const userTimestamps = userMessageTimestamps.get(userId) || [];
    
    // 清理过期的时间戳
    const recentTimestamps = userTimestamps.filter(ts => now - ts < timeWindow);
    recentTimestamps.push(now);
    
    userMessageTimestamps.set(userId, recentTimestamps);
    
    return recentTimestamps.length > maxMessages;
  };

  // 获取群组设置
  const getGroupSettings = async (chatId) => {
    try {
      const conn = await pool.getConnection();
      try {
        const [settings] = await conn.execute(
          'SELECT * FROM fabubot_group_settings WHERE group_id = ?',
          [chatId]
        );
        if (settings.length > 0) {
          return settings[0];
        }
        return null;
      } finally {
        return null;
      }
    } catch (err) {
      error('[faBuBot] 获取群组设置失败:', error);
      return null;
    }
  };

  // 处理新成员加入
  const handleNewMember = async (msg) => {
    const chatId = msg.chat.id;
    const newMembers = msg.new_chat_members;

    if (!newMembers || newMembers.length === 0) return;

    try {
      const settings = await getGroupSettings(chatId);
      
      // 检查欢迎消息是否启用
      if (settings && settings.welcome_enabled) {
        try {
          const conn = await pool.getConnection();
          try {
            const [welcome] = await conn.execute(
              'SELECT welcome_text FROM fabubot_group_welcomes WHERE group_id = ? AND is_enabled = 1',
              [chatId]
            );

            if (welcome.length > 0 && welcome[0].welcome_text) {
              let welcomeText = welcome[0].welcome_text;
              
              // 替换变量
              for (const member of newMembers) {
                const mention = member.username ? `@${member.username}` : member.first_name;
                const processedText = welcomeText
                  .replace('{user}', mention)
                  .replace('{username}', member.username || '')
                  .replace('{firstname}', member.first_name || '')
                  .replace('{groupname}', msg.chat.title || '');

                const welcomeMsg = await messageService.sendText(chatId, processedText, {}, msg);

                // 如果设置了自动删除欢迎消息
                if (settings.auto_delete_welcome) {
                  setTimeout(async () => {
                    try {
                      await bot.deleteMessage(chatId, welcomeMsg.message_id);
                    } catch (e) {
                      error('[faBuBot] 删除欢迎消息失败:', e);
                    }
                  }, 30000); // 30秒后删除
                }

                await logGroupAction(chatId, 'user_join', member.id, null, { action: 'welcome_sent' }, msg.message_id);
              }
            }
          } finally {
            conn.release();
          }
        } catch (err) {
          error('[faBuBot] 发送欢迎消息失败:', error);
        }
      }
    } catch (err) {
      error('[faBuBot] 处理新成员失败:', error);
    }
  };

  // 处理成员离开
  const handleMemberLeft = async (msg) => {
    const chatId = msg.chat.id;
    const leftMember = msg.left_chat_member;

    if (!leftMember) return;

    try {
      await logGroupAction(chatId, 'user_leave', leftMember.id, null, {}, msg.message_id);
    } catch (err) {
      error('[faBuBot] 处理成员离开失败:', error);
    }
  };

  // 处理普通消息（反垃圾、反链接、反刷屏）
  const handleMessage = async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from?.id;

    if (!fromId || msg.chat.type === 'private') return;

    const settings = await getGroupSettings(chatId);
    if (!settings) return;

    // 检查反垃圾消息（违禁词）
    if (settings.anti_spam_enabled && msg.text) {
      const forbiddenWord = await checkForbiddenWords(chatId, msg.text);
      if (forbiddenWord) {
        try {
          await bot.deleteMessage(chatId, msg.message_id);
          await logGroupAction(chatId, 'other', fromId, null, { word: forbiddenWord }, msg.message_id);
          
          const userMention = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
          await messageService.sendText(chatId, `⚠️ ${userMention} 消息包含违禁词，已删除！`, {}, msg);
          return true;
        } catch (err) {
          error('[faBuBot] 删除违禁词消息失败:', error);
        }
      }
    }

    // 检查反链接
    if (settings.anti_link_enabled && msg.text) {
      if (checkForbiddenLinks(msg.text)) {
        try {
          await bot.deleteMessage(chatId, msg.message_id);
          await logGroupAction(chatId, 'other', fromId, null, {}, msg.message_id);
          
          const userMention = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
          await messageService.sendText(chatId, `⚠️ ${userMention} 消息包含链接，已删除！`, {}, msg);
          return true;
        } catch (err) {
          error('[faBuBot] 删除链接消息失败:', error);
        }
      }
    }

    // 检查反刷屏
    if (settings.anti_flood_enabled && await checkMessageFrequency(chatId, fromId)) {
      try {
        await bot.deleteMessage(chatId, msg.message_id);
        await logGroupAction(chatId, 'other', fromId, null, {}, msg.message_id);
        
        const userMention = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
        await messageService.sendText(chatId, `⚠️ ${userMention} 请不要刷屏！`, {}, msg);
        return true;
      } catch (err) {
        error('[faBuBot] 删除刷屏消息失败:', error);
      }
    }

    return false;
  };

  // 处理服务消息（自动删除服务消息）
  const handleServiceMessage = async (msg) => {
    const chatId = msg.chat.id;

    if (msg.chat.type === 'private') return;

    const settings = await getGroupSettings(chatId);
    if (!settings) return;

    // 检查是否启用了自动删除服务消息
    if (settings.auto_delete_enabled) {
      // 判断是否是服务消息
      // 服务消息包括：新成员加入、成员离开、群组标题变更、群组照片变更等
      const isServiceMessage = 
        msg.new_chat_members || 
        msg.left_chat_member || 
        msg.new_chat_title || 
        msg.new_chat_photo || 
        msg.delete_chat_photo || 
        msg.group_chat_created || 
        msg.supergroup_chat_created || 
        msg.channel_chat_created || 
        msg.migrate_to_chat_id || 
        msg.migrate_from_chat_id || 
        msg.pinned_message;

      if (isServiceMessage) {
        try {
          await bot.deleteMessage(chatId, msg.message_id);
          await logGroupAction(chatId, 'other', null, null, { action: 'service_message_deleted' }, msg.message_id);
          return true;
        } catch (err) {
          error('[faBuBot] 删除服务消息失败:', error);
        }
      }
    }

    return false;
  };

  // 检查全局封禁
  const checkGlobalBan = async (userId) => {
    try {
      const conn = await pool.getConnection();
      try {
        const [bans] = await conn.execute(
          'SELECT * FROM fabubot_global_bans WHERE user_id = ?',
          [userId]
        );
        return bans.length > 0;
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 检查全局封禁失败:', error);
      return false;
    }
  };

  // 处理新成员加入前的全局封禁检查
  const handlePreJoinCheck = async (msg) => {
    const chatId = msg.chat.id;
    const newMembers = msg.new_chat_members;

    if (!newMembers || newMembers.length === 0) return;

    for (const member of newMembers) {
      if (member.id === bot.id) continue;

      const isGlobalBanned = await checkGlobalBan(member.id);
      if (isGlobalBanned) {
        try {
          await bot.banChatMember(chatId, member.id);
          await logGroupAction(chatId, 'other', member.id, null, {}, msg.message_id);
          
          const mention = member.username ? `@${member.username}` : member.first_name;
          await messageService.sendText(chatId, `🚫 ${mention} 因全局封禁用户，已移出群组！`, {}, msg);
        } catch (err) {
          error('[faBuBot] 踢出全局封禁用户失败:', error);
        }
      }
    }
  };

  return {
    handleNewMember,
    handleMemberLeft,
    handleMessage,
    handlePreJoinCheck,
    checkForbiddenWords,
    checkForbiddenLinks,
    checkGlobalBan,
    handleServiceMessage
  };
};
