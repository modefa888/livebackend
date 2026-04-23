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

  // 处理 /addgroup 命令 - 添加群组（私聊命令）
  const handleAddGroupCommand = async (msg) => {
    try {
      info(`[faBuBot] 收到 /addgroup 命令: 用户ID=${msg.from?.id}`);
      
      if (msg.chat.type !== 'private') {
        await messageService.sendText(msg.chat.id, '❌ 此命令只能在私聊中使用！', {}, msg);
        return;
      }
      
      const botInfo = await bot.getMe();
      const botUsername = botInfo.username;
      
      const inviteUrl = `https://t.me/${botUsername}?startgroup=true`;
      
      const message = "🤖 添加群组到管理\n" +
          "\n" +
          "将机器人邀请到您的群组，它会自动识别并添加到管理！\n" +
          "\n" +
          "操作步骤：\n" +
          "1. 点击下方按钮获取邀请链接\n" +
          "2. 在群组设置中添加机器人为管理员\n" +
          "3. 机器人会自动检测并保存群组信息\n" +
          "\n" +
          "💡 提示：添加后可点击下方按钮查看已管理的群组";
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '👁️‍🗨 查看已管理群组', callback_data: 'showMyGroups_' + msg.chat.id },
            { text: '➕ 邀请机器人', url: inviteUrl }
          ]
        ]
      };
      
      await bot.sendMessage(msg.chat.id, message, {
        parse_mode: 'Markdown',
        reply_markup: JSON.stringify(keyboard)
      });
      
      info('[faBuBot] /addgroup 命令处理完成');
    } catch (err) {
      error('[faBuBot] 处理 /addgroup 命令失败:', err);
      if (msg.chat?.id) {
        await messageService.sendText(msg.chat.id, '❌ 处理命令失败，请稍后重试！', {}, msg);
      }
    }
  };

  // 处理查看已管理群组回调
  const handleShowMyGroups = async (chatId, messageId = null) => {
    try {
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.execute(
          `SELECT * FROM fabubot_groups WHERE group_type IN ('group', 'supergroup') ORDER BY created_at DESC`
        );
        
        if (rows.length === 0) {
          await bot.sendMessage(chatId, '📭 暂未管理任何群组\n\n请将机器人添加到群组并设置为管理员，机器人会自动识别！');
          return;
        }
        
        let message = `👥 已管理的群组列表 (共 ${rows.length} 个)\n\n`;
        let keyboard = { inline_keyboard: [] };
        
        rows.forEach((group, index) => {
          message += `${index + 1}. ${group.group_title || '未命名'} (${group.group_type})\n`;
          message += `   ID: ${group.group_id}\n\n`;
          
          keyboard.inline_keyboard.push([
            {
              text: `管理 ${group.group_title || '未命名'}`,
              callback_data: `manageGroup_${group.group_id}`
            }
          ]);
        });
        
        message += '您可以在管理后台查看和管理这些群组：\n';
        message += 'http://localhost:3003/bot';
        
        if (messageId) {
          try {
            await bot.editMessageText(message, {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: JSON.stringify(keyboard)
            });
          } catch (err) {
            if (err.message.includes('message can\'t be edited')) {
              await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: JSON.stringify(keyboard)
              });
            } else {
              error('[faBuBot] 修改消息失败:', err);
            }
          }
        } else {
          await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(keyboard)
          });
        }
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 处理查看群组回调失败:', err);
    }
  };

  // 处理群组管理回调
  const handleManageGroup = async (chatId, messageId, groupId) => {
    try {
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.execute(
          `SELECT * FROM fabubot_groups WHERE group_id = ?`,
          [groupId]
        );
        
        if (rows.length === 0) {
          await bot.answerCallbackQuery(query.id, {
            text: '群组不存在！',
            show_alert: true
          });
          return;
        }
        
        const group = rows[0];
        let message = `📋 群组管理：${group.group_title || '未命名'}\n\n`;
        message += `类型：${group.group_type}\n`;
        message += `ID：${group.group_id}\n`;
        message += `状态：${group.is_enabled ? '正常' : '已禁用'}\n`;
        if (group.group_username) {
          message += `用户名：@${group.group_username}\n`;
        }
        message += `添加时间：${group.created_at ? group.created_at.toLocaleString() : '未知'}\n`;
        
        let keyboard = { inline_keyboard: [] };
        
        keyboard.inline_keyboard.push([
          {
            text: '返回群组列表',
            callback_data: 'backToGroupList'
          }
        ]);
        
        try {
          await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(keyboard)
          });
        } catch (err) {
          if (err.message.includes('message can\'t be edited')) {
            await bot.sendMessage(chatId, message, {
              parse_mode: 'Markdown',
              reply_markup: JSON.stringify(keyboard)
            });
          } else {
            error('[faBuBot] 修改消息失败:', err);
          }
        }
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 处理群组管理回调失败:', err);
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
    autoSaveGroupAndMember,
    handleShowMyGroups,
    handleManageGroup
  };
};
