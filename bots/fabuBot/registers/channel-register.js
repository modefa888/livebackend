const { info, error, warn, logGroupAction: logEvent } = require('../utils/logger.js');
// =============================================================
// faBuBot 频道管理模块
// =============================================================

module.exports = (bot, pool, messageService) => {
  // 保存或更新频道信息的函数
  const saveChannel = async (chat) => {
    try {
      if (!chat || chat.type !== 'channel') {
        return;
      }
      
      const conn = await pool.getConnection();
      try {
        const now = new Date();
        
        info(`[faBuBot] 保存频道信息: ID=${chat.id}, 标题=${chat.title}`);
        
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
            chat.title || '未命名频道',
            chat.username || null,
            'channel',
            now
          ]
        );
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 保存频道信息失败:', err);
    }
  };

  // 记录频道操作日志
  const logChannelAction = async (channelId, actionType, userId = null, actorId = null, details = null, messageId = null) => {
    try {
      info(`[faBuBot] 记录频道操作: 频道ID=${channelId}, 操作=${actionType}, 用户ID=${userId}, 操作者ID=${actorId}`);
      
      const conn = await pool.getConnection();
      try {
        await conn.execute(
          `INSERT INTO fabubot_group_logs 
           (group_id, action_type, user_id, actor_id, details, message_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            channelId,
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
      error('[faBuBot] 记录频道操作日志失败:', err);
    }
  };

  // 处理机器人在频道中的状态变化
  const handleMyChatMember = async (msg) => {
    try {
      // 频道信息
      const channelId = msg.chat.id;
      const channelTitle = msg.chat.title;
      const channelUsername = msg.chat.username;
      const channelType = msg.chat.type;

      // 用户信息（添加机器人到频道的用户）
      const fromId = msg.from?.id;
      const fromUsername = msg.from?.username;
      const fromFirstName = msg.from?.first_name;

      // 机器人状态
      const status = msg.new_chat_member.status;
      let statusText = '';
      switch (status) {
        case 'creator':
          statusText = '创建者';
          break;
        case 'administrator':
          statusText = '管理员';
          break;
        case 'member':
          statusText = '成员';
          break;
        case 'left':
          statusText = '离开';
          break;
        case 'kicked':
          statusText = '被踢出';
          break;
        default:
          statusText = '未知状态';
          break;
      }

      info(`[faBuBot] 机器人状态变化: 频道ID=${channelId}, 标题=${channelTitle}, 用户ID=${fromId}, 状态=${statusText}`);

      // 当机器人被设置为管理员时，保存频道信息
      if (status === 'administrator') {
        try {
          // 保存频道信息
          await saveChannel(msg.chat);
          
          // 记录操作日志
          await logChannelAction(channelId, 'channel_add_bot', null, fromId, {
            action: 'bot_added_as_admin',
            chat_type: channelType
          });

          // 向添加机器人的用户发送通知
          if (fromId) {
            let response = `✅ 我已成功加入频道！\n\n`;
            response += `📋 频道信息：\n`;
            response += `• 频道ID: ${channelId}\n`;
            response += `• 频道名称: ${channelTitle || '未命名'}\n`;
            if (channelUsername) {
              response += `• 频道用户名: @${channelUsername}\n`;
            }
            response += `• 频道类型: ${channelType}\n\n`;
            response += `您可以使用 /addchannel 查看已管理的频道。`;

            try {
              await bot.sendMessage(fromId, response);
              info(`[faBuBot] 已通知用户 ${fromId} 机器人已加入频道`);
            } catch (err) {
              warn('[faBuBot] 无法向用户发送通知（可能用户未开启私信）:', err);
            }
          }
        } catch (err) {
          error('[faBuBot] 处理机器人加入频道失败:', err);
        }
      }

      // 当机器人被移出频道时，记录日志
      if (status === 'left' || status === 'kicked') {
        try {
          await logChannelAction(channelId, 'channel_remove_bot', null, fromId, {
            action: 'bot_removed',
            status: status
          });
          
          info(`[faBuBot] 机器人已离开频道: ${channelTitle}`);
        } catch (err) {
          error('[faBuBot] 记录机器人离开频道失败:', err);
        }
      }
    } catch (err) {
      error('[faBuBot] 处理 my_chat_member 事件失败:', err);
    }
  };

  // 处理 /addchannel 命令 - 添加频道（私聊命令）
  const handleAddChannelCommand = async (msg) => {
    try {
      info(`[faBuBot] 收到 /addchannel 命令: 用户ID=${msg.from?.id}`);
      
      // 检查是否为私聊
      if (msg.chat.type !== 'private') {
        await messageService.sendText(msg.chat.id, '❌ 此命令只能在私聊中使用！', {}, msg);
        return;
      }
      
      // 获取机器人信息
      const botInfo = await bot.getMe();
      const botUsername = botInfo.username;
      
      // 构建邀请链接
      const inviteUrl = `https://t.me/${botUsername}?startchannel=true`;
      
      // 构建响应消息
      const message = "🤖 添加频道到管理\n" +
          "\n" +
          "将机器人邀请到您的频道或群组，它会自动识别并添加到管理！\n" +
          "\n" +
          "操作步骤：\n" +
          "1. 点击下方按钮获取邀请链接\n" +
          "2. 在频道/群组设置中添加机器人为管理员\n" +
          "3. 机器人会自动检测并保存频道信息\n" +
          "\n" +
          "💡 提示：添加后可点击下方按钮查看已管理的频道";
      
      // 构建键盘
      const keyboard = {
        inline_keyboard: [
          [
            { text: '👁️‍🗨 查看已管理频道', callback_data: 'showMyChannels_' + msg.chat.id },
            { text: '➕ 邀请机器人', url: inviteUrl }
          ]
        ]
      };
      
      // 发送消息
      await bot.sendMessage(msg.chat.id, message, {
        parse_mode: 'Markdown',
        reply_markup: JSON.stringify(keyboard)
      });
      
      info('[faBuBot] /addchannel 命令处理完成');
    } catch (err) {
      error('[faBuBot] 处理 /addchannel 命令失败:', err);
      if (msg.chat?.id) {
        await messageService.sendText(msg.chat.id, '❌ 处理命令失败，请稍后重试！', {}, msg);
      }
    }
  };

  // 处理查看已管理频道回调
  const handleShowMyChannels = async (chatId, messageId = null) => {
    try {
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.execute(
          `SELECT * FROM fabubot_groups WHERE group_type = 'channel' ORDER BY created_at DESC`
        );
        
        if (rows.length === 0) {
          await bot.sendMessage(chatId, '📭 暂未管理任何频道\n\n请将机器人添加到频道并设置为管理员，机器人会自动识别！');
          return;
        }
        
        let message = `📺 已管理的频道列表 (共 ${rows.length} 个)\n\n`;
        let keyboard = { inline_keyboard: [] };
        
        rows.forEach((channel, index) => {
          message += `${index + 1}. ${channel.group_title || '未命名'} (${channel.group_type})\n`;
          message += `   ID: ${channel.group_id}\n\n`;
          
          // 为每个频道添加管理按钮
          keyboard.inline_keyboard.push([
            {
              text: `管理 ${channel.group_title || '未命名'}`,
              callback_data: `manageChannel_${channel.group_id}`
            }
          ]);
        });
        
        message += '您可以在管理后台查看和管理这些频道：\n';
        message += 'http://localhost:3003/bot';
        
        if (messageId) {
          // 修改现有消息
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
      error('[faBuBot] 处理查看频道回调失败:', err);
    }
  };

  // 处理频道管理回调
  const handleManageChannel = async (chatId, messageId, channelId) => {
    try {
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.execute(
          `SELECT * FROM fabubot_groups WHERE group_id = ?`,
          [channelId]
        );
        
        if (rows.length === 0) {
          await bot.answerCallbackQuery(query.id, {
            text: '频道不存在！',
            show_alert: true
          });
          return;
        }
        
        const channel = rows[0];
        let message = `📋 频道管理：${channel.group_title || '未命名'}\n\n`;
        message += `类型：${channel.group_type}\n`;
        message += `ID：${channel.group_id}\n`;
        message += `状态：${channel.is_enabled ? '正常' : '已禁用'}\n`;
        if (channel.group_username) {
          message += `用户名：@${channel.group_username}\n`;
        }
        message += `添加时间：${channel.created_at ? channel.created_at.toLocaleString() : '未知'}\n`;
        
        let keyboard = { inline_keyboard: [] };
        
        // 添加返回按钮
        keyboard.inline_keyboard.push([
          {
            text: '返回频道列表',
            callback_data: 'backToChannelList'
          }
        ]);
        
        // 修改消息显示频道管理信息
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
      error('[faBuBot] 处理频道管理回调失败:', err);
    }
  };

  // 处理 /listchannels 命令 - 列出所有频道（管理员命令）
  const handleListChannelsCommand = async (msg) => {
    try {
      info(`[faBuBot] 收到 /listchannels 命令: 用户ID=${msg.from?.id}`);
      
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.execute(
          `SELECT * FROM fabubot_groups WHERE group_type = 'channel' ORDER BY created_at DESC`
        );
        
        if (rows.length === 0) {
          await messageService.sendText(msg.chat.id, '📭 暂未管理任何频道', {}, msg);
          return;
        }
        
        let response = `📺 已管理的频道列表 (共 ${rows.length} 个)\n\n`;
        rows.forEach((channel, index) => {
          response += `${index + 1}. ${channel.group_title || '未命名'}\n`;
          response += `   ID: ${channel.group_id}\n`;
          if (channel.group_username) {
            response += `   用户名: @${channel.group_username}\n`;
          }
          response += `   状态: ${channel.is_enabled ? '✅' : '❌'}\n\n`;
        });
        
        await messageService.sendText(msg.chat.id, response, {}, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 处理 /listchannels 命令失败:', err);
    }
  };

  // 自动保存频道信息
  const autoSaveChannel = async (msg) => {
    try {
      if (msg.chat && msg.chat.type === 'channel') {
        await saveChannel(msg.chat);
      }
    } catch (err) {
      error('[faBuBot] 自动保存频道信息失败:', err);
    }
  };

  return {
    saveChannel,
    logChannelAction,
    handleAddChannelCommand,
    handleListChannelsCommand,
    autoSaveChannel,
    handleMyChatMember,
    handleShowMyChannels,
    handleManageChannel
  };
};