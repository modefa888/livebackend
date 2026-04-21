const groupRegister = require('./group-register');
const groupCommands = require('../commands/group-commands');
const groupFeatures = require('./group-features');
const { info, error, warn, logCommand, logMessage, logGroupAction } = require('../utils/logger.js');

module.exports = async (bot, pool, messageService, mediaHandler, videoHandler, randomSender) => {
  info('[faBuBot] 开始初始化机器人注册模块...');
  
  // 初始化群组管理模块
  const groupRegisterModule = groupRegister(bot, pool, messageService);
  const { saveGroup, saveGroupMember, logGroupAction, handleAddGroupCommand, autoSaveGroupAndMember } = groupRegisterModule;

  // 初始化群组命令模块
  const groupCommandsModule = groupCommands(bot, pool, messageService, groupRegisterModule);

  // 初始化群组核心功能模块
  const groupFeaturesModule = groupFeatures(bot, pool, messageService, groupRegisterModule);
  
  info('[faBuBot] 群组管理模块初始化完成');

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
          if (!from) return;
          
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
          
          // 保存用户信息
          await saveUser(msg);
          
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
          }
        } catch (err) {
          error(`[faBuBot] 处理 /${cmd.command} 命令失败:`, err);
        }
      });
    }
  };

  // 处理新成员加入
  bot.on('new_chat_members', async (msg) => {
    try {
      info(`[faBuBot] 新成员加入: 群组ID=${msg.chat.id}, 新成员数=${msg.new_chat_members.length}`);
      
      await autoSaveGroupAndMember(msg);
      await groupFeaturesModule.handlePreJoinCheck(msg);
      await groupFeaturesModule.handleNewMember(msg);
    } catch (err) {
      error('[faBuBot] 处理新成员加入失败:', err);
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
      
      info(`[faBuBot] 收到消息: 聊天ID=${msg.chat.id}, 用户ID=${from?.id}, 消息ID=${msg.message_id}`);

      // 先尝试处理服务消息
      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        await groupFeaturesModule.handleServiceMessage(msg);
      }

      if (!from) return;

      // 如果是新成员或离开消息，已经被上面的处理器处理了
      if (msg.new_chat_members || msg.left_chat_member) {
        return;
      }
      
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
