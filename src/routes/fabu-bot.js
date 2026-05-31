const express = require('express');
const router = express.Router();
const multer = require('multer');
const { pool } = require('../../bots/fabuBot/config/database');
const { getFaBuBotConfig, updateFaBuBotConfigs } = require('../../bots/fabuBot/config');
const { getVodSourceAggregator } = require('../services/vod-source-aggregator');
const { logOperation } = require('./operation-logs');

// 配置multer用于内存存储（不保存到磁盘）
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 中间件：验证JWT令牌
const authenticateToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: '无效的认证令牌' });
  }
};

// 中间件：验证管理员权限
const verifyAdmin = async (req, res, next) => {
  if (req.user.permissionLevel !== 2 && req.user.permissionLevel !== 3) {
    return res.status(403).json({ message: '权限不足' });
  }
  next();
};

// 获取 faBuBot 状态
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const { getFabuBotStatus } = require('../../bots/fabuBot/bot');
    const status = getFabuBotStatus();
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ message: '获取 faBuBot 状态失败', error: error.message });
  }
});

// 启动 faBuBot
router.post('/start', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { startFabuBot } = require('../../bots/fabuBot/bot');
    const result = await startFabuBot();
    
    // 保存启动记录
    const db = require('../config/db');
    const config = await getFaBuBotConfig();
    const proxy = config.PROXY_HOST && config.PROXY_PORT ? `http://${config.PROXY_HOST.replace(/^https?:\/\//, '')}:${config.PROXY_PORT}` : null;
    await db.execute(
      'INSERT INTO fabubot_startup_records (success, error, createdBy, environment, appName, proxy) VALUES (?, ?, ?, ?, ?, ?)',
      [result, result ? null : '启动失败', req.user.username, config.environment || 'production', 'faBuBot', proxy]
    );
    
    if (result) {
      res.status(200).json({ success: true, message: 'faBuBot 启动成功' });
    } else {
      res.status(400).json({ success: false, message: 'faBuBot 启动失败，请检查 FABU_TELEGRAM_TOKEN 配置' });
    }
  } catch (error) {
    // 保存失败记录
    const db = require('../config/db');
    const config = await getFaBuBotConfig();
    const proxy = config.PROXY_HOST && config.PROXY_PORT ? `http://${config.PROXY_HOST.replace(/^https?:\/\//, '')}:${config.PROXY_PORT}` : null;
    await db.execute(
      'INSERT INTO fabubot_startup_records (success, error, createdBy, environment, appName, proxy) VALUES (?, ?, ?, ?, ?, ?)',
      [false, error.message, req.user.username, config.environment || 'production', 'faBuBot', proxy]
    );
    res.status(500).json({ message: '启动 faBuBot 失败', error: error.message });
  }
});

// 停止 faBuBot
router.post('/stop', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { stopFabuBot } = require('../../bots/fabuBot/bot');
    const result = await stopFabuBot();
    if (result) {
      res.status(200).json({ success: true, message: 'faBuBot 停止成功' });
    } else {
      res.status(400).json({ success: false, message: 'faBuBot 停止失败' });
    }
  } catch (error) {
    res.status(500).json({ message: '停止 faBuBot 失败', error: error.message });
  }
});

// 获取媒体组列表
router.get('/media-groups', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [groups] = await conn.execute('SELECT * FROM fabubot_media_groups ORDER BY created_at DESC LIMIT 50');
      res.status(200).json({ mediaGroups: groups });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取媒体组列表失败', error: error.message });
  }
});

// 获取单个媒体组的所有媒体项
router.get('/media-groups/:mediaGroupId', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { mediaGroupId } = req.params;
      const [items] = await conn.execute('SELECT * FROM fabubot_media_items WHERE media_group_id = ? ORDER BY id', [mediaGroupId]);
      res.status(200).json({ mediaItems: items });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取媒体组失败', error: error.message });
  }
});

// 获取单个视频列表
router.get('/single-videos', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [videos] = await conn.execute('SELECT * FROM fabubot_single_videos ORDER BY timestamp DESC LIMIT 50');
      res.status(200).json({ singleVideos: videos });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取单个视频列表失败', error: error.message });
  }
});

// 更新单个视频的描述
router.put('/single-videos/:id/caption', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { id } = req.params;
      const { caption } = req.body;
      
      const [result] = await conn.execute('UPDATE fabubot_single_videos SET caption = ? WHERE id = ?', [caption, id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '视频不存在' });
      }
      
      res.status(200).json({ success: true, message: '描述更新成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '更新描述失败', error: error.message });
  }
});

// 更新媒体项的描述
router.put('/media-items/:id/caption', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { id } = req.params;
      const { caption } = req.body;
      
      const [result] = await conn.execute('UPDATE fabubot_media_items SET caption = ? WHERE id = ?', [caption, id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '媒体项不存在' });
      }
      
      res.status(200).json({ success: true, message: '描述更新成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '更新描述失败', error: error.message });
  }
});

// 获取 faBuBot 配置
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const config = await getFaBuBotConfig();
    res.status(200).json({ config });
  } catch (error) {
    res.status(500).json({ message: '获取 faBuBot 配置失败', error: error.message });
  }
});

// 更新 faBuBot 配置
router.put('/config', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { config } = req.body;
    // 过滤掉 MySQL 配置，不更新数据库
    const filteredConfig = {};
    Object.keys(config).forEach(key => {
      if (!['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'].includes(key)) {
        filteredConfig[key] = config[key];
      }
    });
    await updateFaBuBotConfigs(filteredConfig);
    await logOperation(req, 'update', '机器人', 0, 'faBuBot配置', `更新faBuBot配置`);
    res.status(200).json({ success: true, message: 'faBuBot 配置更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新 faBuBot 配置失败', error: error.message });
  }
});

// 命令管理相关路由

// 获取命令列表
router.get('/commands', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [commands] = await conn.execute('SELECT * FROM fabubot_commands ORDER BY `order` ASC');
      res.status(200).json({ commands });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取命令列表失败', error: error.message });
  }
});

// 添加命令
router.post('/commands', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { command, description, isEnabled = true, isAdmin = false, commandType = 'bot' } = req.body;
      
      if (!command || !description) {
        return res.status(400).json({ message: '命令和描述不能为空' });
      }
      
      // 检查命令是否已存在
      const [existingCommands] = await conn.execute('SELECT * FROM fabubot_commands WHERE command = ?', [command]);
      if (existingCommands.length > 0) {
        return res.status(400).json({ message: '命令已存在' });
      }
      
      await conn.execute('INSERT INTO fabubot_commands (command, description, isEnabled, isAdmin, command_type) VALUES (?, ?, ?, ?, ?)', [command, description, isEnabled, isAdmin, commandType]);
      
      // 重新加载命令列表
      const { updateFaBuBotCommands } = require('../../bots/fabuBot/bot');
      await updateFaBuBotCommands();
      
      await logOperation(req, 'add', '机器人', 0, command, `添加命令: ${command}`);
      
      res.status(200).json({ success: true, message: '命令添加成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '添加命令失败', error: error.message });
  }
});

// 更新命令顺序
router.put('/commands/order', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      let { command, newOrder } = req.body;
      
      if (!command || newOrder === undefined) {
        return res.status(400).json({ message: '命令和新顺序不能为空' });
      }
      
      // 如果命令以 / 开头，去掉斜杠
      let searchCommand = command;
      if (command.startsWith('/')) {
        searchCommand = command.substring(1);
      }
      
      let [result] = await conn.execute('UPDATE fabubot_commands SET `order` = ? WHERE command = ?', [newOrder, searchCommand]);
      
      if (result.affectedRows === 0) {
        const commandWithSlash = '/' + searchCommand;
        [result] = await conn.execute('UPDATE fabubot_commands SET `order` = ? WHERE command = ?', [newOrder, commandWithSlash]);
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '命令不存在' });
      }
      
      // 重新加载命令列表
      const { updateFaBuBotCommands } = require('../../bots/fabuBot/bot');
      await updateFaBuBotCommands();
      
      res.status(200).json({ success: true, message: '命令顺序更新成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '更新命令顺序失败', error: error.message });
  }
});

// 删除命令
router.delete('/commands/:command', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { command } = req.params;
      
      let [result] = await conn.execute('DELETE FROM fabubot_commands WHERE command = ?', [command]);
      
      if (result.affectedRows === 0) {
        const commandWithSlash = '/' + command;
        [result] = await conn.execute('DELETE FROM fabubot_commands WHERE command = ?', [commandWithSlash]);
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '命令不存在' });
      }
      
      const { updateFaBuBotCommands } = require('../../bots/fabuBot/bot');
      await updateFaBuBotCommands();
      
      await logOperation(req, 'delete', '机器人', 0, command, `删除命令: ${command}`);
      
      res.status(200).json({ success: true, message: '命令删除成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '删除命令失败', error: error.message });
  }
});

// 更新命令
router.put('/commands/:command', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      let { command } = req.params;
      const { description, isEnabled, isAdmin, order, commandType } = req.body;
      
      // 如果命令以 / 开头，去掉斜杠
      let searchCommand = command;
      if (command.startsWith('/')) {
        searchCommand = command.substring(1);
      }
      
      // 首先获取命令的当前值
      let [commands] = await conn.execute('SELECT description, isEnabled, isAdmin, `order`, command_type FROM fabubot_commands WHERE command = ?', [searchCommand]);
      
      // 如果没有找到，尝试带斜杠的版本
      if (commands.length === 0) {
        const commandWithSlash = '/' + searchCommand;
        [commands] = await conn.execute('SELECT description, isEnabled, isAdmin, `order`, command_type FROM fabubot_commands WHERE command = ?', [commandWithSlash]);
        
        if (commands.length > 0) {
          searchCommand = commandWithSlash;
        }
      }
      
      if (commands.length === 0) {
        return res.status(404).json({ message: '命令不存在' });
      }
      
      // 使用现有值或新值
      const currentCommand = commands[0];
      const newDescription = description || currentCommand.description;
      const newIsEnabled = isEnabled !== undefined ? isEnabled : currentCommand.isEnabled;
      const newIsAdmin = isAdmin !== undefined ? isAdmin : currentCommand.isAdmin;
      const newOrder = order !== undefined ? order : currentCommand.order;
      const newCommandType = commandType || currentCommand.command_type;
      
      const [result] = await conn.execute('UPDATE fabubot_commands SET description = ?, isEnabled = ?, isAdmin = ?, `order` = ?, command_type = ? WHERE command = ?', [newDescription, newIsEnabled, newIsAdmin, newOrder, newCommandType, searchCommand]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '命令不存在' });
      }
      
      // 重新加载命令列表
      const { updateFaBuBotCommands } = require('../../bots/fabuBot/bot');
      await updateFaBuBotCommands();
      
      await logOperation(req, 'update', '机器人', 0, searchCommand, `更新命令: ${searchCommand}`);
      
      res.status(200).json({ success: true, message: '命令更新成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '更新命令失败', error: error.message });
  }
});

// 用户管理相关路由

// 获取用户列表
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { page = 1, pageSize = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);
      
      const [users] = await conn.execute(
        'SELECT * FROM fabubot_users ORDER BY last_active_at DESC, created_at DESC LIMIT ? OFFSET ?',
        [parseInt(pageSize), offset]
      );
      
      const [countResult] = await conn.execute('SELECT COUNT(*) as total FROM fabubot_users');
      const total = countResult[0].total;
      
      res.status(200).json({ users, total, page: parseInt(page), pageSize: parseInt(pageSize) });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取用户列表失败', error: error.message });
  }
});

// 获取单个用户详情
router.get('/users/:userId', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { userId } = req.params;
      const [users] = await conn.execute('SELECT * FROM fabubot_users WHERE user_id = ?', [userId]);
      
      if (users.length === 0) {
        return res.status(404).json({ message: '用户不存在' });
      }
      
      res.status(200).json({ user: users[0] });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取用户详情失败', error: error.message });
  }
});

// 更新用户状态（屏蔽/取消屏蔽）
router.put('/users/:userId/block', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { userId } = req.params;
      const { isBlocked } = req.body;
      
      const [result] = await conn.execute(
        'UPDATE fabubot_users SET is_blocked = ? WHERE user_id = ?',
        [isBlocked ? 1 : 0, userId]
      );
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '用户不存在' });
      }
      
      res.status(200).json({ success: true, message: '用户状态更新成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '更新用户状态失败', error: error.message });
  }
});

// 删除用户
router.delete('/users/:userId', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { userId } = req.params;
      
      const [result] = await conn.execute('DELETE FROM fabubot_users WHERE user_id = ?', [userId]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '用户不存在' });
      }
      
      res.status(200).json({ success: true, message: '用户删除成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '删除用户失败', error: error.message });
  }
});

// 消息管理相关路由

// 获取用户的消息列表
router.get('/users/:userId/messages', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { userId } = req.params;
      const { page = 1, pageSize = 50 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);
      
      const [messages] = await conn.execute(
        'SELECT * FROM fabubot_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [userId, parseInt(pageSize), offset]
      );
      
      const [countResult] = await conn.execute(
        'SELECT COUNT(*) as total FROM fabubot_messages WHERE user_id = ?',
        [userId]
      );
      const total = countResult[0].total;
      
      // 更新未读消息为已读
      await conn.execute(
        'UPDATE fabubot_messages SET is_read = 1 WHERE user_id = ? AND direction = "incoming" AND is_read = 0',
        [userId]
      );
      
      res.status(200).json({ 
        messages: messages.reverse(), // 反转以实现时间正序
        total, 
        page: parseInt(page), 
        pageSize: parseInt(pageSize) 
      });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取消息列表失败', error: error.message });
  }
});

// 给用户发送消息
router.post('/users/:userId/send', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: '消息内容不能为空' });
    }
    
    // 获取用户的chat_id
    const conn = await pool.getConnection();
    try {
      const [users] = await conn.execute('SELECT chat_id FROM fabubot_users WHERE user_id = ?', [userId]);
      
      if (users.length === 0) {
        return res.status(404).json({ message: '用户不存在' });
      }
      
      const chatId = users[0].chat_id;
      
      // 获取机器人实例并发送消息
      const botModule = require('../../bots/fabuBot/bot');
      const bot = botModule.getBotInstance();
      
      if (!bot) {
        return res.status(400).json({ message: '机器人未启动' });
      }
      
      // 创建一个模拟的msg对象用于保存消息
      const mockMsg = {
        from: { id: parseInt(userId) },
        chat: { id: chatId },
        text: text
      };
      
      // 使用MessageService发送消息并保存
      const MessageService = require('../../bots/fabuBot/services/MessageService');
      const messageService = new MessageService(bot);
      
      await messageService.sendText(chatId, text, {}, mockMsg);
      
      res.status(200).json({ success: true, message: '消息发送成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('发送消息失败:', error);
    res.status(500).json({ message: '发送消息失败', error: error.message });
  }
});

// 给用户发送图片
router.post('/users/:userId/send-photo', authenticateToken, verifyAdmin, upload.single('photo'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ message: '请上传图片文件' });
    }
    
    // 获取用户的chat_id
    const conn = await pool.getConnection();
    try {
      const [users] = await conn.execute('SELECT chat_id FROM fabubot_users WHERE user_id = ?', [userId]);
      
      if (users.length === 0) {
        return res.status(404).json({ message: '用户不存在' });
      }
      
      const chatId = users[0].chat_id;
      
      // 获取机器人实例并发送图片
      const botModule = require('../../bots/fabuBot/bot');
      const bot = botModule.getBotInstance();
      
      if (!bot) {
        return res.status(400).json({ message: '机器人未启动' });
      }
      
      // 创建一个模拟的msg对象用于保存消息
      const mockMsg = {
        from: { id: parseInt(userId) },
        chat: { id: chatId },
        photo: [{ file_id: 'uploaded' }]
      };
      
      // 使用MessageService发送图片
      const MessageService = require('../../bots/fabuBot/services/MessageService');
      const messageService = new MessageService(bot);
      
      // 发送图片（使用buffer）
      await messageService.sendPhoto(chatId, req.file.buffer, {
        filename: req.file.originalname
      }, mockMsg);
      
      res.status(200).json({ success: true, message: '图片发送成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('发送图片失败:', error);
    res.status(500).json({ message: '发送图片失败', error: error.message });
  }
});

// 获取用户未读消息数
router.get('/users/:userId/unread-count', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { userId } = req.params;
      
      const [countResult] = await conn.execute(
        'SELECT COUNT(*) as count FROM fabubot_messages WHERE user_id = ? AND direction = "incoming" AND is_read = 0',
        [userId]
      );
      
      res.status(200).json({ count: countResult[0].count });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取未读消息数失败', error: error.message });
  }
});

// =============================================================
// 群组管理相关路由 - 转发设置
// =============================================================

// 获取群组转发设置
router.get('/groups/:groupId/forward-settings', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const conn = await pool.getConnection();
    try {
      const [settings] = await conn.execute(
        'SELECT setting_key, setting_value FROM fabubot_group_settings WHERE group_id = ? AND setting_key IN (?, ?)',
        [groupId, 'forward_enabled', 'forward_target_chat_ids']
      );
      
      const result = {
        forward_enabled: false,
        forward_target_chat_ids: []
      };
      
      for (const setting of settings) {
        if (setting.setting_key === 'forward_enabled') {
          result.forward_enabled = setting.setting_value === '1' || setting.setting_value === 'true';
        } else if (setting.setting_key === 'forward_target_chat_ids') {
          try {
            result.forward_target_chat_ids = JSON.parse(setting.setting_value);
          } catch {
            result.forward_target_chat_ids = [];
          }
        }
      }
      
      res.status(200).json(result);
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取转发设置失败', error: error.message });
  }
});

// 更新群组转发设置
router.put('/groups/:groupId/forward-settings', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { forward_enabled, forward_target_chat_ids } = req.body;
    
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      
      // 更新 forward_enabled 设置
      const [existingEnabled] = await conn.execute(
        'SELECT id FROM fabubot_group_settings WHERE group_id = ? AND setting_key = ?',
        [groupId, 'forward_enabled']
      );
      
      if (existingEnabled.length > 0) {
        await conn.execute(
          'UPDATE fabubot_group_settings SET setting_value = ? WHERE group_id = ? AND setting_key = ?',
          [forward_enabled ? '1' : '0', groupId, 'forward_enabled']
        );
      } else {
        await conn.execute(
          'INSERT INTO fabubot_group_settings (group_id, setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?, ?)',
          [groupId, 'forward_enabled', forward_enabled ? '1' : '0', 'boolean', '是否启用转发功能']
        );
      }
      
      // 更新 forward_target_chat_ids 设置
      const [existingIds] = await conn.execute(
        'SELECT id FROM fabubot_group_settings WHERE group_id = ? AND setting_key = ?',
        [groupId, 'forward_target_chat_ids']
      );
      
      const chatIdsValue = JSON.stringify(forward_target_chat_ids || []);
      
      if (existingIds.length > 0) {
        await conn.execute(
          'UPDATE fabubot_group_settings SET setting_value = ? WHERE group_id = ? AND setting_key = ?',
          [chatIdsValue, groupId, 'forward_target_chat_ids']
        );
      } else {
        await conn.execute(
          'INSERT INTO fabubot_group_settings (group_id, setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?, ?)',
          [groupId, 'forward_target_chat_ids', chatIdsValue, 'json', '转发目标群组ID列表']
        );
      }
      
      await conn.commit();
      res.status(200).json({ success: true, message: '转发设置更新成功' });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '更新转发设置失败', error: error.message });
  }
});

// =============================================================
// 切换群组是否在转发列表中
// =============================================================
router.put('/groups/:groupId/forward-toggle', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { enabled } = req.body;
    
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      
      // 获取当前的 FORWARD_CHAT_ID 配置
      const [configs] = await conn.execute(
        'SELECT config_value FROM fabubot_configs WHERE config_key = ?',
        ['FORWARD_CHAT_ID']
      );
      
      let forwardChatIds = [];
      if (configs.length > 0 && configs[0].config_value) {
        try {
          forwardChatIds = JSON.parse(configs[0].config_value);
        } catch (e) {
          // 如果不是有效的JSON，尝试作为单个ID处理
          forwardChatIds = [configs[0].config_value];
        }
      }
      
      // 确保是数组
      if (!Array.isArray(forwardChatIds)) {
        forwardChatIds = [];
      }
      
      // 添加或删除当前群组ID - 确保存储的是数值类型
      const groupIdNum = Number(groupId);
      if (enabled) {
        if (!forwardChatIds.includes(groupIdNum)) {
          forwardChatIds.push(groupIdNum);
        }
      } else {
        forwardChatIds = forwardChatIds.filter(id => Number(id) !== groupIdNum);
      }
      
      // 更新配置
      const configValue = JSON.stringify(forwardChatIds);
      if (configs.length > 0) {
        await conn.execute(
          'UPDATE fabubot_configs SET config_value = ? WHERE config_key = ?',
          [configValue, 'FORWARD_CHAT_ID']
        );
      } else {
        await conn.execute(
          'INSERT INTO fabubot_configs (config_key, config_value, config_type, description) VALUES (?, ?, ?, ?)',
          ['FORWARD_CHAT_ID', configValue, 'json', '转发目标群组ID列表']
        );
      }
      
      await conn.commit();
      res.status(200).json({ success: true, message: '转发设置更新成功', forward_chat_ids: forwardChatIds });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '更新转发设置失败', error: error.message });
  }
});

// =============================================================
// 群组管理相关路由
// =============================================================

// 获取群组列表
router.get('/groups', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const { page = 1, pageSize = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);
      
      const [groups] = await conn.execute(
        'SELECT * FROM fabubot_groups ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [parseInt(pageSize), offset]
      );
      
      const [countResult] = await conn.execute('SELECT COUNT(*) as total FROM fabubot_groups');
      const total = countResult[0].total;
      
      res.status(200).json({ groups, total, page: parseInt(page), pageSize: parseInt(pageSize) });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取群组列表失败', error: error.message });
  }
});

// 添加群组
router.post('/groups', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId, groupTitle, groupUsername, groupType } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ message: '群组ID不能为空' });
    }
    
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        `INSERT INTO fabubot_groups 
         (group_id, group_title, group_username, group_type, is_enabled)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           group_title = VALUES(group_title),
           group_username = VALUES(group_username),
           group_type = VALUES(group_type)`,
        [groupId, groupTitle || '未命名群组', groupUsername || null, groupType || 'supergroup']
      );
      
      await logOperation(req, 'add', '机器人', parseInt(groupId), groupTitle || '未命名群组', `添加群组: ${groupTitle || '未命名群组'}`);
      
      res.status(200).json({ success: true, message: '群组添加成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '添加群组失败', error: error.message });
  }
});

// 更新群组信息
router.put('/groups/:groupId', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const updateData = req.body;
    
    const allowedFields = [
      'group_title', 'group_username', 'group_type', 'is_enabled',
      'welcome_enabled', 'leave_message_enabled', 'rules_enabled',
      'anti_spam_enabled', 'anti_flood_enabled', 'anti_link_enabled',
      'auto_delete_enabled', 'captcha_enabled', 'slow_mode_enabled',
      'slow_mode_seconds', 'max_warnings', 'warning_action'
    ];
    
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ message: '没有可更新的字段' });
    }
    
    values.push(groupId);
    
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        `UPDATE fabubot_groups SET ${fields.join(', ')} WHERE group_id = ?`,
        values
      );
      
      await logOperation(req, 'update', '机器人', parseInt(groupId), updateData.group_title || `群组${groupId}`, `更新群组信息`);
      
      res.status(200).json({ success: true, message: '群组更新成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '更新群组失败', error: error.message });
  }
});

// 更新欢迎消息
router.put('/groups/:groupId/welcome', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { welcome_text, leave_text } = req.body;
    
    const conn = await pool.getConnection();
    try {
      // 检查是否已存在欢迎消息记录
      const [existing] = await conn.execute('SELECT * FROM fabubot_group_welcomes WHERE group_id = ?', [groupId]);
      
      if (existing.length > 0) {
        // 更新现有记录
        await conn.execute(
          'UPDATE fabubot_group_welcomes SET welcome_text = ?, leave_text = ? WHERE group_id = ?',
          [welcome_text || null, leave_text || null, groupId]
        );
      } else {
        // 创建新记录
        await conn.execute(
          'INSERT INTO fabubot_group_welcomes (group_id, welcome_text, leave_text) VALUES (?, ?, ?)',
          [groupId, welcome_text || null, leave_text || null]
        );
      }
      
      res.status(200).json({ success: true, message: '欢迎消息更新成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '更新欢迎消息失败', error: error.message });
  }
});

// 更新反刷屏设置
router.put('/groups/:groupId/flood', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { flood_max_messages, flood_time_window } = req.body;
    
    const conn = await pool.getConnection();
    try {
      // 更新或插入 max_messages 设置
      const [existingMax] = await conn.execute(
        'SELECT id FROM fabubot_group_settings WHERE group_id = ? AND setting_key = ?',
        [groupId, 'flood_max_messages']
      );
      
      if (existingMax.length > 0) {
        await conn.execute(
          'UPDATE fabubot_group_settings SET setting_value = ? WHERE group_id = ? AND setting_key = ?',
          [JSON.stringify(flood_max_messages || 5), groupId, 'flood_max_messages']
        );
      } else {
        await conn.execute(
          'INSERT INTO fabubot_group_settings (group_id, setting_key, setting_value, setting_type) VALUES (?, ?, ?, ?)',
          [groupId, 'flood_max_messages', JSON.stringify(flood_max_messages || 5), 'integer']
        );
      }

      // 更新或插入 time_window 设置
      const [existingWindow] = await conn.execute(
        'SELECT id FROM fabubot_group_settings WHERE group_id = ? AND setting_key = ?',
        [groupId, 'flood_time_window']
      );
      
      if (existingWindow.length > 0) {
        await conn.execute(
          'UPDATE fabubot_group_settings SET setting_value = ? WHERE group_id = ? AND setting_key = ?',
          [JSON.stringify(flood_time_window || 5000), groupId, 'flood_time_window']
        );
      } else {
        await conn.execute(
          'INSERT INTO fabubot_group_settings (group_id, setting_key, setting_value, setting_type) VALUES (?, ?, ?, ?)',
          [groupId, 'flood_time_window', JSON.stringify(flood_time_window || 5000), 'integer']
        );
      }
      
      res.status(200).json({ success: true, message: '反刷屏设置更新成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '更新反刷屏设置失败', error: error.message });
  }
});

// 获取群组详情
router.get('/groups/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const conn = await pool.getConnection();
    try {
      const [groups] = await conn.execute('SELECT * FROM fabubot_groups WHERE group_id = ?', [groupId]);
      
      if (groups.length === 0) {
        return res.status(404).json({ message: '群组不存在' });
      }
      
      const group = groups[0];
      
      // 获取欢迎消息
      const [welcomes] = await conn.execute('SELECT * FROM fabubot_group_welcomes WHERE group_id = ?', [groupId]);
      group.welcome = welcomes.length > 0 ? welcomes[0] : null;
      
      // 获取群规则
      const [rules] = await conn.execute('SELECT * FROM fabubot_group_rules WHERE group_id = ?', [groupId]);
      group.rules = rules.length > 0 ? rules[0] : null;
      
      // 获取成员数量
      const [memberCount] = await conn.execute(
        'SELECT COUNT(*) as count FROM fabubot_group_members WHERE group_id = ?',
        [groupId]
      );
      group.member_count = memberCount[0].count;

      // 获取反刷屏设置
      const [floodSettings] = await conn.execute(
        'SELECT setting_key, setting_value FROM fabubot_group_settings WHERE group_id = ? AND setting_key IN (?, ?)',
        [groupId, 'flood_max_messages', 'flood_time_window']
      );
      group.flood_max_messages = 5;
      group.flood_time_window = 5000;
      for (const setting of floodSettings) {
        if (setting.setting_key === 'flood_max_messages') {
          group.flood_max_messages = JSON.parse(setting.setting_value);
        } else if (setting.setting_key === 'flood_time_window') {
          group.flood_time_window = JSON.parse(setting.setting_value);
        }
      }

      // 获取转发设置 - 从 fabubot_configs 表检查当前群组是否在转发列表中
      const [forwardConfig] = await conn.execute(
        'SELECT config_value FROM fabubot_configs WHERE config_key = ?',
        ['FORWARD_CHAT_ID']
      );
      group.is_forward_enabled = false;
      if (forwardConfig.length > 0 && forwardConfig[0].config_value) {
        let forwardChatIds = [];
        try {
          forwardChatIds = JSON.parse(forwardConfig[0].config_value);
        } catch (e) {
          // 如果不是有效的JSON，尝试作为单个ID处理
          forwardChatIds = [Number(forwardConfig[0].config_value)];
        }
        // 确保是数组
        if (Array.isArray(forwardChatIds)) {
          const groupIdNum = Number(groupId);
          group.is_forward_enabled = forwardChatIds.some(id => Number(id) === groupIdNum);
        }
      }
      
      res.status(200).json(group);
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取群组详情失败', error: error.message });
  }
});

// 删除群组
router.delete('/groups/:groupId', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.execute('DELETE FROM fabubot_groups WHERE group_id = ?', [groupId]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '群组不存在' });
      }
      
      await logOperation(req, 'delete', '机器人', parseInt(groupId), `群组${groupId}`, `删除群组`);
      
      res.status(200).json({ success: true, message: '群组删除成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '删除群组失败', error: error.message });
  }
});

// 获取群组成员列表
router.get('/groups/:groupId/members', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, pageSize = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    const conn = await pool.getConnection();
    try {
      const [members] = await conn.execute(
        'SELECT * FROM fabubot_group_members WHERE group_id = ? ORDER BY joined_at DESC LIMIT ? OFFSET ?',
        [groupId, parseInt(pageSize), offset]
      );
      
      const [countResult] = await conn.execute(
        'SELECT COUNT(*) as total FROM fabubot_group_members WHERE group_id = ?',
        [groupId]
      );
      
      res.status(200).json({ members, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取成员列表失败', error: error.message });
  }
});

// 获取群操作日志
router.get('/groups/:groupId/logs', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, pageSize = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    const conn = await pool.getConnection();
    try {
      const [logs] = await conn.execute(
        'SELECT * FROM fabubot_group_logs WHERE group_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [groupId, parseInt(pageSize), offset]
      );
      
      // 处理 details JSON 字符串
      const processedLogs = logs.map(log => {
        let processed = { ...log };
        // 解析 details JSON
        if (log.details) {
          try {
            processed.details = JSON.parse(log.details);
          } catch (e) {
            processed.details = log.details;
          }
        }
        return processed;
      });
      
      const [countResult] = await conn.execute(
        'SELECT COUNT(*) as total FROM fabubot_group_logs WHERE group_id = ?',
        [groupId]
      );
      
      res.status(200).json({ logs: processedLogs, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取操作日志失败', error: error.message });
  }
});

// 获取违禁词列表
router.get('/groups/:groupId/forbidden-words', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const conn = await pool.getConnection();
    try {
      const [words] = await conn.execute(
        'SELECT * FROM fabubot_group_forbidden_words WHERE group_id = ? OR group_id = 0 ORDER BY created_at DESC',
        [parseInt(groupId)]
      );
      
      res.status(200).json({ words });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取违禁词列表失败', error: error.message });
  }
});

// 添加违禁词
router.post('/groups/:groupId/forbidden-words', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { word, wordType, action, isGlobal } = req.body;
    
    if (!word) {
      return res.status(400).json({ message: '违禁词不能为空' });
    }
    
    const conn = await pool.getConnection();
    try {
      // 将 groupId 转换为数字，处理全局违禁词时设为 0（根据数据库设计）
      const parsedGroupId = isGlobal ? 0 : parseInt(groupId);
      
      await conn.execute(
        `INSERT INTO fabubot_group_forbidden_words 
         (group_id, word, word_type, action, is_enabled)
         VALUES (?, ?, ?, ?, 1)`,
        [parsedGroupId, word, wordType || 'other', action || 'delete']
      );
      
      await logOperation(req, 'add', '机器人', parsedGroupId, word, `${isGlobal ? '添加全局违禁词' : '添加群组违禁词'}: ${word}`);
      
      res.status(200).json({ success: true, message: '违禁词添加成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '添加违禁词失败', error: error.message });
  }
});

// 批量添加违禁词
router.post('/groups/:groupId/forbidden-words/batch', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { words, wordType, action, isGlobal } = req.body;
    
    if (!words || !Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ message: '违禁词列表不能为空' });
    }
    
    const conn = await pool.getConnection();
    try {
      // 将 groupId 转换为数字，处理全局违禁词时设为 0
      const parsedGroupId = isGlobal ? 0 : parseInt(groupId);
      
      // 批量插入
      const insertPromises = words.map(word => {
        return conn.execute(
          `INSERT INTO fabubot_group_forbidden_words 
           (group_id, word, word_type, action, is_enabled)
           VALUES (?, ?, ?, ?, 1)`,
          [parsedGroupId, word.trim(), wordType || 'other', action || 'delete']
        );
      });
      
      await Promise.all(insertPromises);
      
      res.status(200).json({ success: true, message: `成功添加 ${words.length} 个违禁词` });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '批量添加违禁词失败', error: error.message });
  }
});

// 删除违禁词
router.delete('/groups/:groupId/forbidden-words/:wordId', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { wordId } = req.params;
    
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.execute('DELETE FROM fabubot_group_forbidden_words WHERE id = ?', [wordId]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '违禁词不存在' });
      }
      
      await logOperation(req, 'delete', '机器人', parseInt(wordId), `违禁词${wordId}`, `删除违禁词`);
      
      res.status(200).json({ success: true, message: '违禁词删除成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '删除违禁词失败', error: error.message });
  }
});

// 获取群警告记录
router.get('/groups/:groupId/warnings', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, pageSize = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    const conn = await pool.getConnection();
    try {
      const [warnings] = await conn.execute(
        'SELECT * FROM fabubot_group_warnings WHERE group_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [groupId, parseInt(pageSize), offset]
      );
      
      const [countResult] = await conn.execute(
        'SELECT COUNT(*) as total FROM fabubot_group_warnings WHERE group_id = ?',
        [groupId]
      );
      
      res.status(200).json({ warnings, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取警告记录失败', error: error.message });
  }
});

// 获取封禁记录
router.get('/groups/:groupId/bans', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, pageSize = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    const conn = await pool.getConnection();
    try {
      const [bans] = await conn.execute(
        'SELECT * FROM fabubot_group_bans WHERE group_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [parseInt(groupId), parseInt(pageSize), offset]
      );
      
      const [countResult] = await conn.execute(
        'SELECT COUNT(*) as total FROM fabubot_group_bans WHERE group_id = ?',
        [parseInt(groupId)]
      );
      
      res.status(200).json({ bans, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取封禁记录失败', error: error.message });
  }
});

// 解封用户
router.delete('/groups/:groupId/bans/:userId', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const adminId = req.user.userId; // 从 token 中获取管理员 ID
    
    const conn = await pool.getConnection();
    try {
      // 检查是否有正在进行的封禁
      const [existingBans] = await conn.execute(
        'SELECT * FROM fabubot_group_bans WHERE group_id = ? AND user_id = ? AND is_active = 1',
        [parseInt(groupId), parseInt(userId)]
      );
      
      if (existingBans.length === 0) {
        return res.status(404).json({ message: '该用户没有正在进行的封禁' });
      }
      
      // 更新封禁记录，标记为已解封
      await conn.execute(
        'UPDATE fabubot_group_bans SET is_active = 0, unbanned_by = ?, unbanned_at = NOW() WHERE group_id = ? AND user_id = ? AND is_active = 1',
        [adminId, parseInt(groupId), parseInt(userId)]
      );
      
      // 尝试调用机器人 API 实际解封用户
      try {
        const bot = global.fabuBot;
        if (bot) {
          await bot.unbanChatMember(parseInt(groupId), parseInt(userId));
        }
      } catch (botError) {
        console.warn('[faBuBot API] 机器人解封失败，但数据库已更新:', botError.message);
      }
      
      res.status(200).json({ success: true, message: '用户解封成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('[faBuBot API] 解封用户失败:', error);
    res.status(500).json({ message: '解封用户失败', error: error.message });
  }
});

// 获取举报记录（从举报表获取）
router.get('/groups/:groupId/reports', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, pageSize = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    const conn = await pool.getConnection();
    try {
      try {
        // 从举报表获取举报记录
        const [reports] = await conn.execute(
          'SELECT * FROM fabubot_group_reports WHERE group_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
          [groupId, parseInt(pageSize), offset]
        );
        
        const [countResult] = await conn.execute(
          'SELECT COUNT(*) as total FROM fabubot_group_reports WHERE group_id = ?',
          [groupId]
        );
        
        res.status(200).json({ reports, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) });
      } catch (tableError) {
        // 如果表不存在，返回空列表
        res.status(200).json({ reports: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
      }
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取举报记录失败', error: error.message });
  }
});

// 记录操作日志的辅助函数
const logGroupAction = async (conn, groupId, actionType, userId = null, actorId = null, details = null, messageId = null) => {
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
  } catch (error) {
    console.error('[faBuBot API] 记录群组操作日志失败:', error);
  }
};

// 处理举报 - 删除消息
router.post('/groups/:groupId/reports/:reportId/delete-message', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId, reportId } = req.params;
    const adminId = req.user.userId;
    const { resolutionNote } = req.body;
    
    const conn = await pool.getConnection();
    try {
      const [reports] = await conn.execute(
        'SELECT * FROM fabubot_group_reports WHERE id = ? AND group_id = ?',
        [reportId, groupId]
      );
      
      if (reports.length === 0) {
        return res.status(404).json({ message: '举报记录不存在' });
      }
      
      const report = reports[0];
      
      // 删除消息
      if (report.message_id) {
        try {
          const bot = global.fabuBot;
          if (bot) {
            await bot.deleteMessage(parseInt(groupId), report.message_id);
          }
        } catch (botError) {
          console.warn('[faBuBot API] 删除消息失败:', botError.message);
        }
      }
      
      // 更新举报状态
      await conn.execute(
        'UPDATE fabubot_group_reports SET status = "resolved", resolved_by = ?, resolved_at = NOW(), resolution_note = ? WHERE id = ?',
        [adminId, resolutionNote || '已删除消息', reportId]
      );
      
      // 记录操作日志
      await logGroupAction(conn, groupId, 'message_delete', report.reported_user_id, adminId, {
        report_id: reportId,
        message_id: report.message_id
      });
      
      res.status(200).json({ success: true, message: '消息删除成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('[faBuBot API] 删除消息失败:', error);
    res.status(500).json({ message: '删除消息失败', error: error.message });
  }
});

// 处理举报 - 封禁用户
router.post('/groups/:groupId/reports/:reportId/ban-user', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId, reportId } = req.params;
    const adminId = req.user.userId;
    const { reason, banDuration = 0, resolutionNote } = req.body; // banDuration = 0 表示永久
    
    const conn = await pool.getConnection();
    try {
      const [reports] = await conn.execute(
        'SELECT * FROM fabubot_group_reports WHERE id = ? AND group_id = ?',
        [reportId, groupId]
      );
      
      if (reports.length === 0) {
        return res.status(404).json({ message: '举报记录不存在' });
      }
      
      const report = reports[0];
      
      if (!report.reported_user_id) {
        return res.status(400).json({ message: '被举报用户ID不存在' });
      }
      
      const expiresAt = banDuration > 0 
        ? new Date(Date.now() + banDuration * 60 * 1000) 
        : null;
      
      // 封禁用户
      try {
        const bot = global.fabuBot;
        if (bot) {
          if (banDuration > 0) {
            // 有时限封禁
            await bot.banChatMember(parseInt(groupId), report.reported_user_id, {
              until_date: Math.floor(expiresAt.getTime() / 1000)
            });
          } else {
            // 永久封禁
            await bot.banChatMember(parseInt(groupId), report.reported_user_id);
          }
        }
      } catch (botError) {
        console.warn('[faBuBot API] 封禁用户失败:', botError.message);
      }
      
      // 记录到封禁表
      await conn.execute(
        `INSERT INTO fabubot_group_bans 
         (group_id, user_id, banned_by, reason, expires_at, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [parseInt(groupId), report.reported_user_id, adminId, reason || '举报处理', expiresAt]
      );
      
      // 更新举报状态
      await conn.execute(
        'UPDATE fabubot_group_reports SET status = "resolved", resolved_by = ?, resolved_at = NOW(), resolution_note = ? WHERE id = ?',
        [adminId, resolutionNote || '已封禁用户', reportId]
      );
      
      // 记录操作日志
      await logGroupAction(conn, groupId, 'user_ban', report.reported_user_id, adminId, {
        report_id: reportId,
        reason: reason || '举报处理',
        ban_duration: banDuration
      });
      
      res.status(200).json({ success: true, message: '用户封禁成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('[faBuBot API] 封禁用户失败:', error);
    res.status(500).json({ message: '封禁用户失败', error: error.message });
  }
});

// 处理举报 - 警告用户
router.post('/groups/:groupId/reports/:reportId/warn-user', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId, reportId } = req.params;
    const adminId = req.user.userId;
    const { reason, resolutionNote } = req.body;
    
    const conn = await pool.getConnection();
    try {
      const [reports] = await conn.execute(
        'SELECT * FROM fabubot_group_reports WHERE id = ? AND group_id = ?',
        [reportId, groupId]
      );
      
      if (reports.length === 0) {
        return res.status(404).json({ message: '举报记录不存在' });
      }
      
      const report = reports[0];
      
      if (!report.reported_user_id) {
        return res.status(400).json({ message: '被举报用户ID不存在' });
      }
      
      // 记录到警告表
      await conn.execute(
        `INSERT INTO fabubot_group_warnings 
         (group_id, user_id, warned_by, reason)
         VALUES (?, ?, ?, ?)`,
        [parseInt(groupId), report.reported_user_id, adminId, reason || '举报处理']
      );
      
      // 更新举报状态
      await conn.execute(
        'UPDATE fabubot_group_reports SET status = "resolved", resolved_by = ?, resolved_at = NOW(), resolution_note = ? WHERE id = ?',
        [adminId, resolutionNote || '已警告用户', reportId]
      );
      
      // 记录操作日志
      await logGroupAction(conn, groupId, 'user_warn', report.reported_user_id, adminId, {
        report_id: reportId,
        reason: reason || '举报处理'
      });
      
      res.status(200).json({ success: true, message: '用户警告成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('[faBuBot API] 警告用户失败:', error);
    res.status(500).json({ message: '警告用户失败', error: error.message });
  }
});

// 处理举报 - 驳回举报
router.post('/groups/:groupId/reports/:reportId/dismiss', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { groupId, reportId } = req.params;
    const adminId = req.user.userId;
    const { resolutionNote } = req.body;
    
    const conn = await pool.getConnection();
    try {
      const [reports] = await conn.execute(
        'SELECT * FROM fabubot_group_reports WHERE id = ? AND group_id = ?',
        [reportId, groupId]
      );
      
      if (reports.length === 0) {
        return res.status(404).json({ message: '举报记录不存在' });
      }
      
      // 更新举报状态
      await conn.execute(
        'UPDATE fabubot_group_reports SET status = "dismissed", resolved_by = ?, resolved_at = NOW(), resolution_note = ? WHERE id = ?',
        [adminId, resolutionNote || '举报已驳回', reportId]
      );
      
      // 记录操作日志
      await logGroupAction(conn, groupId, 'other', null, adminId, {
        report_id: reportId,
        action: 'dismiss_report'
      });
      
      res.status(200).json({ success: true, message: '举报已驳回' });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('[faBuBot API] 驳回举报失败:', error);
    res.status(500).json({ message: '驳回举报失败', error: error.message });
  }
});

// 获取启动记录
router.get('/startup-records', authenticateToken, async (req, res) => {
  try {
    const db = require('../config/db');
    
    const [records] = await db.execute(
      'SELECT id, timestamp, success, error, createdBy, environment, appName, proxy FROM fabubot_startup_records ORDER BY timestamp DESC LIMIT 50'
    );
    
    res.status(200).json({ records });
  } catch (error) {
    res.status(500).json({ message: '获取启动记录失败', error: error.message });
  }
});

module.exports = router;
