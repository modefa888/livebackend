// =============================================================
// faBuBot 群组管理命令模块
// =============================================================

const { info, error, warn, logCommand, logGroupAction: logGroupEvent } = require('../utils/logger.js');

module.exports = (bot, pool, messageService, groupRegisterModule) => {
  const { saveGroup, saveGroupMember, logGroupAction, autoSaveGroupAndMember } = groupRegisterModule;

  // 解析用户ID（支持回复消息或 @username）
  const parseUserId = async (msg, args, index = 0) => {
    // 如果是回复消息
    if (msg.reply_to_message && msg.reply_to_message.from) {
      return {
        id: msg.reply_to_message.from.id,
        username: msg.reply_to_message.from.username,
        first_name: msg.reply_to_message.from.first_name
      };
    }
    // 如果是 @username
    if (args[index] && args[index].startsWith('@')) {
      const username = args[index].substring(1);
      try {
        const chat = await bot.getChat(username);
        if (chat && chat.id) {
          return {
            id: chat.id,
            username: username,
            first_name: chat.first_name || username
          };
        }
      } catch (e) {
        return null;
      }
    }
    // 如果是纯数字ID
    if (args[index] && /^\d+$/.test(args[index])) {
      return {
        id: parseInt(args[index]),
        username: null,
        first_name: args[index]
      };
    }
    return null;
  };

  // 检查用户是否为群组管理员
  const checkGroupAdmin = async (chatId, userId) => {
    try {
      // 首先从 Telegram API 获取（最准确）
      const chatMember = await bot.getChatMember(chatId, userId);
      if (chatMember.status === 'administrator' || chatMember.status === 'creator') {
        return true;
      }
    } catch (err) {
      error('[faBuBot] 从 Telegram API 检查管理员失败:', err);
    }
    
    try {
      // 如果 Telegram API 失败，尝试从数据库获取
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.execute(
          'SELECT is_admin, is_owner FROM fabubot_group_members WHERE group_id = ? AND user_id = ?',
          [chatId, userId]
        );
        if (rows.length > 0) {
          return rows[0].is_admin === 1 || rows[0].is_owner === 1;
        }
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 从数据库检查管理员失败:', error);
    }
    
    return false;
  };

  // 检查机器人是否为管理员
  const checkBotAdmin = async (chatId) => {
    try {
      const botInfo = await bot.getMe();
      const chatMember = await bot.getChatMember(chatId, botInfo.id);
      return chatMember.status === 'administrator';
    } catch (err) {
      error('[faBuBot] 检查机器人管理员失败:', error);
      return false;
    }
  };

  // /warn 命令 - 警告用户
  const handleWarn = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    // 检查是否为管理员
    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    // 检查机器人是否为管理员
    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/warn <用户> <原因>', {}, msg);
      return;
    }

    const reason = args.slice(1).join(' ') || '未提供原因';

    try {
      const conn = await pool.getConnection();
      try {
        const now = new Date();
        
        // 保存警告记录
        await conn.execute(
          `INSERT INTO fabubot_group_warnings 
           (group_id, user_id, warned_by, reason, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [chatId, targetUser.id, fromId, reason, now]
        );

        // 统计警告次数
        const [warnings] = await conn.execute(
          'SELECT COUNT(*) as count FROM fabubot_group_warnings WHERE group_id = ? AND user_id = ?',
          [chatId, targetUser.id]
        );
        const warningCount = warnings[0].count;

        // 记录操作日志
        await logGroupAction(chatId, 'user_warn', targetUser.id, fromId, {
          reason: reason,
          warning_count: warningCount
        }, msg.message_id);

        // 发送警告消息
        const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
        let response = `⚠️ **用户警告** ⚠️\n\n`;
        response += `👤 用户: ${userMention}\n`;
        response += `📋 原因: ${reason}\n`;
        response += `📊 警告次数: ${warningCount}`;

        await messageService.sendText(chatId, response, { parse_mode: 'Markdown' }, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 警告用户失败:', error);
      await messageService.sendText(chatId, '❌ 警告用户失败！', {}, msg);
    }
  };

  // /unwarn 命令 - 取消警告
  const handleUnwarn = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/unwarn <用户>', {}, msg);
      return;
    }

    try {
      const conn = await pool.getConnection();
      try {
        // 删除最新的警告记录
        await conn.execute(
          'DELETE FROM fabubot_group_warnings WHERE group_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
          [chatId, targetUser.id]
        );

        // 记录操作日志
        await logGroupAction(chatId, 'user_unwarn', targetUser.id, fromId, { 
          target_username: targetUser.username,
          target_first_name: targetUser.first_name
        }, msg.message_id);

        const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
        await messageService.sendText(chatId, `✅ 已取消 ${userMention} 的最新警告！`, {}, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 取消警告失败:', error);
      await messageService.sendText(chatId, '❌ 取消警告失败！', {}, msg);
    }
  };

  // /warnings 命令 - 查看用户警告记录
  const handleWarnings = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args) || { id: fromId, username: msg.from.username, first_name: msg.from.first_name };

    try {
      const conn = await pool.getConnection();
      try {
        const [warnings] = await conn.execute(
          `SELECT w.*, u.username as admin_username, u.first_name as admin_first_name 
           FROM fabubot_group_warnings w 
           LEFT JOIN fabubot_users u ON w.warned_by = u.user_id 
           WHERE w.group_id = ? AND w.user_id = ? 
           ORDER BY w.created_at DESC`,
          [chatId, targetUser.id]
        );

        const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
        
        if (warnings.length === 0) {
          await messageService.sendText(chatId, `📋 ${userMention} 没有警告记录`, {}, msg);
          return;
        }

        let response = `📋 **${userMention} 的警告记录** 📋\n\n`;
        response += `共 ${warnings.length} 条警告\n\n`;

        warnings.forEach((w, index) => {
          const adminName = w.admin_username ? `@${w.admin_username}` : w.admin_first_name || '管理员';
          response += `${index + 1}. 原因: ${w.reason}\n`;
          response += `   管理员: ${adminName}\n`;
          response += `   时间: ${new Date(w.created_at).toLocaleString()}\n\n`;
        });

        await messageService.sendText(chatId, response, { parse_mode: 'Markdown' }, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 查看警告记录失败:', error);
      await messageService.sendText(chatId, '❌ 查看警告记录失败！', {}, msg);
    }
  };

  // 解析时间（如 1d, 2h, 30m）
  const parseTime = (timeStr) => {
    const match = timeStr.match(/^(\d+)([dhm])$/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];

    let multiplier;
    switch (unit) {
      case 'd': multiplier = 24 * 60 * 60 * 1000; break;
      case 'h': multiplier = 60 * 60 * 1000; break;
      case 'm': multiplier = 60 * 1000; break;
      default: return null;
    }

    return Date.now() + (value * multiplier);
  };

  // /ban 命令 - 永久封禁用户
  const handleBan = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/ban <用户> <原因>', {}, msg);
      return;
    }

    const reason = args.slice(1).join(' ') || '未提供原因';

    try {
      // 执行封禁
      await bot.banChatMember(chatId, targetUser.id);

      const conn = await pool.getConnection();
      try {
        const now = new Date();
        
        await conn.execute(
          `INSERT INTO fabubot_group_bans 
           (group_id, user_id, banned_by, reason, ban_until, created_at)
           VALUES (?, ?, ?, ?, NULL, ?)`,
          [chatId, targetUser.id, fromId, reason, now]
        );

        await logGroupAction(chatId, 'user_ban', targetUser.id, fromId, {
          reason: reason,
          ban_type: 'permanent'
        }, msg.message_id);

        const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
        await messageService.sendText(chatId, `🔨 **用户已封禁** 🔨\n\n👤 用户: ${userMention}\n📋 原因: ${reason}\n⏰ 类型: 永久封禁`, { parse_mode: 'Markdown' }, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 封禁用户失败:', error);
      await messageService.sendText(chatId, '❌ 封禁用户失败！请确保我有足够的权限。', {}, msg);
    }
  };

  // /tban 命令 - 临时封禁用户
  const handleTBan = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser || args.length < 2) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/tban <用户> <时间> <原因>\n时间格式：1d(天), 2h(小时), 30m(分钟)', {}, msg);
      return;
    }

    const timeStr = args[1];
    const untilDate = parseTime(timeStr);
    if (!untilDate) {
      await messageService.sendText(chatId, '❌ 时间格式错误！请使用：1d(天), 2h(小时), 30m(分钟)', {}, msg);
      return;
    }

    const reason = args.slice(2).join(' ') || '未提供原因';

    try {
      await bot.banChatMember(chatId, targetUser.id, Math.floor(untilDate / 1000));

      const conn = await pool.getConnection();
      try {
        const now = new Date();
        
        await conn.execute(
          `INSERT INTO fabubot_group_bans 
           (group_id, user_id, banned_by, reason, ban_until, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [chatId, targetUser.id, fromId, reason, new Date(untilDate), now]
        );

        await logGroupAction(chatId, 'user_ban', targetUser.id, fromId, {
          reason: reason,
          ban_type: 'temporary',
          until: new Date(untilDate).toLocaleString()
        }, msg.message_id);

        const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
        await messageService.sendText(chatId, `🔨 **用户已临时封禁** 🔨\n\n👤 用户: ${userMention}\n📋 原因: ${reason}\n⏰ 解封时间: ${new Date(untilDate).toLocaleString()}`, { parse_mode: 'Markdown' }, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 临时封禁用户失败:', error);
      await messageService.sendText(chatId, '❌ 临时封禁用户失败！请确保我有足够的权限。', {}, msg);
    }
  };

  // /unban 命令 - 解封用户
  const handleUnban = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/unban <用户>', {}, msg);
      return;
    }

    try {
      await bot.unbanChatMember(chatId, targetUser.id, { only_if_banned: true });

      const conn = await pool.getConnection();
      try {
        await conn.execute(
          'UPDATE fabubot_group_bans SET is_active = 0, unbanned_by = ?, unbanned_at = NOW() WHERE group_id = ? AND user_id = ? AND is_active = 1',
          [fromId, chatId, targetUser.id]
        );

        await logGroupAction(chatId, 'user_unban', targetUser.id, fromId, { 
          target_username: targetUser.username,
          target_first_name: targetUser.first_name
        }, msg.message_id);

        const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
        await messageService.sendText(chatId, `✅ ${userMention} 已成功解封！`, {}, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 解封用户失败:', error);
      await messageService.sendText(chatId, '❌ 解封用户失败！', {}, msg);
    }
  };

  // /banlist 命令 - 查看封禁列表
  const handleBanList = async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    try {
      const conn = await pool.getConnection();
      try {
        const [bans] = await conn.execute(
          `SELECT b.*, u.username as user_username, u.first_name as user_first_name,
                  a.username as admin_username, a.first_name as admin_first_name
           FROM fabubot_group_bans b
           LEFT JOIN fabubot_users u ON b.user_id = u.user_id
           LEFT JOIN fabubot_users a ON b.banned_by = a.user_id
           WHERE b.group_id = ? AND b.is_active = 1
           ORDER BY b.created_at DESC`,
          [chatId]
        );

        if (bans.length === 0) {
          await messageService.sendText(chatId, '📋 当前没有封禁记录', {}, msg);
          return;
        }

        let response = `📋 **封禁列表** 📋\n\n`;
        response += `共 ${bans.length} 条封禁记录\n\n`;

        bans.forEach((ban, index) => {
          const userName = ban.user_username ? `@${ban.user_username}` : ban.user_first_name || ban.user_id;
          const adminName = ban.admin_username ? `@${ban.admin_username}` : ban.admin_first_name || '管理员';
          response += `${index + 1}. 用户: ${userName}\n`;
          response += `   原因: ${ban.reason}\n`;
          response += `   类型: ${ban.ban_until ? '临时' : '永久'}\n`;
          if (ban.ban_until) {
            response += `   解封: ${new Date(ban.ban_until).toLocaleString()}\n`;
          }
          response += `   管理员: ${adminName}\n`;
          response += `   时间: ${new Date(ban.created_at).toLocaleString()}\n\n`;
        });

        await messageService.sendText(chatId, response, { parse_mode: 'Markdown' }, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 查看封禁列表失败:', error);
      await messageService.sendText(chatId, '❌ 查看封禁列表失败！', {}, msg);
    }
  };

  // /kick 命令 - 踢出用户
  const handleKick = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/kick <用户> <原因>', {}, msg);
      return;
    }

    const reason = args.slice(1).join(' ') || '未提供原因';

    try {
      await bot.banChatMember(chatId, targetUser.id);
      await bot.unbanChatMember(chatId, targetUser.id, { only_if_banned: true });

      await logGroupAction(chatId, 'user_kick', targetUser.id, fromId, { reason }, msg.message_id);

      const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
      await messageService.sendText(chatId, `👢 **用户已踢出** 👢\n\n👤 用户: ${userMention}\n📋 原因: ${reason}`, { parse_mode: 'Markdown' }, msg);
    } catch (err) {
      error('[faBuBot] 踢出用户失败:', error);
      await messageService.sendText(chatId, '❌ 踢出用户失败！请确保我有足够的权限。', {}, msg);
    }
  };



  // /setrules 命令 - 设置群规则
  const handleSetRules = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    const rulesText = args.join(' ');
    if (!rulesText) {
      await messageService.sendText(chatId, '❌ 请提供群规则！\n使用方法：/setrules <群规则>', {}, msg);
      return;
    }

    try {
      const conn = await pool.getConnection();
      try {
        const now = new Date();
        await conn.execute(
          `INSERT INTO fabubot_group_rules 
           (group_id, rules_text, created_at)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
             rules_text = VALUES(rules_text),
             updated_at = VALUES(created_at)`,
          [chatId, rulesText, now]
        );

        await logGroupAction(chatId, 'rules_change', null, fromId, { 
          rules_length: rulesText.length,
          rules_preview: rulesText.substring(0, 50) + (rulesText.length > 50 ? '...' : '')
        }, msg.message_id);
        await messageService.sendText(chatId, '✅ 群规则设置成功！', {}, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 设置群规则失败:', error);
      await messageService.sendText(chatId, '❌ 设置群规则失败！', {}, msg);
    }
  };

  // /rules 命令 - 查看群规则
  const handleRules = async (msg) => {
    const chatId = msg.chat.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    try {
      const conn = await pool.getConnection();
      try {
        const [rules] = await conn.execute(
          'SELECT rules_text FROM fabubot_group_rules WHERE group_id = ?',
          [chatId]
        );

        if (rules.length === 0 || !rules[0].rules_text) {
          await messageService.sendText(chatId, '📋 本群暂未设置规则', {}, msg);
          return;
        }

        await messageService.sendText(chatId, `📋 **群规则** 📋\n\n${rules[0].rules_text}`, { parse_mode: 'Markdown' }, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 查看群规则失败:', error);
      await messageService.sendText(chatId, '❌ 查看群规则失败！', {}, msg);
    }
  };

  // /addword 命令 - 添加违禁词
  const handleAddWord = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (args.length < 1) {
      await messageService.sendText(chatId, '❌ 请提供违禁词！\n使用方法：/addword <词> [类型]\n类型：local(本群) 或 global(全局)', {}, msg);
      return;
    }

    const word = args[0];
    const wordType = args[1] === 'global' ? 'global' : 'local';

    try {
      const conn = await pool.getConnection();
      try {
        const now = new Date();
        await conn.execute(
          `INSERT INTO fabubot_group_forbidden_words 
           (group_id, word, word_type, created_by, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [wordType === 'global' ? 0 : chatId, word, wordType, fromId, now]
        );

        await logGroupAction(chatId, 'forbidden_word_add', null, fromId, { word, word_type: wordType }, msg.message_id);
        await messageService.sendText(chatId, `✅ 违禁词已添加！\n词: ${word}\n类型: ${wordType === 'global' ? '全局' : '本群'}`, {}, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 添加违禁词失败:', error);
      await messageService.sendText(chatId, '❌ 添加违禁词失败！', {}, msg);
    }
  };

  // /delword 命令 - 删除违禁词
  const handleDelWord = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (args.length < 1) {
      await messageService.sendText(chatId, '❌ 请提供违禁词！\n使用方法：/delword <词>', {}, msg);
      return;
    }

    const word = args[0];

    try {
      const conn = await pool.getConnection();
      try {
        const [result] = await conn.execute(
          'DELETE FROM fabubot_group_forbidden_words WHERE (group_id = ? OR group_id = 0) AND word = ?',
          [chatId, word]
        );

        if (result.affectedRows === 0) {
          await messageService.sendText(chatId, '❌ 未找到该违禁词！', {}, msg);
          return;
        }

        await logGroupAction(chatId, 'forbidden_word_remove', null, fromId, { word }, msg.message_id);
        await messageService.sendText(chatId, `✅ 违禁词已删除！\n词: ${word}`, {}, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 删除违禁词失败:', error);
      await messageService.sendText(chatId, '❌ 删除违禁词失败！', {}, msg);
    }
  };

  // /wordlist 命令 - 查看违禁词列表
  const handleWordList = async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    try {
      const conn = await pool.getConnection();
      try {
        const [words] = await conn.execute(
          'SELECT * FROM fabubot_group_forbidden_words WHERE group_id = ? OR group_id = 0 ORDER BY group_id ASC, created_at DESC',
          [chatId]
        );

        if (words.length === 0) {
          await messageService.sendText(chatId, '📋 当前没有违禁词', {}, msg);
          return;
        }

        const localWords = words.filter(w => w.group_id !== 0);
        const globalWords = words.filter(w => w.group_id === 0);

        let response = `📋 **违禁词列表** 📋\n\n`;

        if (globalWords.length > 0) {
          response += `🌐 **全局违禁词 (${globalWords.length}个):**\n`;
          globalWords.forEach(w => response += `  • ${w.word}\n`);
          response += '\n';
        }

        if (localWords.length > 0) {
          response += `🏠 **本群违禁词 (${localWords.length}个):**\n`;
          localWords.forEach(w => response += `  • ${w.word}\n`);
        }

        await messageService.sendText(chatId, response, { parse_mode: 'Markdown' }, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 查看违禁词列表失败:', error);
      await messageService.sendText(chatId, '❌ 查看违禁词列表失败！', {}, msg);
    }
  };

  // /delete 命令 - 删除回复的消息
  const handleDelete = async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    if (!msg.reply_to_message) {
      await messageService.sendText(chatId, '❌ 请回复要删除的消息！', {}, msg);
      return;
    }

    try {
      await bot.deleteMessage(chatId, msg.reply_to_message.message_id);
      await bot.deleteMessage(chatId, msg.message_id);
      
      await logGroupAction(chatId, 'message_delete', msg.reply_to_message.from?.id || null, fromId, { 
        deleted_message_id: msg.reply_to_message.message_id,
        deleted_from_user_id: msg.reply_to_message.from?.id || null,
        deleted_from_username: msg.reply_to_message.from?.username || null
      }, msg.message_id);
    } catch (err) {
      error('[faBuBot] 删除消息失败:', error);
      await messageService.sendText(chatId, '❌ 删除消息失败！请确保我有足够的权限。', {}, msg);
    }
  };

  // /pin 命令 - 置顶消息
  const handlePin = async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    if (!msg.reply_to_message) {
      await messageService.sendText(chatId, '❌ 请回复要置顶的消息！', {}, msg);
      return;
    }

    try {
      await bot.pinChatMessage(chatId, msg.reply_to_message.message_id, { disable_notification: false });
      await logGroupAction(chatId, 'message_pin', msg.reply_to_message.from?.id || null, fromId, { 
        pinned_message_id: msg.reply_to_message.message_id,
        pinned_from_user_id: msg.reply_to_message.from?.id || null,
        pinned_from_username: msg.reply_to_message.from?.username || null
      }, msg.message_id);
      await messageService.sendText(chatId, '✅ 消息已置顶！', {}, msg);
    } catch (err) {
      error('[faBuBot] 置顶消息失败:', error);
      await messageService.sendText(chatId, '❌ 置顶消息失败！请确保我有足够的权限。', {}, msg);
    }
  };

  // /unpin 命令 - 取消置顶
  const handleUnpin = async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    // 检查是否有回复的消息
    if (!msg.reply_to_message) {
      await messageService.sendText(chatId, '❌ 请回复要取消置顶的消息！', {}, msg);
      return;
    }

    try {
      // 只取消回复的那条消息的置顶
      await bot.unpinChatMessage(chatId, msg.reply_to_message.message_id);
      await logGroupAction(chatId, 'message_unpin', msg.reply_to_message.from?.id || null, fromId, { 
        unpinned_message_id: msg.reply_to_message.message_id,
        unpinned_from_user_id: msg.reply_to_message.from?.id || null,
        unpinned_from_username: msg.reply_to_message.from?.username || null
      }, msg.message_id);
      await messageService.sendText(chatId, '✅ 已取消该消息的置顶！', {}, msg);
    } catch (err) {
      error('[faBuBot] 取消置顶失败:', error);
      // 检查是否是因为没有置顶消息的错误
      if (error.response && error.response.body && error.response.body.description && error.response.body.description.includes('message to unpin not found')) {
        await messageService.sendText(chatId, '❌ 该消息不是置顶消息！', {}, msg);
      } else {
        await messageService.sendText(chatId, '❌ 取消置顶失败！请确保我有足够的权限。', {}, msg);
      }
    }
  };

  // /help 命令 - 显示帮助
  const handleHelp = async (msg) => {
    const chatId = msg.chat.id;
    
    let helpText = `📋 **faBuBot 帮助** 📋\n\n`;
    
    if (msg.chat.type !== 'private') {
      helpText += `👥 **普通用户命令:**\n`;
      helpText += `  /rules - 查看群规则\n`;
      helpText += `  /mywarns - 查看自己的警告记录\n`;
      helpText += `  /report - 举报消息（回复消息使用）\n\n`;
      
      const isAdmin = await checkGroupAdmin(chatId, msg.from.id);
      if (isAdmin) {
        helpText += `🔧 **管理员命令:**\n`;
        helpText += `  /warn <用户> <原因> - 警告用户\n`;
        helpText += `  /unwarn <用户> - 取消警告\n`;
        helpText += `  /warnings <用户> - 查看警告记录\n`;
        helpText += `  /ban <用户> <原因> - 永久封禁\n`;
        helpText += `  /tban <用户> <时间> <原因> - 临时封禁 (1d, 2h, 30m)\n`;
        helpText += `  /unban <用户> - 解封用户\n`;
        helpText += `  /banlist - 查看封禁列表\n`;
        helpText += `  /kick <用户> <原因> - 踢出用户\n`;
        helpText += `  /setrules <规则> - 设置群规则\n`;
        helpText += `  /rules - 显示群规则\n`;
        helpText += `  /addword <词> [类型] - 添加违禁词 (local/global)\n`;
        helpText += `  /delword <词> - 删除违禁词\n`;
        helpText += `  /wordlist - 查看违禁词列表\n`;
        helpText += `  /delete - 删除回复的消息\n`;
        helpText += `  /pin - 置顶消息\n`;
        helpText += `  /unpin - 取消置顶\n`;
        helpText += `  /settings - 查看/修改群组设置\n`;
      }
    } else {
      helpText += `🤖 **私聊命令:**\n`;
      helpText += `  /start - 开始使用\n`;
      helpText += `  /help - 显示帮助\n\n`;
      helpText += `💡 提示：将我添加到群组中可以使用群组管理功能！`;
    }

    await messageService.sendText(chatId, helpText, { parse_mode: 'Markdown' }, msg);
  };

  // /mute 命令 - 禁言用户
  const handleMute = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/mute <用户> <时间>\n时间格式：1d(天), 2h(小时), 30m(分钟)', {}, msg);
      return;
    }

    let untilDate;
    // 如果有回复消息
    if (msg.reply_to_message) {
      // 有回复消息，检查是否有指定时间
      if (args.length === 0) {
        // 没有指定时间，默认禁言15分钟
        untilDate = new Date(Date.now() + 15 * 60 * 1000); // 15分钟
      } else {
        // 有指定时间，使用 args[0]
        const timeStr = args[0];
        untilDate = parseTime(timeStr);
        if (!untilDate) {
          await messageService.sendText(chatId, '❌ 时间格式错误！请使用：1d(天), 2h(小时), 30m(分钟)', {}, msg);
          return;
        }
      }
    } else {
      // 没有回复消息，需要用户ID/用户名 + 时间
      if (args.length < 2) {
        await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/mute <用户> <时间>\n时间格式：1d(天), 2h(小时), 30m(分钟)', {}, msg);
        return;
      }
      const timeStr = args[1];
      untilDate = parseTime(timeStr);
      if (!untilDate) {
        await messageService.sendText(chatId, '❌ 时间格式错误！请使用：1d(天), 2h(小时), 30m(分钟)', {}, msg);
        return;
      }
    }

    try {
      await bot.restrictChatMember(chatId, targetUser.id, {
        until_date: Math.floor(untilDate / 1000),
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false
      });

      await logGroupAction(chatId, 'user_mute', targetUser.id, fromId, {
        until: new Date(untilDate).toLocaleString()
      }, msg.message_id);

      const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
      await messageService.sendText(chatId, `🔇 **用户已禁言** 🔇\n\n👤 用户: ${userMention}\n⏰ 解禁时间: ${new Date(untilDate).toLocaleString()}`, { parse_mode: 'Markdown' }, msg);
    } catch (err) {
      error('[faBuBot] 禁言用户失败:', error);
      await messageService.sendText(chatId, '❌ 禁言用户失败！请确保我有足够的权限。', {}, msg);
    }
  };

  // /unmute 命令 - 解除禁言
  const handleUnmute = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/unmute <用户>', {}, msg);
      return;
    }

    try {
      await bot.restrictChatMember(chatId, targetUser.id, {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
        can_change_info: false,
        can_invite_users: true,
        can_pin_messages: false
      });

      await logGroupAction(chatId, 'user_unmute', targetUser.id, fromId, { 
        target_username: targetUser.username,
        target_first_name: targetUser.first_name
      }, msg.message_id);

      const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
      await messageService.sendText(chatId, `🔊 ${userMention} 已成功解除禁言！`, {}, msg);
    } catch (err) {
      error('[faBuBot] 解除禁言失败:', error);
      await messageService.sendText(chatId, '❌ 解除禁言失败！', {}, msg);
    }
  };

  // /promote 命令 - 提升为管理员
  const handlePromote = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/promote <用户>', {}, msg);
      return;
    }

    try {
      await bot.promoteChatMember(chatId, targetUser.id, {
        can_change_info: true,
        can_delete_messages: true,
        can_invite_users: true,
        can_restrict_members: true,
        can_pin_messages: true,
        can_promote_members: false
      });

      const conn = await pool.getConnection();
      try {
        const now = new Date();
        await conn.execute(
          `INSERT INTO fabubot_group_admin_permissions 
           (group_id, user_id, can_change_info, can_delete_messages, can_invite_users, 
            can_restrict_members, can_pin_messages, can_promote_members, created_at)
           VALUES (?, ?, 1, 1, 1, 1, 1, 0, ?)
           ON DUPLICATE KEY UPDATE
             can_change_info = 1,
             can_delete_messages = 1,
             can_invite_users = 1,
             can_restrict_members = 1,
             can_pin_messages = 1,
             updated_at = VALUES(created_at)`,
          [chatId, targetUser.id, now]
        );
      } finally {
        conn.release();
      }

      await logGroupAction(chatId, 'admin_promote', targetUser.id, fromId, { 
        target_username: targetUser.username,
        target_first_name: targetUser.first_name,
        permissions: {
          can_change_info: true,
          can_delete_messages: true,
          can_invite_users: true,
          can_restrict_members: true,
          can_pin_messages: true,
          can_promote_members: false
        }
      }, msg.message_id);

      const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
      await messageService.sendText(chatId, `🎖️ ${userMention} 已提升为管理员！`, {}, msg);
    } catch (err) {
      error('[faBuBot] 提升管理员失败:', error);
      await messageService.sendText(chatId, '❌ 提升管理员失败！请确保我有足够的权限。', {}, msg);
    }
  };

  // /demote 命令 - 降级管理员
  const handleDemote = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/demote <用户>', {}, msg);
      return;
    }

    try {
      await bot.promoteChatMember(chatId, targetUser.id, {
        can_change_info: false,
        can_delete_messages: false,
        can_invite_users: false,
        can_restrict_members: false,
        can_pin_messages: false,
        can_promote_members: false
      });

      const conn = await pool.getConnection();
      try {
        await conn.execute(
          'DELETE FROM fabubot_group_admin_permissions WHERE group_id = ? AND user_id = ?',
          [chatId, targetUser.id]
        );
      } finally {
        conn.release();
      }

      await logGroupAction(chatId, 'admin_demote', targetUser.id, fromId, { 
        target_username: targetUser.username,
        target_first_name: targetUser.first_name
      }, msg.message_id);

      const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
      await messageService.sendText(chatId, `📉 ${userMention} 已从管理员降级！`, {}, msg);
    } catch (err) {
      error('[faBuBot] 降级管理员失败:', error);
      await messageService.sendText(chatId, '❌ 降级管理员失败！', {}, msg);
    }
  };

  // /adminlist 命令 - 查看管理员列表
  const handleAdminList = async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    try {
      const administrators = await bot.getChatAdministrators(chatId);

      if (administrators.length === 0) {
        await messageService.sendText(chatId, '📋 当前没有管理员', {}, msg);
        return;
      }

      let response = `📋 **管理员列表** 📋\n\n`;
      
      const creator = administrators.find(a => a.status === 'creator');
      const admins = administrators.filter(a => a.status === 'administrator');

      if (creator) {
        const creatorName = creator.user.username ? `@${creator.user.username}` : creator.user.first_name;
        response += `👑 **创建者:** ${creatorName}\n\n`;
      }

      if (admins.length > 0) {
        response += `🎖️ **管理员 (${admins.length}位):**\n`;
        admins.forEach((admin, index) => {
          const adminName = admin.user.username ? `@${admin.user.username}` : admin.user.first_name;
          response += `${index + 1}. ${adminName}\n`;
        });
      }

      await messageService.sendText(chatId, response, { parse_mode: 'Markdown' }, msg);
    } catch (err) {
      error('[faBuBot] 查看管理员列表失败:', error);
      await messageService.sendText(chatId, '❌ 查看管理员列表失败！', {}, msg);
    }
  };

  // /purge 命令 - 批量删除消息
  const handlePurge = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    if (!await checkBotAdmin(chatId)) {
      await messageService.sendText(chatId, '❌ 我需要先成为管理员才能执行此操作！', {}, msg);
      return;
    }

    const count = parseInt(args[0]);
    if (!count || count < 1 || count > 100) {
      await messageService.sendText(chatId, '❌ 请提供要删除的消息数量（1-100）！\n使用方法：/purge <数量>', {}, msg);
      return;
    }

    try {
      const messageIds = [];
      for (let i = 0; i < count; i++) {
        if (msg.message_id - i > 0) {
          messageIds.push(msg.message_id - i);
        }
      }

      // 注意：Telegram API 对批量删除有限制，这里逐个删除
      let deletedCount = 0;
      for (const messageId of messageIds) {
        try {
          await bot.deleteMessage(chatId, messageId);
          deletedCount++;
        } catch (e) {
          // 跳过无法删除的消息
        }
      }

      await logGroupAction(chatId, 'other', null, fromId, { count: deletedCount }, msg.message_id);
      
      const confirmMsg = await messageService.sendText(chatId, `🗑️ 已删除 ${deletedCount} 条消息！`, {}, msg);
      
      // 2秒后删除确认消息
      setTimeout(async () => {
        try {
          await bot.deleteMessage(chatId, confirmMsg.message_id);
        } catch (e) {}
      }, 2000);
    } catch (err) {
      error('[faBuBot] 批量删除消息失败:', error);
      await messageService.sendText(chatId, '❌ 批量删除消息失败！', {}, msg);
    }
  };

  // /settings 命令 - 查看/修改群组设置
  const handleSettings = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    try {
      const conn = await pool.getConnection();
      try {
        let [settings] = await conn.execute(
          'SELECT * FROM fabubot_group_settings WHERE group_id = ?',
          [chatId]
        );

        if (settings.length === 0) {
          // 创建默认设置
          const now = new Date();
          await conn.execute(
            `INSERT INTO fabubot_group_settings 
             (group_id, welcome_enabled, anti_spam_enabled, anti_link_enabled, 
              auto_delete_welcome, created_at)
             VALUES (?, 0, 0, 0, 0, ?)`,
            [chatId, now]
          );
          [settings] = await conn.execute(
            'SELECT * FROM fabubot_group_settings WHERE group_id = ?',
            [chatId]
          );
        }

        const setting = settings[0];
        let response = `⚙️ **群组设置** ⚙️\n\n`;
        response += `欢迎消息: ${setting.welcome_enabled ? '✅ 开启' : '❌ 关闭'}\n`;
        response += `反垃圾消息: ${setting.anti_spam_enabled ? '✅ 开启' : '❌ 关闭'}\n`;
        response += `反链接: ${setting.anti_link_enabled ? '✅ 开启' : '❌ 关闭'}\n`;
        response += `自动删除欢迎消息: ${setting.auto_delete_welcome ? '✅ 开启' : '❌ 关闭'}\n\n`;
        response += `使用方法：/settings <设置项> <on/off>\n`;
        response += `设置项: welcome, antispam, antilink, autodelwelcome`;

        // 如果有参数，修改设置
        if (args.length >= 2) {
          const settingKey = args[0].toLowerCase();
          const value = args[1].toLowerCase() === 'on' ? 1 : 0;
          
          let updateField = null;
          switch (settingKey) {
            case 'welcome': updateField = 'welcome_enabled'; break;
            case 'antispam': updateField = 'anti_spam_enabled'; break;
            case 'antilink': updateField = 'anti_link_enabled'; break;
            case 'autodelwelcome': updateField = 'auto_delete_welcome'; break;
          }

          if (updateField) {
            await conn.execute(
              `UPDATE fabubot_group_settings SET ${updateField} = ?, updated_at = NOW() WHERE group_id = ?`,
              [value, chatId]
            );
            response = `✅ 设置已更新！\n\n${settingKey} 已${value ? '开启' : '关闭'}`;
          }
        }

        await messageService.sendText(chatId, response, { parse_mode: 'Markdown' }, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 查看/修改群组设置失败:', error);
      await messageService.sendText(chatId, '❌ 查看/修改群组设置失败！', {}, msg);
    }
  };

  // /gban 命令 - 全局封禁
  const handleGBan = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/gban <用户> <原因>', {}, msg);
      return;
    }

    const reason = args.slice(1).join(' ') || '未提供原因';

    try {
      const conn = await pool.getConnection();
      try {
        const now = new Date();
        await conn.execute(
          `INSERT INTO fabubot_global_bans 
           (user_id, admin_id, reason, created_at)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             reason = VALUES(reason),
             admin_id = VALUES(admin_id),
             updated_at = VALUES(created_at)`,
          [targetUser.id, fromId, reason, now]
        );

        await logGroupAction(chatId, 'other', targetUser.id, fromId, { reason }, msg.message_id);

        const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
        await messageService.sendText(chatId, `🌍 **全局封禁** 🌍\n\n👤 用户: ${userMention}\n📋 原因: ${reason}\n\n该用户已被全局封禁，将无法加入所有群组！`, { parse_mode: 'Markdown' }, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 全局封禁失败:', error);
      await messageService.sendText(chatId, '❌ 全局封禁失败！', {}, msg);
    }
  };

  // /gunban 命令 - 解除全局封禁
  const handleGUnban = async (msg, args) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!await checkGroupAdmin(chatId, fromId)) {
      await messageService.sendText(chatId, '❌ 此命令仅限管理员使用！', {}, msg);
      return;
    }

    const targetUser = await parseUserId(msg, args);
    if (!targetUser) {
      await messageService.sendText(chatId, '❌ 请回复用户消息或提供用户ID/用户名！\n使用方法：/gunban <用户>', {}, msg);
      return;
    }

    try {
      const conn = await pool.getConnection();
      try {
        const [result] = await conn.execute(
          'DELETE FROM fabubot_global_bans WHERE user_id = ?',
          [targetUser.id]
        );

        if (result.affectedRows === 0) {
          await messageService.sendText(chatId, '❌ 该用户未被全局封禁！', {}, msg);
          return;
        }

        await logGroupAction(chatId, 'other', targetUser.id, fromId, { 
          target_username: targetUser.username,
          target_first_name: targetUser.first_name
        }, msg.message_id);

        const userMention = targetUser.username ? `@${targetUser.username}` : targetUser.first_name;
        await messageService.sendText(chatId, `✅ ${userMention} 已解除全局封禁！`, {}, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 解除全局封禁失败:', error);
      await messageService.sendText(chatId, '❌ 解除全局封禁失败！', {}, msg);
    }
  };

  // /report 命令 - 举报消息
  const handleReport = async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    if (!msg.reply_to_message) {
      await messageService.sendText(chatId, '❌ 请回复要举报的消息！', {}, msg);
      return;
    }

    try {
      const conn = await pool.getConnection();
      try {
        // 尝试创建举报表（如果不存在）
        try {
          await conn.execute(`
            CREATE TABLE IF NOT EXISTS fabubot_group_reports (
              id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
              group_id BIGINT NOT NULL COMMENT '群组ID',
              reported_user_id BIGINT NOT NULL COMMENT '被举报用户ID',
              reported_by BIGINT NOT NULL COMMENT '举报者ID',
              message_id BIGINT NULL COMMENT '被举报的消息ID',
              reason VARCHAR(500) NULL COMMENT '举报原因',
              message_text TEXT NULL COMMENT '被举报消息内容',
              status ENUM('pending', 'resolved', 'dismissed') DEFAULT 'pending' COMMENT '举报状态',
              resolved_by BIGINT NULL COMMENT '处理者ID',
              resolved_at DATETIME NULL COMMENT '处理时间',
              resolution_note VARCHAR(500) NULL COMMENT '处理备注',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
              INDEX idx_group_id (group_id),
              INDEX idx_reported_user_id (reported_user_id),
              INDEX idx_reported_by (reported_by),
              INDEX idx_status (status),
              INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='群组举报记录表'
          `);
        } catch (tableError) {
          // 表已存在，忽略错误
        }

        // 通知所有管理员
        const administrators = await bot.getChatAdministrators(chatId);
        const reporterName = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
        const reportedUser = msg.reply_to_message.from;
        const reportedUserName = reportedUser.username ? `@${reportedUser.username}` : reportedUser.first_name;

        let reportMessage = `🚨 **举报通知** 🚨\n\n`;
        reportMessage += `👤 举报者: ${reporterName}\n`;
        reportMessage += `🎯 被举报者: ${reportedUserName}\n`;
        reportMessage += `📋 消息链接: https://t.me/c/${chatId.toString().replace('-100', '')}/${msg.reply_to_message.message_id}`;

        for (const admin of administrators) {
          if (admin.user.id !== bot.id && admin.user.id !== fromId) {
            try {
              try {
                await bot.sendMessage(admin.user.id, reportMessage, { parse_mode: 'Markdown' });
              } catch (formatErr) {
                // 如果格式化失败，尝试纯文本
                await bot.sendMessage(admin.user.id, reportMessage);
              }
            } catch (e) {
              // 跳过无法发送的管理员
            }
          }
        }

        // 提取举报原因（从命令参数中获取）
        let reason = null;
        if (msg.text) {
          const parts = msg.text.split(' ');
          if (parts.length > 1) {
            reason = parts.slice(1).join(' ');
          }
        }

        // 提取被举报消息内容
        let messageText = null;
        if (msg.reply_to_message.text) {
          messageText = msg.reply_to_message.text;
        } else if (msg.reply_to_message.caption) {
          messageText = msg.reply_to_message.caption;
        }

        // 保存到举报表
        await conn.execute(
          `INSERT INTO fabubot_group_reports 
           (group_id, reported_user_id, reported_by, message_id, reason, message_text, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
          [
            chatId,
            reportedUser.id,
            fromId,
            msg.reply_to_message.message_id,
            reason,
            messageText
          ]
        );

        await logGroupAction(chatId, 'other', reportedUser.id, fromId, {
          reported_message_id: msg.reply_to_message.message_id
        }, msg.message_id);

        await messageService.sendText(chatId, '✅ 举报已提交，管理员将会查看！', {}, msg);
      } finally {
        conn.release();
      }
    } catch (err) {
      error('[faBuBot] 举报失败:', error);
      await messageService.sendText(chatId, '❌ 举报失败！', {}, msg);
    }
  };

  // /mywarns 命令 - 查看自己的警告记录
  const handleMyWarns = async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (msg.chat.type === 'private') {
      await messageService.sendText(chatId, '❌ 此命令只能在群组中使用！', {}, msg);
      return;
    }

    await handleWarnings(msg, []);
  };

  return {
    handleWarn,
    handleUnwarn,
    handleWarnings,
    handleBan,
    handleTBan,
    handleUnban,
    handleBanList,
    handleKick,
    handleMute,
    handleUnmute,
    handlePromote,
    handleDemote,
    handleAdminList,
    handleSetRules,
    handleRules,
    handleAddWord,
    handleDelWord,
    handleWordList,
    handlePurge,
    handleDelete,
    handlePin,
    handleUnpin,
    handleSettings,
    handleGBan,
    handleGUnban,
    handleHelp,
    handleMyWarns,
    handleReport,
    parseUserId,
    checkGroupAdmin,
    checkBotAdmin
  };
};
