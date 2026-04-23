const groupRegister = require('./group-register');
const channelRegister = require('./channel-register');
const groupCommands = require('../commands/group-commands');
const groupFeatures = require('./group-features');
const { info, error, warn, logCommand, logMessage, logGroupAction } = require('../utils/logger.js');

module.exports = async (bot, pool, messageService, mediaHandler, videoHandler, randomSender) => {
  info('[faBuBot] 开始初始化机器人注册模块...');
  
  // 初始化群组管理模块
  const groupRegisterModule = groupRegister(bot, pool, messageService);
  const { saveGroup, saveGroupMember, logGroupAction, handleAddGroupCommand, autoSaveGroupAndMember, handleShowMyGroups, handleManageGroup } = groupRegisterModule;

  // 初始化频道管理模块
  const channelRegisterModule = channelRegister(bot, pool, messageService);
  const { handleAddChannelCommand, handleListChannelsCommand, autoSaveChannel, handleMyChatMember, handleShowMyChannels, handleManageChannel } = channelRegisterModule;

  // 初始化群组命令模块
  const groupCommandsModule = groupCommands(bot, pool, messageService, groupRegisterModule);

  // 初始化群组核心功能模块
  const groupFeaturesModule = groupFeatures(bot, pool, messageService, groupRegisterModule);
  
  info('[faBuBot] 群组管理模块初始化完成');
  info('[faBuBot] 频道管理模块初始化完成');

  // 保存或更新用户信息的函数（使用原子操作避免竞态条件）
  const saveUser = async (msg) => {
    try {
      const from = msg.from;
      if (!from) return;

      info(`[faBuBot] 保存用户信息: 用户ID=${from.id}, 用户=${from.username || from.first_name}`);

      const conn = await pool.getConnection();
      try {
        const now = new Date();
        await conn.execute(
          `INSERT INTO fabubot_users 
           (user_id, chat_id, username, first_name, last_name, 
            language_code, is_premium, is_bot, is_admin, last_active_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             chat_id = VALUES(chat_id),
             username = VALUES(username),
             first_name = VALUES(first_name),
             last_name = VALUES(last_name),
             language_code = VALUES(language_code),
             is_premium = VALUES(is_premium),
             last_active_at = VALUES(last_active_at)`,
          [
            from.id,
            msg.chat.id,
            from.username || null,
            from.first_name || null,
            from.last_name || null,
            from.language_code || null,
            from.is_premium ? 1 : null,
            from.is_bot ? 1 : 0,
            0,
            now
          ]
        );
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 保存用户信息失败:', err);
    }
  };

  // 保存用户消息的函数（incoming）
  const saveIncomingMessage = async (msg) => {
    try {
      const from = msg.from;
      if (!from) return;

      info(`[faBuBot] 保存消息: 聊天ID=${msg.chat.id}, 用户ID=${from.id}, 消息ID=${msg.message_id}`);

      const conn = await pool.getConnection();
      try {
        let messageType = 'text';
        let contentText = null;
        let fileId = null;
        let fileUniqueId = null;

        if (msg.text) {
          messageType = 'text';
          contentText = msg.text;
        } else if (msg.photo && msg.photo.length > 0) {
          messageType = 'photo';
          const photo = msg.photo[msg.photo.length - 1];
          fileId = photo.file_id;
          fileUniqueId = photo.file_unique_id;
        } else if (msg.video) {
          messageType = 'video';
          fileId = msg.video.file_id;
          fileUniqueId = msg.video.file_unique_id;
        } else if (msg.document) {
          messageType = 'document';
          fileId = msg.document.file_id;
          fileUniqueId = msg.document.file_unique_id;
        } else if (msg.audio) {
          messageType = 'audio';
          fileId = msg.audio.file_id;
          fileUniqueId = msg.audio.file_unique_id;
        } else if (msg.sticker) {
          messageType = 'sticker';
          fileId = msg.sticker.file_id;
          fileUniqueId = msg.sticker.file_unique_id;
        } else if (msg.animation) {
          messageType = 'animation';
          fileId = msg.animation.file_id;
          fileUniqueId = msg.animation.file_unique_id;
        } else {
          messageType = 'other';
        }

        // 判断是群聊还是私聊，保存到不同的表
        if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
          // 群聊消息保存到 fabubot_group_messages
          await conn.execute(
            `INSERT INTO fabubot_group_messages 
             (group_id, message_id, user_id, message_type, content_text, file_id, file_unique_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              msg.chat.id,
              msg.message_id,
              from.id,
              messageType,
              contentText,
              fileId,
              fileUniqueId
            ]
          );
        } else {
          // 私聊消息保存到 fabubot_messages
          let content = null;
          let fileSize = null;
          let mimeType = null;
          let duration = null;
          let width = null;
          let height = null;
          let caption = null;

          if (msg.text) {
            content = msg.text;
          } else if (msg.photo && msg.photo.length > 0) {
            const photo = msg.photo[msg.photo.length - 1];
            fileSize = photo.file_size;
            width = photo.width;
            height = photo.height;
            caption = msg.caption;
            content = `[图片] ${caption || ''}`;
          } else if (msg.video) {
            fileSize = msg.video.file_size;
            mimeType = msg.video.mime_type;
            duration = msg.video.duration;
            width = msg.video.width;
            height = msg.video.height;
            caption = msg.caption;
            content = `[视频] ${caption || ''}`;
          } else if (msg.document) {
            fileSize = msg.document.file_size;
            mimeType = msg.document.mime_type;
            caption = msg.caption;
            content = `[文件] ${msg.document.file_name || ''} ${caption || ''}`;
          } else if (msg.audio) {
            fileSize = msg.audio.file_size;
            mimeType = msg.audio.mime_type;
            duration = msg.audio.duration;
            content = `[音频]`;
          } else if (msg.sticker) {
            fileSize = msg.sticker.file_size;
            width = msg.sticker.width;
            height = msg.sticker.height;
            content = `[贴纸] ${msg.sticker.emoji || ''}`;
          }

          await conn.execute(
            `INSERT INTO fabubot_messages 
             (user_id, chat_id, message_id, direction, message_type, 
              content, file_id, file_unique_id, file_size, mime_type, 
              duration, width, height, caption, reply_to_message_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              from.id,
              msg.chat.id,
              msg.message_id,
              'incoming',
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
              msg.reply_to_message ? msg.reply_to_message.message_id : null
            ]
          );
        }
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 保存用户消息失败:', err);
    }
  };

  // 发送消息并保存的函数（使用messageService）
  const sendAndSaveMessage = async (chatId, text, options = {}, originalMsg = null) => {
    return await messageService.sendText(chatId, text, options, originalMsg);
  };

  // 检查用户是否被屏蔽的函数
  const checkUserBlocked = async (userId) => {
    try {
      const conn = await pool.getConnection();
      try {
        const [users] = await conn.execute(
          'SELECT is_blocked FROM fabubot_users WHERE user_id = ?',
          [userId]
        );
        if (users.length > 0 && users[0].is_blocked === 1) {
          return true;
        }
        return false;
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 检查用户屏蔽状态失败:', err);
      return false;
    }
  };

  // 检查用户是否为管理员的函数
  const checkUserAdmin = async (userId) => {
    try {
      const conn = await pool.getConnection();
      try {
        // 先检查表是否有 is_admin 字段
        const [columns] = await conn.execute(
          "SHOW COLUMNS FROM fabubot_users LIKE 'is_admin'"
        );
        
        if (columns.length === 0) {
          // 如果没有 is_admin 字段，默认用户不是管理员
          info('[faBuBot] is_admin 字段不存在，默认用户不是管理员');
          return false;
        }
        
        const [users] = await conn.execute(
          'SELECT is_admin FROM fabubot_users WHERE user_id = ?',
          [userId]
        );
        if (users.length > 0 && users[0].is_admin === 1) {
          return true;
        }
        return false;
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 检查用户管理员状态失败:', err);
      return false;
    }
  };

  // 检查命令是否需要管理员权限
  const checkCommandRequiresAdmin = async (commandText) => {
    try {
      const conn = await pool.getConnection();
      try {
        // 先尝试不带斜杠的命令
        let [commands] = await conn.execute(
          'SELECT isAdmin FROM fabubot_commands WHERE command = ?',
          [commandText]
        );
        
        // 如果没找到，尝试带斜杠的命令
        if (commands.length === 0) {
          const commandWithSlash = '/' + commandText;
          [commands] = await conn.execute(
            'SELECT isAdmin FROM fabubot_commands WHERE command = ?',
            [commandWithSlash]
          );
        }
        
        // 再尝试一下反向（如果 commandText 带斜杠，去掉斜杠再查）
        if (commands.length === 0 && commandText.startsWith('/')) {
          const commandWithoutSlash = commandText.substring(1);
          [commands] = await conn.execute(
            'SELECT isAdmin FROM fabubot_commands WHERE command = ?',
            [commandWithoutSlash]
          );
        }
        
        if (commands.length > 0 && commands[0].isAdmin === 1) {
          return true;
        }
        return false;
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 检查命令权限失败:', err);
      return false;
    }
  };

  // 命令拦截检查函数
  const checkCommandPermission = async (msg) => {
    try {
      const from = msg.from;
      if (!from) return { allowed: false, reason: '无效的消息' };

      // 检查用户是否被屏蔽
      const isBlocked = await checkUserBlocked(from.id);
      if (isBlocked) {
        return { allowed: false, reason: '抱歉，您已被屏蔽，无法使用机器人。' };
      }

      // 如果不是命令消息，直接允许
      if (!msg.text || !msg.text.startsWith('/')) {
        return { allowed: true };
      }

      // 提取命令名称（去掉前缀 / 和 @机器人名）
      let commandText = msg.text.split(' ')[0].substring(1);
      // 如果命令包含@，去掉@后面的部分
      if (commandText.includes('@')) {
        commandText = commandText.split('@')[0];
      }

      // 检查命令是否需要管理员权限
      const requiresAdmin = await checkCommandRequiresAdmin(commandText);
      
      if (requiresAdmin) {
        let isAdmin = false;
        // 判断是群组还是私聊
        if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
          // 在群组中，检查群组管理员权限
          try {
            // 直接从 group-commands.js 引入的 checkGroupAdmin 函数
            // 由于我们无法直接引用，重新实现一下
            const chatMember = await bot.getChatMember(msg.chat.id, from.id);
            isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
          } catch (err) {
            error('[faBuBot] 从 Telegram API 检查群组管理员失败:', err);
          }
        } else {
          // 在私聊中，检查全局管理员权限
          isAdmin = await checkUserAdmin(from.id);
        }
        
        if (!isAdmin) {
          return { allowed: false, reason: '抱歉，此命令仅限管理员使用。' };
        }
      }

      return { allowed: true }
    } catch (err) {
      error('[faBuBot] 检查命令权限失败:', err);
      return { allowed: false, reason: '权限检查失败，请稍后重试。' };
    }
  };

  // 从数据库加载所有启用的命令
  const loadEnabledCommands = async () => {
    try {
      const conn = await pool.getConnection();
      try {
        const [commands] = await conn.execute('SELECT * FROM fabubot_commands WHERE isEnabled = 1');
        return commands;
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 加载命令列表失败:', err);
      return [];
    }
  };

  // 注册所有命令
  const registerAllCommands = async (enabledCommands) => {
    // 按命令长度降序排序，这样长的命令先注册，避免短命令先匹配
    const sortedCommands = [...enabledCommands].sort((a, b) => {
      const cleanA = a.command.startsWith('/') ? a.command.substring(1) : a.command;
      const cleanB = b.command.startsWith('/') ? b.command.substring(1) : b.command;
      return cleanB.length - cleanA.length;
    });
    
    for (const cmd of sortedCommands) {
      // 如果命令已经以斜杠开头，就不再加斜杠
      const cleanCommand = cmd.command.startsWith('/') ? cmd.command.substring(1) : cmd.command;
      // 使用简单的正则表达式，只匹配命令本身
      const commandPattern = new RegExp(`^\\/${cleanCommand}\\b`);
      
      bot.onText(commandPattern, async (msg) => {
        try {
          const from = msg.from;
          
          // 额外检查：确保命令完全匹配（处理带@机器人名的命令）
          let receivedCommand = msg.text.split(' ')[0].substring(1);
          // 如果命令包含@，去掉@后面的部分
          if (receivedCommand.includes('@')) {
            receivedCommand = receivedCommand.split('@')[0];
          }
          const expectedCommand = cmd.command.startsWith('/') ? cmd.command.substring(1) : cmd.command;
          if (receivedCommand !== expectedCommand) {
            return; // 不匹配，直接返回
          }
          
          // 保存命令消息
          await saveIncomingMessage(msg);
          
          // 保存用户信息（频道消息的 from 可能为 null）
          if (from) {
            await saveUser(msg);
          }
          
          // 群组和私聊消息需要 from（频道消息已在 message 事件中过滤）
          if (!from) return;
          
          // 检查命令权限
          const permission = await checkCommandPermission(msg);
          if (!permission.allowed) {
            await sendAndSaveMessage(msg.chat.id, permission.reason, {}, msg);
            return;
          }
          
          // 根据命令名称处理
          const cleanCmd = cmd.command.startsWith('/') ? cmd.command.substring(1) : cmd.command;
          
          // 解析命令参数
          const args = msg.text.split(' ').slice(1);
          
          // 自动保存群组信息（如果是群组消息）
          await autoSaveGroupAndMember(msg);
          
          if (cleanCmd === 'start') {
            // 发送欢迎消息
            const welcomeMessage = `👋 欢迎使用 faBuBot！

很高兴为您服务。您可以使用以下命令：
/sj - 随机发送媒体
/addgroup - 添加此群组到管理
/help - 查看帮助

如有任何问题，请随时联系管理员。`;
            
            await sendAndSaveMessage(msg.chat.id, welcomeMessage, {}, msg);
          } else if (cleanCmd === 'sj') {
            randomSender.handleCommand(msg);
          } else if (cleanCmd === 'addgroup') {
            await handleAddGroupCommand(msg);
          } else if (cleanCmd === 'warn') {
            await groupCommandsModule.handleWarn(msg, args);
          } else if (cleanCmd === 'unwarn') {
            await groupCommandsModule.handleUnwarn(msg, args);
          } else if (cleanCmd === 'warnings') {
            await groupCommandsModule.handleWarnings(msg, args);
          } else if (cleanCmd === 'ban') {
            await groupCommandsModule.handleBan(msg, args);
          } else if (cleanCmd === 'tban') {
            await groupCommandsModule.handleTBan(msg, args);
          } else if (cleanCmd === 'unban') {
            await groupCommandsModule.handleUnban(msg, args);
          } else if (cleanCmd === 'banlist') {
            await groupCommandsModule.handleBanList(msg);
          } else if (cleanCmd === 'kick') {
            await groupCommandsModule.handleKick(msg, args);
          } else if (cleanCmd === 'setrules') {
            await groupCommandsModule.handleSetRules(msg, args);
          } else if (cleanCmd === 'rules') {
            await groupCommandsModule.handleRules(msg);
          } else if (cleanCmd === 'addword') {
            await groupCommandsModule.handleAddWord(msg, args);
          } else if (cleanCmd === 'delword') {
            await groupCommandsModule.handleDelWord(msg, args);
          } else if (cleanCmd === 'wordlist') {
            await groupCommandsModule.handleWordList(msg);
          } else if (cleanCmd === 'delete') {
            await groupCommandsModule.handleDelete(msg);
          } else if (cleanCmd === 'pin') {
            await groupCommandsModule.handlePin(msg);
          } else if (cleanCmd === 'unpin') {
            await groupCommandsModule.handleUnpin(msg);
          } else if (cleanCmd === 'help') {
            await groupCommandsModule.handleHelp(msg);
          } else if (cleanCmd === 'mywarns') {
            await groupCommandsModule.handleMyWarns(msg);
          } else if (cleanCmd === 'mute') {
            await groupCommandsModule.handleMute(msg, args);
          } else if (cleanCmd === 'unmute') {
            await groupCommandsModule.handleUnmute(msg, args);
          } else if (cleanCmd === 'promote') {
            await groupCommandsModule.handlePromote(msg, args);
          } else if (cleanCmd === 'demote') {
            await groupCommandsModule.handleDemote(msg, args);
          } else if (cleanCmd === 'adminlist') {
            await groupCommandsModule.handleAdminList(msg);
          } else if (cleanCmd === 'purge') {
            await groupCommandsModule.handlePurge(msg, args);
          } else if (cleanCmd === 'settings') {
            await groupCommandsModule.handleSettings(msg, args);
          } else if (cleanCmd === 'gban') {
            await groupCommandsModule.handleGBan(msg, args);
          } else if (cleanCmd === 'gunban') {
            await groupCommandsModule.handleGUnban(msg, args);
          } else if (cleanCmd === 'report') {
            await groupCommandsModule.handleReport(msg);
          } else if (cleanCmd === 'mediagroups') {
            await handleMediaGroupsCommand(msg, args);
          } else if (cleanCmd === 'singlevideos') {
            await handleSingleVideosCommand(msg, args);
          } else if (cleanCmd === 'addchannel') {
            await handleAddChannelCommand(msg);
          } else if (cleanCmd === 'listchannels') {
            await handleListChannelsCommand(msg);
          }
        } catch (err) {
          error(`[faBuBot] 处理 /${cmd.command} 命令失败:`, err);
        }
      });
    }
  };

  // 处理多媒体消息查询命令（管理员）
  const handleMediaGroupsCommand = async (msg, args, callbackQuery = null) => {
    try {
      const from = msg.from || callbackQuery.from;
      const chatId = msg.chat?.id || callbackQuery.message.chat.id;
      const messageId = callbackQuery?.message.message_id;
      
      if (!from) return;

      // 检查是否为管理员
      const isAdmin = await checkUserAdmin(from.id);
      if (!isAdmin) {
        await sendAndSaveMessage(chatId, '抱歉，此命令仅限管理员使用。', {}, msg);
        return;
      }

      const page = parseInt(args[0]) || 1;
      const pageSize = 10;
      const offset = (page - 1) * pageSize;

      const conn = await pool.getConnection();
      try {
        const [mediaGroups] = await conn.execute(
          `SELECT g.id, g.media_group_id, g.chat_id, g.username, g.message_count, g.created_at, g.forwarded_message_ids, 
                  (SELECT i.caption FROM fabubot_media_items i WHERE i.media_group_id = g.media_group_id AND i.caption != '' LIMIT 1) as caption
           FROM fabubot_media_groups g
           ORDER BY g.created_at DESC 
           LIMIT ? OFFSET ?`,
          [pageSize, offset]
        );

        const [totalResult] = await conn.execute(
          'SELECT COUNT(*) as total FROM fabubot_media_groups'
        );
        const total = totalResult[0].total;
        const totalPages = Math.ceil(total / pageSize);

        if (mediaGroups.length === 0) {
          await sendAndSaveMessage(chatId, '暂无多媒体消息记录。', {}, msg);
          return;
        }

        let message = `📋 多媒体消息列表 - 第 ${page}/${totalPages} 页\n\n`;
        mediaGroups.forEach((group, index) => {
          const caption = group.caption || '无标题';
          const shortCaption = caption.length > 50 ? caption.substring(0, 50) + '...' : caption;
          message += `${index + 1 + offset}. ${shortCaption}\n\n`;
        });

        // 构建 Inline Keyboard - 一行显示5个查看按钮
        const keyboard = [];
        let currentRow = [];
        mediaGroups.forEach((group, index) => {
          const displayIndex = index + 1 + offset;
          currentRow.push({
            text: `📋 ${displayIndex}`,
            callback_data: `mg_detail_${group.id}`
          });
          // 每5个按钮一行
          if (currentRow.length === 5) {
            keyboard.push(currentRow);
            currentRow = [];
          }
        });
        // 添加剩余的按钮
        if (currentRow.length > 0) {
          keyboard.push(currentRow);
        }

        // 添加分页按钮
        const paginationRow = [];
        if (page > 1) {
          paginationRow.push({
            text: '⬅️ 上一页',
            callback_data: `mediagroups_${page - 1}`
          });
        }
        if (page < totalPages) {
          paginationRow.push({
            text: '下一页 ➡️',
            callback_data: `mediagroups_${page + 1}`
          });
        }
        if (paginationRow.length > 0) {
          keyboard.push(paginationRow);
        }

        if (messageId) {
          // 编辑现有消息
          await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined
          });
        } else {
          await sendAndSaveMessage(chatId, message, {
            reply_markup: {
              inline_keyboard: keyboard
            }
          }, msg);
        }
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 处理 /mediagroups 命令失败:', err);
      await sendAndSaveMessage(msg.chat?.id || callbackQuery.message.chat.id, '查询多媒体消息失败，请稍后重试。', {}, msg);
    }
  };

  // 查看多媒体消息详情
  const viewMediaGroupDetail = async (groupId, chatId, messageId) => {
    const conn = await pool.getConnection();
    try {
      const [mediaGroups] = await conn.execute(
        `SELECT g.id, g.media_group_id, g.chat_id, g.username, g.message_count, g.created_at, g.forwarded_message_ids, 
                (SELECT i.caption FROM fabubot_media_items i WHERE i.media_group_id = g.media_group_id AND i.caption != '' LIMIT 1) as caption
         FROM fabubot_media_groups g
         WHERE g.id = ?`,
        [groupId]
      );

      if (mediaGroups.length === 0) {
        await bot.sendMessage(chatId, '未找到该多媒体消息记录。');
        return;
      }

      const group = mediaGroups[0];
      let message = `📋 多媒体消息详情\n\n`;
      message += `ID: ${group.id}\n`;
      message += `媒体组ID: ${group.media_group_id}\n`;
      message += `聊天ID: ${group.chat_id}\n`;
      message += `用户名: ${group.username || '-'}\n`;
      message += `消息数: ${group.message_count}\n`;
      message += `创建时间: ${new Date(group.created_at).toLocaleString()}\n`;
      message += `\n标题:\n${group.caption || '无'}`;

      // 解析并显示转发消息ID
      let keyboard = [
        [
          { text: '📤 发送媒体', callback_data: `mg_send_${group.id}` },
          { text: '🔙 返回列表', callback_data: 'mediagroups_1' }
        ]
      ];
      
      if (group.forwarded_message_ids) {
        try {
          const forwardedData = JSON.parse(group.forwarded_message_ids);
          const chatIds = Object.keys(forwardedData);
          
          if (chatIds.length > 0) {
            message += `\n\n🔗 跳转链接:\n`;
            const linkTexts = [];
            
            for (const chatIdKey of chatIds) {
              const messageIds = forwardedData[chatIdKey];
              // 转换为 Telegram 链接格式
              let linkChatId = chatIdKey;
              if (linkChatId.startsWith('-100')) {
                linkChatId = linkChatId.substring(4); // 去掉 -100
              }
              
              if (Array.isArray(messageIds)) {
                messageIds.forEach((msgId, index) => {
                  const url = `https://t.me/c/${linkChatId}/${msgId}`;
                  linkTexts.push(`[消息${index + 1}](${url})`);
                });
              } else if (typeof messageIds === 'number') {
                const url = `https://t.me/c/${linkChatId}/${messageIds}`;
                linkTexts.push(`[消息1](${url})`);
              }
            }
            
            message += linkTexts.join('、');
          }
        } catch (e) {
          message += `\n\n🔗 跳转链接: 解析失败`;
        }
      }

      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: keyboard
        },
        parse_mode: 'Markdown'
      });
    } finally {
      conn.release();
    }
  };

  // 发送多媒体消息给用户
  const sendMediaGroup = async (groupId, chatId) => {
    const conn = await pool.getConnection();
    try {
      const [mediaItems] = await conn.execute(
        `SELECT file_id, type, caption 
         FROM fabubot_media_items 
         WHERE media_group_id = (SELECT media_group_id FROM fabubot_media_groups WHERE id = ?)
         ORDER BY id`,
        [groupId]
      );

      if (mediaItems.length === 0) {
        await bot.sendMessage(chatId, '未找到该多媒体消息的媒体文件。');
        return;
      }

      // 查找第一个非空的 caption
      const itemWithCaption = mediaItems.find(item => item.caption && item.caption.trim() !== '');
      let mainCaption = itemWithCaption ? itemWithCaption.caption : '';
      
      // 按类型分组媒体文件
      const photos = mediaItems.filter(item => item.type === 'photo');
      const videos = mediaItems.filter(item => item.type === 'video');
      const documents = mediaItems.filter(item => item.type === 'document');
      const audios = mediaItems.filter(item => item.type === 'audio');

      // 发送媒体组
      if (photos.length > 0 || videos.length > 0) {
        const mediaGroup = [];
        let hasCaption = false;
        photos.forEach((photo, index) => {
          const caption = !hasCaption && mainCaption ? mainCaption : '';
          hasCaption = hasCaption || (caption !== '');
          mediaGroup.push({
            type: 'photo',
            media: photo.file_id,
            caption: caption
          });
        });
        videos.forEach((video) => {
          const caption = !hasCaption && mainCaption ? mainCaption : '';
          hasCaption = hasCaption || (caption !== '');
          mediaGroup.push({
            type: 'video',
            media: video.file_id,
            caption: caption
          });
        });

        try {
          await bot.sendMediaGroup(chatId, mediaGroup);
          info(`[faBuBot] 成功发送多媒体消息: ${groupId}`);
        } catch (err) {
          error('[faBuBot] 发送多媒体消息失败:', err);
          if (err.code === 'ETELEGRAM' && err.response && err.response.statusCode === 400) {
            await bot.sendMessage(chatId, '发送失败：文件ID无效或已过期，请重新获取媒体文件。', {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🗑️ 删除该多媒体消息', callback_data: `mg_delete_${groupId}` }]
                ]
              }
            });
          } else {
            await bot.sendMessage(chatId, '发送多媒体消息失败，请稍后重试。');
          }
        }
      } else {
        // 如果没有图片或视频，单独发送文档或音频
        let successCount = 0;
        for (let i = 0; i < mediaItems.length; i++) {
          const item = mediaItems[i];
          try {
            if (item.type === 'document') {
              await bot.sendDocument(chatId, item.file_id, {
                caption: i === 0 ? mainCaption : undefined
              });
              successCount++;
            } else if (item.type === 'audio') {
              await bot.sendAudio(chatId, item.file_id, {
                caption: i === 0 ? mainCaption : undefined
              });
              successCount++;
            }
          } catch (err) {
            error('[faBuBot] 发送媒体文件失败:', err);
          }
        }
        if (successCount > 0) {
          info(`[faBuBot] 成功发送 ${successCount}/${mediaItems.length} 个媒体文件: ${groupId}`);
        } else {
          await bot.sendMessage(chatId, '发送失败：文件ID无效或已过期，请重新获取媒体文件。', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🗑️ 删除该多媒体消息', callback_data: `mg_delete_${groupId}` }]
              ]
            }
          });
        }
      }
    } catch (err) {
      error('[faBuBot] 发送多媒体消息异常:', err);
      await bot.sendMessage(chatId, '发送多媒体消息时发生异常，请稍后重试。');
    } finally {
      conn.release();
    }
  };

  // 删除多媒体消息
  const deleteMediaGroup = async (groupId, chatId) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      
      // 获取 media_group_id
      const [groups] = await conn.execute(
        'SELECT media_group_id FROM fabubot_media_groups WHERE id = ?',
        [groupId]
      );
      
      if (groups.length === 0) {
        await bot.sendMessage(chatId, '未找到该多媒体消息记录。');
        return;
      }
      
      const mediaGroupId = groups[0].media_group_id;
      
      // 删除关联的媒体项
      await conn.execute(
        'DELETE FROM fabubot_media_items WHERE media_group_id = ?',
        [mediaGroupId]
      );
      
      // 删除媒体组
      await conn.execute(
        'DELETE FROM fabubot_media_groups WHERE id = ?',
        [groupId]
      );
      
      await conn.commit();
      
      info(`[faBuBot] 删除多媒体消息成功: ${groupId}`);
      await bot.sendMessage(chatId, '✅ 已成功删除该多媒体消息及所有关联文件。');
    } catch (err) {
      await conn.rollback();
      error('[faBuBot] 删除多媒体消息失败:', err);
      await bot.sendMessage(chatId, '删除失败，请稍后重试。');
    } finally {
      conn.release();
    }
  };

  // 处理单视频消息查询命令（管理员）
  const handleSingleVideosCommand = async (msg, args, callbackQuery = null) => {
    try {
      const from = msg.from || callbackQuery.from;
      const chatId = msg.chat?.id || callbackQuery.message.chat.id;
      const messageId = callbackQuery?.message.message_id;
      
      if (!from) return;

      // 检查是否为管理员
      const isAdmin = await checkUserAdmin(from.id);
      if (!isAdmin) {
        await sendAndSaveMessage(chatId, '抱歉，此命令仅限管理员使用。', {}, msg);
        return;
      }

      const page = parseInt(args[0]) || 1;
      const pageSize = 10;
      const offset = (page - 1) * pageSize;

      const conn = await pool.getConnection();
      try {
        const [videos] = await conn.execute(
          `SELECT id, file_id, chat_id, user_id, duration, mime_type, timestamp, caption, forwarded_message_id, forwarded_message_ids 
           FROM fabubot_single_videos 
           ORDER BY timestamp DESC 
           LIMIT ? OFFSET ?`,
          [pageSize, offset]
        );

        const [totalResult] = await conn.execute(
          'SELECT COUNT(*) as total FROM fabubot_single_videos'
        );
        const total = totalResult[0].total;
        const totalPages = Math.ceil(total / pageSize);

        if (videos.length === 0) {
          await sendAndSaveMessage(chatId, '暂无单视频消息记录。', {}, msg);
          return;
        }

        let message = `🎬 单视频消息列表 - 第 ${page}/${totalPages} 页\n\n`;
        videos.forEach((video, index) => {
          const caption = video.caption || '无标题';
          const shortCaption = caption.length > 50 ? caption.substring(0, 50) + '...' : caption;
          message += `${index + 1 + offset}. ${shortCaption}\n\n`;
        });

        // 构建 Inline Keyboard - 为每个视频添加查看按钮，一行显示5个
        const keyboard = [];
        let currentRow = [];
        videos.forEach((video, index) => {
          const displayIndex = index + 1 + offset;
          currentRow.push({
            text: `📋 ${displayIndex}`,
            callback_data: `sv_detail_${video.id}`
          });
          // 每5个按钮一行
          if (currentRow.length === 5) {
            keyboard.push(currentRow);
            currentRow = [];
          }
        });
        // 添加剩余的按钮
        if (currentRow.length > 0) {
          keyboard.push(currentRow);
        }

        // 添加分页按钮
        const paginationRow = [];
        if (page > 1) {
          paginationRow.push({
            text: '⬅️ 上一页',
            callback_data: `singlevideos_${page - 1}`
          });
        }
        if (page < totalPages) {
          paginationRow.push({
            text: '下一页 ➡️',
            callback_data: `singlevideos_${page + 1}`
          });
        }
        if (paginationRow.length > 0) {
          keyboard.push(paginationRow);
        }

        if (messageId) {
          // 编辑现有消息
          await bot.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined
          });
        } else {
          await sendAndSaveMessage(chatId, message, {
            reply_markup: {
              inline_keyboard: keyboard
            }
          }, msg);
        }
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 处理 /singlevideos 命令失败:', err);
      await sendAndSaveMessage(msg.chat?.id || callbackQuery.message.chat.id, '查询单视频消息失败，请稍后重试。', {}, msg);
    }
  };

  // 查看单视频详情
  const viewSingleVideoDetail = async (videoId, chatId, messageId) => {
    const conn = await pool.getConnection();
    try {
      const [videos] = await conn.execute(
        `SELECT id, file_id, chat_id, user_id, duration, mime_type, timestamp, caption, forwarded_message_id, forwarded_message_ids 
         FROM fabubot_single_videos 
         WHERE id = ?`,
        [videoId]
      );

      if (videos.length === 0) {
        await bot.sendMessage(chatId, '未找到该视频记录。');
        return;
      }

      const video = videos[0];
      let message = `📋 视频详情\n\n`;
      message += `ID: ${video.id}\n`;
      message += `文件ID: ${video.file_id}\n`;
      message += `聊天ID: ${video.chat_id}\n`;
      message += `用户ID: ${video.user_id}\n`;
      message += `时长: ${video.duration ? `${video.duration}秒` : '-'}\n`;
      message += `MIME: ${video.mime_type || '-'}\n`;
      message += `创建时间: ${new Date(video.timestamp).toLocaleString()}\n`;
      message += `\n标题:\n${video.caption || '无'}`;

      // 解析并显示转发消息ID
      if (video.forwarded_message_ids) {
        try {
          const forwardedData = JSON.parse(video.forwarded_message_ids);
          const chatIds = Object.keys(forwardedData);
          
          if (chatIds.length > 0) {
            message += `\n\n🔗 跳转链接:\n`;
            const linkTexts = [];
            
            for (const chatIdKey of chatIds) {
              const messageIds = forwardedData[chatIdKey];
              let linkChatId = chatIdKey;
              if (linkChatId.startsWith('-100')) {
                linkChatId = linkChatId.substring(4);
              }
              
              if (Array.isArray(messageIds)) {
                messageIds.forEach((msgId, index) => {
                  const url = `https://t.me/c/${linkChatId}/${msgId}`;
                  linkTexts.push(`[消息${index + 1}](${url})`);
                });
              } else if (typeof messageIds === 'number') {
                const url = `https://t.me/c/${linkChatId}/${messageIds}`;
                linkTexts.push(`[消息1](${url})`);
              }
            }
            
            message += linkTexts.join('、');
          }
        } catch (e) {
          message += `\n\n🔗 跳转链接: 解析失败`;
        }
      }

      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📤 发送视频', callback_data: `sv_send_${video.id}` },
              { text: '🔙 返回列表', callback_data: 'singlevideos_1' }
            ]
          ]
        },
        parse_mode: 'Markdown'
      });
    } finally {
      conn.release();
    }
  };

  // 发送单视频给用户
  const sendSingleVideo = async (videoId, chatId) => {
    const conn = await pool.getConnection();
    try {
      const [videos] = await conn.execute(
        `SELECT file_id, caption 
         FROM fabubot_single_videos 
         WHERE id = ?`,
        [videoId]
      );

      if (videos.length === 0) {
        await bot.sendMessage(chatId, '未找到该视频记录。');
        return;
      }

      const video = videos[0];
      
      try {
        await bot.sendVideo(chatId, video.file_id, {
          caption: video.caption || undefined
        });
        info(`[faBuBot] 成功发送视频: ${videoId}`);
      } catch (err) {
        error('[faBuBot] 发送视频失败:', err);
        await bot.sendMessage(chatId, '发送视频失败，请稍后重试。');
      }
    } finally {
      conn.release();
    }
  };

  // 处理新成员加入
  bot.on('new_chat_members', async (msg) => {
    try {
      info(`[faBuBot] 新成员加入: 聊天ID=${msg.chat.id}, 类型=${msg.chat.type}, 新成员数=${msg.new_chat_members.length}`);
      
      // 只处理群组的新成员加入，频道使用 my_chat_member 事件处理
      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        await autoSaveGroupAndMember(msg);
        await groupFeaturesModule.handlePreJoinCheck(msg);
        await groupFeaturesModule.handleNewMember(msg);
      }
    } catch (err) {
      error('[faBuBot] 处理新成员加入失败:', err);
    }
  });

  // 处理机器人在聊天中的状态变化（频道管理）
  bot.on('my_chat_member', async (msg) => {
    try {
      await handleMyChatMember(msg);
    } catch (err) {
      error('[faBuBot] 处理 my_chat_member 事件失败:', err);
    }
  });

  // 处理成员离开
  bot.on('left_chat_member', async (msg) => {
    try {
      info(`[faBuBot] 成员离开: 群组ID=${msg.chat.id}, 用户=${msg.left_chat_member.username || msg.left_chat_member.first_name}`);
      
      await groupFeaturesModule.handleMemberLeft(msg);
    } catch (err) {
      error('[faBuBot] 处理成员离开失败:', err);
    }
  });

  // 消息处理
  bot.on('message', async (msg) => {
    try {
      const from = msg.from;
      
      info(`[faBuBot] 收到消息: 聊天ID=${msg.chat.id}, 类型=${msg.chat.type}, 用户ID=${from?.id}, 消息ID=${msg.message_id}`);

      // 先尝试处理服务消息
      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        await groupFeaturesModule.handleServiceMessage(msg);
      }
      
      // 自动保存频道信息
      if (msg.chat.type === 'channel') {
        await autoSaveChannel(msg);
      }

      // 如果是新成员或离开消息，已经被上面的处理器处理了
      if (msg.new_chat_members || msg.left_chat_member) {
        return;
      }
      
      // 如果是频道消息，单独处理（频道消息的 from 通常是 null）
      if (msg.chat.type === 'channel') {
        // 频道中只处理命令消息
        if (msg.text && msg.text.startsWith('/')) {
          // 保存消息记录
          await saveIncomingMessage(msg);
          // 检查并处理命令（命令处理由 onText 监听器处理）
        }
        // 频道消息不处理普通消息，只处理命令
        return;
      }
      
      // 群组和私聊消息需要 from
      if (!from) return;
      
      // 保存用户消息（但不保存命令消息，因为会在onText中单独处理）
      if (!msg.text || !msg.text.startsWith('/')) {
        await saveIncomingMessage(msg);
        await saveUser(msg);
      }
      
      // 检查命令权限
      const permission = await checkCommandPermission(msg);
      if (!permission.allowed) {
        info(`[faBuBot] 消息被拒绝: 用户ID=${from.id}, 原因=${permission.reason}`);
        return;
      }
      
      // 自动保存群组信息（如果是群组消息）
      await autoSaveGroupAndMember(msg);
      
      // 如果不是命令消息，处理核心功能（反垃圾、反链接等）
      if (!msg.text || !msg.text.startsWith('/')) {
        const messageHandled = await groupFeaturesModule.handleMessage(msg);
        if (messageHandled) {
          info(`[faBuBot] 消息被群组功能处理: 消息ID=${msg.message_id}`);
          return;
        }
        
        mediaHandler.handleMessage(msg);
        videoHandler.handleMessage(msg);
      }
    } catch (err) {
      error('[faBuBot] 处理消息失败:', err);
    }
  });

  // 处理回调查询（按钮点击）
  bot.on('callback_query', async (callbackQuery) => {
    try {
      const data = callbackQuery.data;
      if (!data) return;

      // 处理多媒体消息分页
      if (data.startsWith('mediagroups_')) {
        const page = parseInt(data.split('_')[1]);
        if (page && page > 0) {
          await handleMediaGroupsCommand({}, [page], callbackQuery);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理多媒体消息详情查看
      if (data.startsWith('mg_detail_')) {
        const groupId = parseInt(data.split('_')[2]);
        if (groupId && groupId > 0) {
          await viewMediaGroupDetail(groupId, callbackQuery.message.chat.id, callbackQuery.message.message_id);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理多媒体消息发送
      if (data.startsWith('mg_send_')) {
        const groupId = parseInt(data.split('_')[2]);
        if (groupId && groupId > 0) {
          await sendMediaGroup(groupId, callbackQuery.message.chat.id);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理多媒体消息删除
      if (data.startsWith('mg_delete_')) {
        const groupId = parseInt(data.split('_')[2]);
        if (groupId && groupId > 0) {
          await deleteMediaGroup(groupId, callbackQuery.message.chat.id);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理单视频消息分页
      if (data.startsWith('singlevideos_')) {
        const page = parseInt(data.split('_')[1]);
        if (page && page > 0) {
          await handleSingleVideosCommand({}, [page], callbackQuery);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理单视频详情查看
      if (data.startsWith('sv_detail_')) {
        const videoId = parseInt(data.split('_')[2]);
        if (videoId && videoId > 0) {
          await viewSingleVideoDetail(videoId, callbackQuery.message.chat.id, callbackQuery.message.message_id);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理单视频发送
      if (data.startsWith('sv_send_')) {
        const videoId = parseInt(data.split('_')[2]);
        if (videoId && videoId > 0) {
          await sendSingleVideo(videoId, callbackQuery.message.chat.id);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理查看已管理频道回调
      if (data.startsWith('showMyChannels_')) {
        const chatId = parseInt(data.split('_')[1]);
        if (chatId) {
          await handleShowMyChannels(chatId);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理频道管理回调
      if (data.startsWith('manageChannel_')) {
        const channelId = data.split('_')[1];
        if (channelId) {
          await handleManageChannel(callbackQuery.message.chat.id, callbackQuery.message.message_id, channelId);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理返回频道列表回调
      if (data === 'backToChannelList') {
        await handleShowMyChannels(callbackQuery.message.chat.id, callbackQuery.message.message_id);
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理查看已管理群组回调
      if (data.startsWith('showMyGroups_')) {
        const chatId = parseInt(data.split('_')[1]);
        if (chatId) {
          await handleShowMyGroups(chatId);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理群组管理回调
      if (data.startsWith('manageGroup_')) {
        const groupId = data.split('_')[1];
        if (groupId) {
          await handleManageGroup(callbackQuery.message.chat.id, callbackQuery.message.message_id, groupId);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // 处理返回群组列表回调
      if (data === 'backToGroupList') {
        await handleShowMyGroups(callbackQuery.message.chat.id, callbackQuery.message.message_id);
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }
    } catch (err) {
      error('[faBuBot] 处理回调查询失败:', err);
    }
  });

  // 加载并注册命令
  info('[faBuBot] 开始加载并注册命令...');
  
  const enabledCommands = await loadEnabledCommands();
  await registerAllCommands(enabledCommands);
  
  info('[faBuBot] 机器人注册模块初始化完成');

  return {
    saveUser,
    saveIncomingMessage,
    sendAndSaveMessage,
    checkUserBlocked,
    checkUserAdmin,
    checkCommandRequiresAdmin,
    checkCommandPermission
  };
};
