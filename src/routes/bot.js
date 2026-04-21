const express = require('express');
const router = express.Router();
const db = require('../config/db');

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



// 音乐搜索相关路由

// 搜索音乐（兼容前端调用）
router.get('/music/search', authenticateToken, async (req, res) => {
  try {
    const { keyword, platform = 'all' } = req.query;
    
    // 调用 FangpiMusic 搜索服务
    const { searchMusic } = require('../../bots/livebot/src/spiderOther/music/FangpiMusic');
    const searchResult = await searchMusic(keyword);
    
    if (!searchResult.success) {
      return res.status(500).json({ message: '搜索音乐失败', error: searchResult.error });
    }
    
    // 记录搜索历史
    await db.execute(
      'INSERT INTO music_search_history (keyword, platform) VALUES (?, ?)',
      [keyword, platform]
    );
    
    res.status(200).json({ results: searchResult.data.results });
  } catch (error) {
    res.status(500).json({ message: '搜索音乐失败', error: error.message });
  }
});

// 搜索音乐
router.post('/music/search', authenticateToken, async (req, res) => {
  try {
    const { keyword, platform = 'all' } = req.body;
    
    // 调用 FangpiMusic 搜索服务
    const { searchMusic } = require('../../bots/livebot/src/spiderOther/music/FangpiMusic');
    const searchResult = await searchMusic(keyword);
    
    if (!searchResult.success) {
      return res.status(500).json({ message: '搜索音乐失败', error: searchResult.error });
    }
    
    // 记录搜索历史
    await db.execute(
      'INSERT INTO music_search_history (keyword, platform) VALUES (?, ?)',
      [keyword, platform]
    );
    
    res.status(200).json(searchResult.data.results);
  } catch (error) {
    res.status(500).json({ message: '搜索音乐失败', error: error.message });
  }
});

// 获取搜索历史（兼容前端调用）
router.get('/music/history', authenticateToken, async (req, res) => {
  try {
    const [history] = await db.execute(
      'SELECT id, keyword, platform, createdAt FROM music_search_history ORDER BY createdAt DESC LIMIT 50'
    );
    res.status(200).json({ history });
  } catch (error) {
    res.status(500).json({ message: '获取搜索历史失败', error: error.message });
  }
});

// 清空搜索历史（兼容前端调用）
router.post('/music/history/clear', authenticateToken, async (req, res) => {
  try {
    await db.execute('TRUNCATE TABLE music_search_history');
    res.status(200).json({ success: true, message: '搜索历史清空成功' });
  } catch (error) {
    res.status(500).json({ message: '清空搜索历史失败', error: error.message });
  }
});

// 清空搜索历史
router.delete('/music/history', authenticateToken, async (req, res) => {
  try {
    await db.execute('TRUNCATE TABLE music_search_history');
    res.status(200).json({ success: true, message: '搜索历史清空成功' });
  } catch (error) {
    res.status(500).json({ message: '清空搜索历史失败', error: error.message });
  }
});

// 机器人状态相关路由

// 获取机器人状态
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const { getBotStatus } = require('../../bots/livebot/bot');
    const status = getBotStatus();
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ message: '获取机器人状态失败', error: error.message });
  }
});

// 启动机器人
router.post('/start', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { startBot } = require('../../bots/livebot/bot');
    const result = await startBot();
    
    // 保存启动记录
    const db = require('../config/db');
    const { getEnvConfig } = require('../../bots/livebot/bot');
    const envConfig = await getEnvConfig();
    await db.execute(
      'INSERT INTO startup_records (success, error, createdBy, environment, appName, proxy) VALUES (?, ?, ?, ?, ?, ?)',
      [result, result ? null : '启动失败', req.user.username, envConfig.environment, envConfig.appName, envConfig.proxy]
    );
    
    if (result) {
      res.status(200).json({ success: true, message: '机器人启动成功' });
    } else {
      const { getBotStatus } = require('../../bots/livebot/bot');
      const status = getBotStatus();
      res.status(400).json({ success: false, message: '机器人启动失败', error: status.error });
    }
  } catch (error) {
    // 保存失败记录
    const db = require('../config/db');
    const { getEnvConfig } = require('../../bots/livebot/bot');
    const envConfig = await getEnvConfig();
    await db.execute(
      'INSERT INTO startup_records (success, error, createdBy, environment, appName, proxy) VALUES (?, ?, ?, ?, ?, ?)',
      [false, error.message, req.user.username, envConfig.environment, envConfig.appName, envConfig.proxy]
    );
    res.status(500).json({ message: '启动机器人失败', error: error.message });
  }
});

// 停止机器人
router.post('/stop', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { stopBot } = require('../../bots/livebot/bot');
    const result = await stopBot();
    if (result) {
      res.status(200).json({ success: true, message: '机器人停止成功' });
    } else {
      res.status(400).json({ success: false, message: '机器人停止失败' });
    }
  } catch (error) {
    res.status(500).json({ message: '停止机器人失败', error: error.message });
  }
});

// 搜索功能相关路由

// 搜索直播（兼容前端调用）
router.get('/search/live', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.query;
    
    // 这里应该调用直播搜索服务，现在返回模拟数据
    const mockResults = [
      {
        id: 1,
        username: '示例主播1',
        site: 'bilibili',
        roomid: '123456',
        title: '示例直播标题1',
        isLive: true
      },
      {
        id: 2,
        username: '示例主播2',
        site: 'douyu',
        roomid: '654321',
        title: '示例直播标题2',
        isLive: false
      }
    ];
    
    res.status(200).json({ results: mockResults });
  } catch (error) {
    res.status(500).json({ message: '搜索直播失败', error: error.message });
  }
});

// 搜索用户（兼容前端调用）
router.get('/search/user', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.query;
    
    // 这里应该调用用户搜索服务，现在返回模拟数据
    const mockResults = [
      {
        id: 1,
        username: '示例用户1',
        permissionLevel: 2
      },
      {
        id: 2,
        username: '示例用户2',
        permissionLevel: 1
      }
    ];
    
    res.status(200).json({ results: mockResults });
  } catch (error) {
    res.status(500).json({ message: '搜索用户失败', error: error.message });
  }
});

// 搜索内容（兼容前端调用）
router.get('/search/content', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.query;
    
    // 这里应该调用内容搜索服务，现在返回模拟数据
    const mockResults = [
      {
        id: 1,
        title: '示例内容标题1',
        category: 'news',
        publishTime: new Date().toISOString()
      },
      {
        id: 2,
        title: '示例内容标题2',
        category: 'entertainment',
        publishTime: new Date().toISOString()
      }
    ];
    
    res.status(200).json({ results: mockResults });
  } catch (error) {
    res.status(500).json({ message: '搜索内容失败', error: error.message });
  }
});

// 搜索日志（兼容前端调用）
router.get('/search/logs', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.query;
    
    let query = 'SELECT id, type, message, createdAt FROM system_logs WHERE message LIKE ? ORDER BY createdAt DESC LIMIT 50';
    const params = [`%${keyword}%`];
    
    const [results] = await db.execute(query, params);
    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({ message: '搜索日志失败', error: error.message });
  }
});

// 搜索日志
router.post('/search/logs', authenticateToken, async (req, res) => {
  try {
    const { keyword, type = 'logs' } = req.body;
    
    let query = '';
    const params = [];
    
    switch (type) {
      case 'logs':
        query = 'SELECT id, type, message, createdAt FROM system_logs WHERE message LIKE ? ORDER BY createdAt DESC LIMIT 50';
        params.push(`%${keyword}%`);
        break;
      case 'monitor':
        query = 'SELECT id, type, targetId, message, createdAt FROM monitor_logs WHERE message LIKE ? ORDER BY createdAt DESC LIMIT 50';
        params.push(`%${keyword}%`);
        break;
      case 'operation':
        query = 'SELECT id, userId, username, operationType, targetType, targetId, targetName, ip, operationTime, details FROM operation_logs WHERE details LIKE ? OR targetName LIKE ? ORDER BY operationTime DESC LIMIT 50';
        params.push(`%${keyword}%`, `%${keyword}%`);
        break;
      default:
        query = 'SELECT id, type, message, createdAt FROM system_logs WHERE message LIKE ? ORDER BY createdAt DESC LIMIT 50';
        params.push(`%${keyword}%`);
    }
    
    const [results] = await db.execute(query, params);
    res.status(200).json(results);
  } catch (error) {
      res.status(500).json({ message: '搜索日志失败', error: error.message });
    }
  });

  // 获取环境配置
  router.get('/env', authenticateToken, async (req, res) => {
    try {
      const { getEnvConfig } = require('../../bots/livebot/bot');
      const envConfig = await getEnvConfig();
      res.status(200).json(envConfig);
    } catch (error) {
      res.status(500).json({ message: '获取环境配置失败', error: error.message });
    }
  });

  // 命令管理相关路由

  // 获取命令列表
  router.get('/commands', authenticateToken, async (req, res) => {
    try {
      const db = require('../config/db');
      const [commands] = await db.execute('SELECT * FROM bot_commands ORDER BY `order` ASC');
      res.status(200).json({ commands });
    } catch (error) {
      res.status(500).json({ message: '获取命令列表失败', error: error.message });
    }
  });

  // 添加命令
  router.post('/commands', authenticateToken, verifyAdmin, async (req, res) => {
    try {
      const db = require('../config/db');
      const { command, description, isEnabled = true, isAdmin = false } = req.body;
      
      if (!command || !description) {
        return res.status(400).json({ message: '命令和描述不能为空' });
      }
      
      // 检查命令是否已存在
      const [existingCommands] = await db.execute('SELECT * FROM bot_commands WHERE command = ?', [command]);
      if (existingCommands.length > 0) {
        return res.status(400).json({ message: '命令已存在' });
      }
      
      await db.execute('INSERT INTO bot_commands (command, description, isEnabled, isAdmin) VALUES (?, ?, ?, ?)', [command, description, isEnabled, isAdmin]);
      
      // 重新加载命令列表
      const { updateBotCommands } = require('../../bots/livebot/bot');
      await updateBotCommands();
      
      res.status(200).json({ success: true, message: '命令添加成功' });
    } catch (error) {
      res.status(500).json({ message: '添加命令失败', error: error.message });
    }
  });

  // 更新命令顺序
  router.put('/commands/order', authenticateToken, verifyAdmin, async (req, res) => {
    try {
      const db = require('../config/db');
      const { command, newOrder } = req.body;
      
      if (!command || newOrder === undefined) {
        return res.status(400).json({ message: '命令和新顺序不能为空' });
      }
      
      const [result] = await db.execute('UPDATE bot_commands SET `order` = ? WHERE command = ?', [newOrder, command]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '命令不存在' });
      }
      
      // 重新加载命令列表
      const { updateBotCommands } = require('../../bots/livebot/bot');
      await updateBotCommands();
      
      res.status(200).json({ success: true, message: '命令顺序更新成功' });
    } catch (error) {
      res.status(500).json({ message: '更新命令顺序失败', error: error.message });
    }
  });

  // 删除命令
  router.delete('/commands/:command', authenticateToken, verifyAdmin, async (req, res) => {
    try {
      const db = require('../config/db');
      const { command } = req.params;
      
      let [result] = await db.execute('DELETE FROM bot_commands WHERE command = ?', [command]);
      
      if (result.affectedRows === 0) {
        const commandWithSlash = '/' + command;
        [result] = await db.execute('DELETE FROM bot_commands WHERE command = ?', [commandWithSlash]);
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '命令不存在' });
      }
      
      const { updateBotCommands } = require('../../bots/livebot/bot');
      await updateBotCommands();
      
      res.status(200).json({ success: true, message: '命令删除成功' });
    } catch (error) {
      res.status(500).json({ message: '删除命令失败', error: error.message });
    }
  });

  // 更新命令
  router.put('/commands/:command', authenticateToken, verifyAdmin, async (req, res) => {
    try {
      const db = require('../config/db');
      const { command } = req.params;
      const { description, isEnabled, isAdmin, order } = req.body;
      
      // 首先获取命令的当前值
      const [commands] = await db.execute('SELECT description, isEnabled, isAdmin, `order` FROM bot_commands WHERE command = ?', [command]);
      if (commands.length === 0) {
        return res.status(404).json({ message: '命令不存在' });
      }
      
      // 使用现有值或新值
      const currentCommand = commands[0];
      const newDescription = description || currentCommand.description;
      const newIsEnabled = isEnabled !== undefined ? isEnabled : currentCommand.isEnabled;
      const newIsAdmin = isAdmin !== undefined ? isAdmin : currentCommand.isAdmin;
      const newOrder = order !== undefined ? order : currentCommand.order;
      
      const [result] = await db.execute('UPDATE bot_commands SET description = ?, isEnabled = ?, isAdmin = ?, `order` = ? WHERE command = ?', [newDescription, newIsEnabled, newIsAdmin, newOrder, command]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '命令不存在' });
      }
      
      // 重新加载命令列表
      const { updateBotCommands } = require('../../bots/livebot/bot');
      await updateBotCommands();
      
      res.status(200).json({ success: true, message: '命令更新成功' });
    } catch (error) {
      res.status(500).json({ message: '更新命令失败', error: error.message });
    }
  });

  // 消息发送相关路由

  // 获取用户列表
  router.get('/users', authenticateToken, async (req, res) => {
    try {
      const db = require('../config/db');
      const [users] = await db.execute('SELECT userId, fromId, username, permissionLevel, type FROM users ORDER BY userId');
      res.status(200).json({ users });
    } catch (error) {
      res.status(500).json({ message: '获取用户列表失败', error: error.message });
    }
  });

  // 发送消息
  router.post('/message/send', authenticateToken, verifyAdmin, async (req, res) => {
    try {
      const { sendMessage } = require('../../bots/livebot/bot');
      const { chatId, text, type, mediaUrl, caption } = req.body;
      const $ = require('../../bots/livebot/src/config/includes');
      const db = require('../config/db');
      
      if (!chatId) {
        return res.status(400).json({ message: '聊天ID不能为空' });
      }
      
      if (type === 'text' && !text) {
        return res.status(400).json({ message: '文本消息内容不能为空' });
      }
      
      if (['photo', 'video', 'audio', 'document'].includes(type) && !mediaUrl) {
        return res.status(400).json({ message: '媒体URL不能为空' });
      }
      
      let result;
      switch (type) {
        case 'text':
          result = await sendMessage(chatId, text);
          break;
        case 'photo':
          result = await $.bot.sendPhoto(chatId, mediaUrl, { caption, parse_mode: 'HTML' });
          break;
        case 'video':
          result = await $.bot.sendVideo(chatId, mediaUrl, { caption, parse_mode: 'HTML' });
          break;
        case 'audio':
          result = await $.bot.sendAudio(chatId, mediaUrl, { caption, parse_mode: 'HTML' });
          break;
        case 'document':
          result = await $.bot.sendDocument(chatId, mediaUrl, { caption, parse_mode: 'HTML' });
          break;
        default:
          return res.status(400).json({ message: '不支持的消息类型' });
      }
      
      // 保存发送记录到数据库
      const content = type === 'text' ? text : `${type}: ${mediaUrl}${caption ? ` (${caption})` : ''}`;
      await db.execute(
        'INSERT INTO livebot_sends (content, type, target, success, createdBy) VALUES (?, ?, ?, ?, ?)',
        [content, type, chatId, true, req.user.username]
      );
      
      res.status(200).json({ success: true, message: '消息发送成功', result });
    } catch (error) {
      // 保存失败记录到数据库
      const content = type === 'text' ? text : `${type}: ${mediaUrl}${caption ? ` (${caption})` : ''}`;
      const db = require('../config/db');
      await db.execute(
        'INSERT INTO livebot_sends (content, type, target, success, error, createdBy) VALUES (?, ?, ?, ?, ?, ?)',
        [content, type, chatId, false, error.message, req.user.username]
      );
      
      res.status(500).json({ message: '发送消息失败', error: error.message });
    }
  });
  
  // 获取消息列表
  router.get('/messages', authenticateToken, async (req, res) => {
    try {
      const $ = require('../../bots/livebot/src/config/includes');
      
      // 从内存中获取最近的消息
      // 注意：这是一个临时解决方案，实际应用中应该将消息存储到数据库
      const messages = $.recentMessages || [];
      
      res.status(200).json({ messages: messages.slice(0, 100) }); // 只返回最近100条消息
    } catch (error) {
      res.status(500).json({ message: '获取消息列表失败', error: error.message });
    }
  });
  
  // 获取发送记录
  router.get('/send-records', authenticateToken, async (req, res) => {
    try {
      const db = require('../config/db');
      
      // 确保 livebot_sends 表存在
      await db.execute(`
        CREATE TABLE IF NOT EXISTS livebot_sends (
          id INT AUTO_INCREMENT PRIMARY KEY,
          content TEXT,
          type VARCHAR(50),
          target VARCHAR(255),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          success BOOLEAN DEFAULT true,
          error TEXT,
          createdBy VARCHAR(255)
        )
      `);
      
      // 获取发送记录
      const [records] = await db.execute(
        'SELECT id, content, type, target, timestamp, success, error, createdBy FROM livebot_sends ORDER BY timestamp DESC LIMIT 50'
      );
      
      // 转换记录格式以匹配前端期望的格式
      const formattedRecords = records.map(record => ({
        id: record.id,
        chatId: record.target,
        type: record.type,
        text: record.type === 'text' ? record.content : null,
        mediaUrl: ['photo', 'video', 'audio', 'document'].includes(record.type) ? record.content.replace(`${record.type}: `, '').split(' (')[0] : null,
        caption: ['photo', 'video', 'audio', 'document'].includes(record.type) && record.content.includes(' (') ? record.content.split(' (')[1].slice(0, -1) : null,
        timestamp: record.timestamp,
        success: record.success,
        error: record.error,
        createdBy: record.createdBy
      }));
      
      res.status(200).json({ records: formattedRecords });
    } catch (error) {
      res.status(500).json({ message: '获取发送记录失败', error: error.message });
    }
  });

  // 机器人群组管理相关路由

  // 获取群组列表
  router.get('/groups', authenticateToken, async (req, res) => {
    try {
      const db = require('../config/db');
      
      // 确保 bot_groups 表存在
      await db.execute(`
        CREATE TABLE IF NOT EXISTS bot_groups (
          id INT AUTO_INCREMENT PRIMARY KEY,
          groupId VARCHAR(255) NOT NULL,
          groupName VARCHAR(255) NOT NULL,
          permissionLevel INT DEFAULT 1,
          type VARCHAR(100) NOT NULL,
          userId VARCHAR(255) NOT NULL,
          disabled BOOLEAN DEFAULT false,
          createTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updateTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      
      // 使用连表查询获取群组列表和添加者的用户名
      const [groups] = await db.execute(`
        SELECT bg.*, u.username as addedBy 
        FROM bot_groups bg
        LEFT JOIN users u ON bg.userId = u.userId
        ORDER BY bg.createTime DESC
      `);
      res.status(200).json(groups);
    } catch (error) {
      res.status(500).json({ message: '获取群组列表失败', error: error.message });
    }
  });

  // 添加群组
  router.post('/groups', authenticateToken, verifyAdmin, async (req, res) => {
    try {
      const db = require('../config/db');
      const { groupId, groupName, permissionLevel, type, userId } = req.body;
      
      if (!groupId || !groupName || !type || !userId) {
        return res.status(400).json({ message: '群组ID、群组名称、类型和用户ID不能为空' });
      }
      
      const [result] = await db.execute(
        'INSERT INTO bot_groups (groupId, groupName, permissionLevel, type, userId) VALUES (?, ?, ?, ?, ?)',
        [groupId, groupName, permissionLevel || 1, type, userId]
      );
      
      const [group] = await db.execute('SELECT * FROM bot_groups WHERE id = ?', [result.insertId]);
      res.status(200).json(group[0]);
    } catch (error) {
      res.status(500).json({ message: '添加群组失败', error: error.message });
    }
  });

  // 更新群组
  router.put('/groups/:id', authenticateToken, verifyAdmin, async (req, res) => {
    try {
      const db = require('../config/db');
      const { id } = req.params;
      const { groupName, permissionLevel, type } = req.body;
      
      if (!groupName) {
        return res.status(400).json({ message: '群组名称不能为空' });
      }
      
      const [result] = await db.execute(
        'UPDATE bot_groups SET groupName = ?, permissionLevel = ?, type = ? WHERE id = ?',
        [groupName, permissionLevel || 1, type, id]
      );
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '群组不存在' });
      }
      
      const [group] = await db.execute('SELECT * FROM bot_groups WHERE id = ?', [id]);
      res.status(200).json(group[0]);
    } catch (error) {
      res.status(500).json({ message: '更新群组失败', error: error.message });
    }
  });

  // 删除群组
  router.delete('/groups/:id', authenticateToken, verifyAdmin, async (req, res) => {
    try {
      const db = require('../config/db');
      const { id } = req.params;
      
      const [result] = await db.execute('DELETE FROM bot_groups WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '群组不存在' });
      }
      
      res.status(200).json({ success: true, message: '群组删除成功' });
    } catch (error) {
      res.status(500).json({ message: '删除群组失败', error: error.message });
    }
  });

  // 禁用/启用群组
  router.put('/groups/:id/disable', authenticateToken, verifyAdmin, async (req, res) => {
    try {
      const db = require('../config/db');
      const { id } = req.params;
      const { disabled } = req.body;
      
      // 获取群组信息，包括 groupId
      const [groups] = await db.execute('SELECT groupId FROM bot_groups WHERE id = ?', [id]);
      if (groups.length === 0) {
        return res.status(404).json({ message: '群组不存在' });
      }
      const groupId = groups[0].groupId;
      
      // 更新群组状态
      const [result] = await db.execute('UPDATE bot_groups SET disabled = ? WHERE id = ?', [disabled, id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '群组不存在' });
      }
      
      // 如果是禁用群组，同时禁用该群组的所有关注
      // 如果是启用群组，同时启用该群组的所有关注
      if (disabled) {
        await db.execute('UPDATE watch SET disabled = 1 WHERE chatid = ?', [groupId]);
      } else {
        await db.execute('UPDATE watch SET disabled = 0 WHERE chatid = ?', [groupId]);
      }
      
      res.status(200).json({ success: true, message: disabled ? '群组已禁用，同时禁用了所有关注' : '群组已启用，同时恢复了所有关注' });
    } catch (error) {
      res.status(500).json({ message: '更新群组状态失败', error: error.message });
    }
  });

  // 获取主播列表（用于关注主播功能）
  router.get('/groups/:groupId/vtbs', authenticateToken, async (req, res) => {
    try {
      const db = require('../config/db');
      const { groupId } = req.params;
      
      // 确保 vtbs 表存在
      await db.execute(`
        CREATE TABLE IF NOT EXISTS vtbs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mid VARCHAR(255) NOT NULL,
          username VARCHAR(255) NOT NULL,
          roomid VARCHAR(255) NOT NULL,
          liveStatus VARCHAR(255) NOT NULL,
          createTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updateTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      
      // 确保 watch 表存在
      await db.execute(`
        CREATE TABLE IF NOT EXISTS watch (
          id INT AUTO_INCREMENT PRIMARY KEY,
          chatid VARCHAR(255) NOT NULL,
          mid VARCHAR(255) NOT NULL,
          createTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_chatid_mid (chatid, mid)
        )
      `);
      
      // 获取主播列表，并检查每个主播的关注状态（只考虑未禁用的关注）
      const [vtbs] = await db.execute(`
        SELECT v.*, 
               CASE WHEN w.id IS NOT NULL AND w.disabled = 0 THEN 1 ELSE 0 END as isFollowing
        FROM vtbs v
        LEFT JOIN watch w ON v.mid = w.mid AND w.chatid = ?
        WHERE v.liveStatus != '0' AND v.liveStatus != '1'
        LIMIT 10
      `, [groupId]);
      
      res.status(200).json(vtbs);
    } catch (error) {
      res.status(500).json({ message: '获取主播列表失败', error: error.message });
    }
  });

  // 关注/取消关注主播
  router.post('/groups/:groupId/vtbs/:mid/follow', authenticateToken, async (req, res) => {
    try {
      const db = require('../config/db');
      const { groupId, mid } = req.params;
      const { follow } = req.body;
      
      if (follow) {
        // 关注主播
        try {
          await db.execute('INSERT INTO watch (chatid, mid) VALUES (?, ?)', [groupId, mid]);
          res.status(200).json({ success: true, message: '已关注主播' });
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ success: false, message: '已经关注过该主播' });
          } else {
            res.status(500).json({ message: '关注主播失败', error: error.message });
          }
        }
      } else {
        // 取消关注主播
        const [result] = await db.execute('DELETE FROM watch WHERE chatid = ? AND mid = ?', [groupId, mid]);
        if (result.affectedRows === 0) {
          return res.status(404).json({ message: '未关注该主播' });
        }
        res.status(200).json({ success: true, message: '已取消关注主播' });
      }
    } catch (error) {
      res.status(500).json({ message: '操作失败', error: error.message });
    }
  });
  
  // 清理消息内容，移除可能导致 Telegram API 错误的内容
  function cleanMessageContent(content) {
    if (!content) return content;
    // 移除无效的 tg://emoji 和 tg://time URL
    let cleaned = content.replace(/tg:\/\/(emoji|time)[^\s]+/g, '');
    
    // 移除不支持的 HTML 标签
    cleaned = cleaned.replace(/<br>/g, '\n');
    cleaned = cleaned.replace(/<br\s*\/>/g, '\n');
    // 移除 <img> 标签，因为 Telegram API 不支持在文本消息中直接使用
    cleaned = cleaned.replace(/<img[^>]*>/g, '');
    
    // 处理列表格式
    // 替换 <ul> 和 <ol> 标签为换行
    cleaned = cleaned.replace(/<ul>/g, '\n');
    cleaned = cleaned.replace(/<\/ul>/g, '\n');
    cleaned = cleaned.replace(/<ol>/g, '\n');
    cleaned = cleaned.replace(/<\/ol>/g, '\n');
    // 替换 <li> 标签为 - 
    cleaned = cleaned.replace(/<li>/g, '- ');
    cleaned = cleaned.replace(/<\/li>/g, '\n');
    
    // 处理列表格式
    // 移除列表项之间的多余空行
    cleaned = cleaned.replace(/(- .+)\s*\n\s*\n/g, '$1\n');
    // 确保列表项前面只有一个空格
    cleaned = cleaned.replace(/(-\s+)/g, '- ');
    // 确保列表项在单独的一行上
    cleaned = cleaned.replace(/([^\n])- /g, '$1\n- ');
    
    return cleaned;
  }

  // 发布消息到群组
  router.post('/groups/:groupId/message', authenticateToken, async (req, res) => {
    try {
      const { type = 'text', text, mediaUrl, caption } = req.body;
    const { groupId } = req.params;
    const { get$ } = require('../../bots/livebot/bot');
    const $ = get$();
    
    if (type === 'text' && !text) {
      return res.status(400).json({ message: '消息内容不能为空' });
    }
    
    if (['photo', 'video', 'audio', 'document'].includes(type) && !mediaUrl) {
      return res.status(400).json({ message: '媒体URL不能为空' });
    }
    
    // 清理消息内容，移除可能导致 Telegram API 错误的内容
    const cleanedText = cleanMessageContent(text);
    const cleanedCaption = cleanMessageContent(caption);
    
    // 固定使用 HTML 格式
    const parseMode = 'HTML';
      
      // 根据消息类型发送不同类型的消息
      let result;
      switch (type) {
        case 'text':
          result = await $.bot.sendMessage(groupId, cleanedText, { parse_mode: parseMode });
          break;
        case 'photo':
          result = await $.bot.sendPhoto(groupId, mediaUrl, { caption: cleanedCaption, parse_mode: parseMode });
          break;
        case 'video':
          result = await $.bot.sendVideo(groupId, mediaUrl, { caption: cleanedCaption, parse_mode: parseMode });
          break;
        case 'audio':
          result = await $.bot.sendAudio(groupId, mediaUrl, { caption: cleanedCaption, parse_mode: parseMode });
          break;
        case 'document':
          result = await $.bot.sendDocument(groupId, mediaUrl, { caption: cleanedCaption, parse_mode: parseMode });
          break;
        default:
          return res.status(400).json({ message: '不支持的消息类型' });
      }
      
      res.status(200).json({ message: '消息发送成功', result });
    } catch (error) {
      if (error.message.includes('Telegram Bot Token not provided!') || error.message.includes('bot is not defined') || error.message.includes('getChatMembersCount is not a function')) {
        res.status(500).json({ message: '发送消息失败', error: '机器人没有启动，请先启动机器人' });
      } else {
        res.status(500).json({ message: '发送消息失败', error: error.message });
      }
    }
  });
  
  // 禁言群成员
  router.post('/groups/:groupId/mute', authenticateToken, async (req, res) => {
    try {
      const { userId, until_date } = req.body;
      const { groupId } = req.params;
      const { get$ } = require('../../bots/livebot/bot');
      const $ = get$();
      
      if (!userId) {
        return res.status(400).json({ message: '用户ID不能为空' });
      }
      
      // 禁言用户（until_date 为禁言结束时间的Unix时间戳，单位秒）
      await $.bot.restrictChatMember(groupId, userId, {
        until_date: until_date || Math.floor(Date.now() / 1000) + 3600, // 默认禁言1小时
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false
      });
      
      res.status(200).json({ message: '用户已禁言' });
    } catch (error) {
      if (error.message.includes('Telegram Bot Token not provided!') || error.message.includes('bot is not defined') || error.message.includes('getChatMembersCount is not a function')) {
        res.status(500).json({ message: '禁言失败', error: '机器人没有启动，请先启动机器人' });
      } else {
        res.status(500).json({ message: '禁言失败', error: error.message });
      }
    }
  });
  
  // 解除禁言
  router.post('/groups/:groupId/unmute', authenticateToken, async (req, res) => {
    try {
      const { userId } = req.body;
      const { groupId } = req.params;
      const { get$ } = require('../../bots/livebot/bot');
      const $ = get$();
      
      if (!userId) {
        return res.status(400).json({ message: '用户ID不能为空' });
      }
      
      // 解除禁言
      await $.bot.restrictChatMember(groupId, userId, {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false
      });
      
      res.status(200).json({ message: '用户已解除禁言' });
    } catch (error) {
      if (error.message.includes('Telegram Bot Token not provided!') || error.message.includes('bot is not defined') || error.message.includes('getChatMembersCount is not a function')) {
        res.status(500).json({ message: '解除禁言失败', error: '机器人没有启动，请先启动机器人' });
      } else {
        res.status(500).json({ message: '解除禁言失败', error: error.message });
      }
    }
  });
  
  // 踢人
  router.post('/groups/:groupId/kick', authenticateToken, async (req, res) => {
    try {
      const { userId } = req.body;
      const { groupId } = req.params;
      const { get$ } = require('../../bots/livebot/bot');
      const $ = get$();
      
      if (!userId) {
        return res.status(400).json({ message: '用户ID不能为空' });
      }
      
      // 踢人
      await $.bot.banChatMember(groupId, userId);
      
      res.status(200).json({ message: '用户已踢出群组' });
    } catch (error) {
      if (error.message.includes('Telegram Bot Token not provided!') || error.message.includes('bot is not defined') || error.message.includes('getChatMembersCount is not a function')) {
        res.status(500).json({ message: '踢人失败', error: '机器人没有启动，请先启动机器人' });
      } else {
        res.status(500).json({ message: '踢人失败', error: error.message });
      }
    }
  });
  
  // 解除封禁
  router.post('/groups/:groupId/unban', authenticateToken, async (req, res) => {
    try {
      const { userId } = req.body;
      const { groupId } = req.params;
      const { get$ } = require('../../bots/livebot/bot');
      const $ = get$();
      
      if (!userId) {
        return res.status(400).json({ message: '用户ID不能为空' });
      }
      
      // 解除封禁
      await $.bot.unbanChatMember(groupId, userId);
      
      res.status(200).json({ message: '用户已解除封禁' });
    } catch (error) {
      if (error.message.includes('Telegram Bot Token not provided!') || error.message.includes('bot is not defined') || error.message.includes('getChatMembersCount is not a function')) {
        res.status(500).json({ message: '解除封禁失败', error: '机器人没有启动，请先启动机器人' });
      } else {
        res.status(500).json({ message: '解除封禁失败', error: error.message });
      }
    }
  });
  

  
  // 获取单个成员信息
  router.get('/groups/:groupId/members/:userId', authenticateToken, async (req, res) => {
    try {
      const { groupId, userId } = req.params;
      const { get$ } = require('../../bots/livebot/bot');
      const $ = get$();
      
      // 获取单个成员信息
      const member = await $.bot.getChatMember(groupId, userId);
      
      res.status(200).json({ member });
    } catch (error) {
      if (error.message.includes('Telegram Bot Token not provided!') || error.message.includes('bot is not defined') || error.message.includes('getChatMembersCount is not a function')) {
        res.status(500).json({ message: '获取成员信息失败', error: '机器人没有启动，请先启动机器人' });
      } else {
        res.status(500).json({ message: '获取成员信息失败', error: error.message });
      }
    }
  });

  // 禁用群组的所有关注
  router.post('/groups/:groupId/watch/disable', authenticateToken, async (req, res) => {
    try {
      const db = require('../config/db');
      const { groupId } = req.params;
      
      // 更新 watch 表，将指定群组的所有关注标记为禁用
      const [result] = await db.execute('UPDATE watch SET disabled = 1 WHERE chatid = ?', [groupId]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '该群组没有关注的主播' });
      }
      
      res.status(200).json({ success: true, message: '已禁用该群组的所有关注' });
    } catch (error) {
      res.status(500).json({ message: '禁用关注失败', error: error.message });
    }
  });

  // 获取启动记录
  router.get('/startup-records', authenticateToken, async (req, res) => {
    try {
      const db = require('../config/db');
      
      // 确保 startup_records 表存在
      await db.execute(`
        CREATE TABLE IF NOT EXISTS startup_records (
          id INT AUTO_INCREMENT PRIMARY KEY,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          success BOOLEAN NOT NULL,
          error TEXT,
          createdBy VARCHAR(255),
          environment VARCHAR(255),
          appName VARCHAR(255),
          proxy VARCHAR(255)
        )
      `);
      
      // 获取启动记录
      const [records] = await db.execute(
        'SELECT id, timestamp, success, error, createdBy, environment, appName, proxy FROM startup_records ORDER BY timestamp DESC LIMIT 50'
      );
      
      res.status(200).json({ records });
    } catch (error) {
      res.status(500).json({ message: '获取启动记录失败', error: error.message });
    }
  });

  // BotGuard 相关路由

  // 获取 BotGuard 状态
  router.get('/botguard/status', authenticateToken, async (req, res) => {
    try {
      const { getBotGuard } = require('../services/bot/bot-guard');
      const botGuard = getBotGuard();
      const status = botGuard.getStatus();
      res.status(200).json(status);
    } catch (error) {
      console.error('获取 BotGuard 状态失败:', error);
      console.error('错误堆栈:', error.stack);
      res.status(500).json({ message: '获取 BotGuard 状态失败', error: error.message });
    }
  });

  // 手动触发重启
  router.post('/botguard/restart', authenticateToken, verifyAdmin, async (req, res) => {
    try {
      const { getBotGuard } = require('../services/bot/bot-guard');
      const botGuard = getBotGuard();
      
      await botGuard.attemptRestartAll();
      
      res.status(200).json({ success: true, message: '已触发自动重启' });
    } catch (error) {
      res.status(500).json({ message: '触发重启失败', error: error.message });
    }
  });

module.exports = router;