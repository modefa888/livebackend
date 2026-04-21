const { info, error, warn, logGroupAction: logEvent } = require('../utils/logger.js');
// =============================================================
// faBuBot 群组管理模块
// =============================================================

module.exports = (bot, pool, messageService) => {
  // 保存或更新群组信息的函数
  const saveGroup = async (chat) => {
    try {
      if (!chat || (!chat.id.toString().startsWith('-') && chat.type !== 'channel')) {
        return; // 只处理群组和频道
      }
      
      const conn = await pool.getConnection();
      try {
        const now = new Date();
        const groupType = chat.type === 'supergroup' ? 'supergroup' : 
                         chat.type === 'group' ? 'group' : 
                         chat.type === 'channel' ? 'channel' : 'supergroup';
        
        info(`[faBuBot] 保存群组信息: ID=${chat.id}, 标题=${chat.title}`);
        
        await conn.execute(
          `INSERT INTO fabubot_groups 
           (group_id, group_title, group_username, group_type, is_enabled, created_at)
           VALUES (?, ?, ?, ?, 1, ?)
           ON DUPLICATE KEY UPDATE
             group_title = VALUES(group_title),
             group_username = VALUES(group_username),
             group_type = VALUES(group_type),
             updated_at = VALUES(created_at)`,
          [
            chat.id,
            chat.title || '未命名群组',
            chat.username || null,
            groupType,
            now
          ]
        );
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 保存群组信息失败:', err);
    }
  };

  // 保存群组成员信息的函数
  const saveGroupMember = async (chat, user, isAdmin = false, isOwner = false) => {
    try {
      if (!chat || !user) return;
      
      const conn = await pool.getConnection();
      try {
        const now = new Date();
        
        info(`[faBuBot] 保存群组成员: 群组ID=${chat.id}, 用户ID=${user.id}, 用户=${user.username || user.first_name}, 管理员=${isAdmin}`);
        
        await conn.execute(
          `INSERT INTO fabubot_group_members 
           (group_id, user_id, user_username, user_first_name, user_last_name, 
            is_admin, is_owner, is_bot, joined_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             user_username = VALUES(user_username),
             user_first_name = VALUES(user_first_name),
             user_last_name = VALUES(user_last_name),
             is_admin = VALUES(is_admin),
             is_owner = VALUES(is_owner),
             last_active_at = VALUES(joined_at)`,
          [
            chat.id,
            user.id,
            user.username || null,
            user.first_name || null,
            user.last_name || null,
            isAdmin ? 1 : 0,
            isOwner ? 1 : 0,
            user.is_bot ? 1 : 0,
            now
          ]
        );
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 保存群组成员信息失败:', err);
    }
  };

  // 记录群组操作日志
  const logGroupAction = async (groupId, actionType, userId = null, actorId = null, details = null, messageId = null) => {
    try {
      info(`[faBuBot] 记录群组操作: 群组ID=${groupId}, 操作=${actionType}, 用户ID=${userId}, 操作者ID=${actorId}`);
      
      const conn = await pool.getConnection();
      try {
        await conn.execute(
          `INSERT INTO fabubot_group_logs 
           (group_id, action_type, user_id, actor_id, details, message_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            groupId,
            actionType,
            userId,
            actorId,
            details ? JSON.stringify(details) : null,
            messageId
          ]
        );
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 记录群组操作日志失败:', err);
    }
  };

  // 处理 /addgroup 命令
  const handleAddGroupCommand = async (msg) => {
    try {
      info(`[faBuBot] 收到 /addgroup 命令: 群组ID=${msg.chat.id}, 用户ID=${msg.from.id}`);
      
      if (!msg.chat || (!msg.chat.id.toString().startsWith('-') && msg.chat.type !== 'channel')) {
        await messageService.sendText(msg.chat.id, '❌ 此命令只能在群组或频道中使用！', {}, msg);
        return;
      }
      
      // 保存群组信息
      await saveGroup(msg.chat);
      
      // 记录操作日志
      await logGroupAction(msg.chat.id, 'user_join', msg.from?.id, msg.from?.id, {
        action: 'add_group',
        chat_type: msg.chat.type
      }, msg.message_id);
      
      // 构建响应消息
      let response = '✅ 群组已成功添加到管理！\n\n';
      response += `📋 群组信息：\n`;
      response += `• 群组ID: ${msg.chat.id}\n`;
      response += `• 群组名称: ${msg.chat.title || '未命名'}\n`;
      if (msg.chat.username) {
        response += `• 群组用户名: @${msg.chat.username}\n`;
      }
      response += `• 群组类型: ${msg.chat.type}\n`;
      
      info('[faBuBot] /addgroup 命令处理完成');
      
      await messageService.sendText(msg.chat.id, response, {}, msg);
    } catch (err) {
      error('[faBuBot] 处理 /addgroup 命令失败:', err);
    }
  };

  // 自动保存群组和成员信息（通用函数）
  const autoSaveGroupAndMember = async (msg) => {
    try {
      if (msg.chat && (msg.chat.id.toString().startsWith('-') || msg.chat.type === 'channel')) {
        await saveGroup(msg.chat);
        // 保存发送者为成员
        if (msg.from) {
          let isAdmin = false;
          let isOwner = false;
          try {
            // 从 Telegram API 获取用户在群组中的状态
            const chatMember = await bot.getChatMember(msg.chat.id, msg.from.id);
            isAdmin = chatMember.status === 'administrator';
            isOwner = chatMember.status === 'creator';
          } catch (err) {
            error('[faBuBot] 获取用户管理员状态失败:', err);
          }
          await saveGroupMember(msg.chat, msg.from, isAdmin, isOwner);
        }
      }
    } catch (err) {
      error('[faBuBot] 自动保存群组信息失败:', err);
    }
  };

  return {
    saveGroup,
    saveGroupMember,
    logGroupAction,
    handleAddGroupCommand,
    autoSaveGroupAndMember
  };
};
