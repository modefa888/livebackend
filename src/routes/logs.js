const express = require('express');
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// 中间件：验证JWT令牌
const authenticateToken = async (req, res, next) => {
  // 支持从URL参数或Authorization头获取token
  let token = req.query.token || req.headers.authorization?.split(' ')[1];
  
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

// 获取直播历史记录
router.get('/live-history', authenticateToken, async (req, res) => {
  try {
    // 从req.user中获取用户ID并转换为整数
    const userId = parseInt(req.user.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ message: '用户ID不存在' });
    }
    
    // 检查用户权限
    const isAdmin = req.user.permissionLevel === 2 || req.user.permissionLevel === 3;
    
    let query, params;
    
    if (isAdmin) {
      // 管理员或超级管理员可以查看所有主播的直播记录
      query = `
        SELECT lh.* 
        FROM liveHistory lh
        ORDER BY lh.id DESC
        LIMIT 100
      `;
      params = [];
    } else {
      // 普通用户只能查看关注的主播的直播记录
      query = `
        SELECT lh.* 
        FROM liveHistory lh
        JOIN watch w ON lh.username = w.mid
        WHERE w.chatid = ?
        ORDER BY lh.id DESC
        LIMIT 100
      `;
      params = [userId];
    }
    
    const [history] = await db.execute(query, params);
    
    res.status(200).json({
      data: history,
      isAdmin: isAdmin
    });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取直播历史错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取直播历史错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取所有主播直播历史记录（仅管理员和超级管理员）
router.get('/live-history/all', authenticateToken, async (req, res) => {
  try {
    // 检查用户权限
    if (req.user.permissionLevel !== 2 && req.user.permissionLevel !== 3) {
      return res.status(403).json({ message: '权限不足' });
    }
    
    // 查询所有主播的直播记录
    const [history] = await db.execute(`
      SELECT lh.* 
      FROM liveHistory lh
      ORDER BY lh.id DESC
      LIMIT 100
    `);
    
    res.status(200).json({
      data: history,
      isAdmin: true
    });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取所有主播直播历史错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取所有主播直播历史错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取发送记录
router.get('/sends', authenticateToken, async (req, res) => {
  try {
    const [sends] = await db.execute('SELECT * FROM livebot_sends ORDER BY id DESC LIMIT 100');
    res.status(200).json(sends);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取发送记录错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取发送记录错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取消息记录
router.get('/messages', authenticateToken, async (req, res) => {
  try {
    const { keyword, type } = req.query;
    let query = 'SELECT * FROM messages';
    const conditions = [];
    const params = [];

    // 添加关键字搜索条件（搜索标题和文件名）
    if (keyword) {
      conditions.push('(caption LIKE ? OR fileName LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    // 添加类型筛选条件
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    // 如果有条件，添加 WHERE 子句
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY id DESC LIMIT 100';

    const [messages] = await db.execute(query, params);
    res.status(200).json(messages);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取消息记录错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取消息记录错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取日志文件列表
router.get('/files', authenticateToken, async (req, res) => {
  try {
    const { type = 'backend', bot = 'livebot' } = req.query;
    
    console.log('日志文件列表请求:', { type, bot, cwd: process.cwd() });
    
    let logDir;
    if (type === 'bot') {
      logDir = path.join(process.cwd(), 'bots', bot, 'log');
    } else {
      logDir = path.join(process.cwd(), 'log');
    }
    
    console.log('日志目录:', logDir);
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const files = fs.readdirSync(logDir).filter(file => file.endsWith('.log'));
    console.log('找到的日志文件:', files);
    res.status(200).json(files);
  } catch (error) {
    console.error('获取日志文件列表错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取日志文件内容
router.get('/files/:filename', authenticateToken, async (req, res) => {
  const { filename } = req.params;
  const { type = 'backend', bot = 'livebot' } = req.query;
  
  try {
    let logPath;
    if (type === 'bot') {
      logPath = path.join(process.cwd(), 'bots', bot, 'log', filename);
    } else {
      logPath = path.join(process.cwd(), 'log', filename);
    }
    
    if (!fs.existsSync(logPath)) {
      return res.status(404).json({ message: '日志文件不存在' });
    }
    
    const content = fs.readFileSync(logPath, 'utf8');
    res.status(200).json({ content });
  } catch (error) {
    console.error('获取日志文件内容错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取统计数据
  router.get('/stats', authenticateToken, async (req, res) => {
    try {
      // 获取用户信息，检查权限级别
      const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [req.user.id]);
      const user = users[0];
      const permissionLevel = user ? user.permissionLevel : 1;
      
      // 测试数据库连接状态
      let mysqlStatus = '正常';
      try {
        await db.execute('SELECT 1');
      } catch (err) {
        mysqlStatus = '异常';
        console.error('数据库连接状态检查失败:', err);
      }
      
      // 获取主播数量
      const [vtbsCount] = await db.execute('SELECT COUNT(*) as count FROM vtbs');
      
      // 获取今日直播次数（如果失败，返回0）
      let todayLiveCount = [{ count: 0 }];
      try {
        const today = new Date().toISOString().split('T')[0];
        const [result] = await db.execute(
          'SELECT COUNT(*) as count FROM liveHistory WHERE DATE(updatedAt) = ?',
          [today]
        );
        todayLiveCount = result;
      } catch (err) {
        console.error('获取今日直播次数错误:', err);
      }
      
      // 获取机器人群组数量
      let groupsCount = [{ count: 0 }];
      try {
        const [result] = await db.execute('SELECT COUNT(*) as count FROM bot_groups');
        groupsCount = result;
      } catch (err) {
        console.error('获取群组数量错误:', err);
      }
      
      // 普通用户只返回基本字段
      if (permissionLevel === 1) {
        return res.status(200).json({
          vtbsCount: vtbsCount[0].count,
          todayLiveCount: todayLiveCount[0].count,
          groupsCount: groupsCount[0].count,
          usersCount: 1,
          settingsCount: 0,
          todayMessageCount: 0,
          systemLogsCount: 0,
          monitorLogsCount: 0,
          operationLogsCount: 0,
          mysqlStatus: mysqlStatus,
          requestCount: 0,
          timestamp: new Date().toISOString(),
          version: require('../../package.json').version
        });
      }
      
      // 管理员和超级管理员返回所有字段
      // 获取设置数量
      const [settingsCount] = await db.execute('SELECT COUNT(*) as count FROM bot_settings');
      
      // 获取用户数量
      const [usersCount] = await db.execute('SELECT COUNT(*) as count FROM users');
      
      // 获取今日消息发送数量
      let todayMessageCount = [{ count: 0 }];
      try {
        const today = new Date().toISOString().split('T')[0];
        const [result] = await db.execute(
          'SELECT COUNT(*) as count FROM livebot_sends WHERE DATE(timestamp) = ?',
          [today]
        );
        todayMessageCount = result;
      } catch (err) {
        console.error('获取今日消息发送数量错误:', err);
      }
      
      // 获取系统日志数量
      let systemLogsCount = [{ count: 0 }];
      try {
        const [result] = await db.execute('SELECT COUNT(*) as count FROM system_logs');
        systemLogsCount = result;
      } catch (err) {
        console.error('获取系统日志数量错误:', err);
      }
      
      // 获取监控日志数量
      let monitorLogsCount = [{ count: 0 }];
      try {
        const [result] = await db.execute('SELECT COUNT(*) as count FROM monitor_logs');
        monitorLogsCount = result;
      } catch (err) {
        console.error('获取监控日志数量错误:', err);
      }
      
      // 获取操作日志数量
      let operationLogsCount = [{ count: 0 }];
      try {
        const [result] = await db.execute('SELECT COUNT(*) as count FROM operation_logs');
        operationLogsCount = result;
      } catch (err) {
        console.error('获取操作日志数量错误:', err);
      }
      
      res.status(200).json({
        vtbsCount: vtbsCount[0].count,
        todayLiveCount: todayLiveCount[0].count,
        settingsCount: settingsCount[0].count,
        usersCount: usersCount[0].count,
        groupsCount: groupsCount[0].count,
        todayMessageCount: todayMessageCount[0].count,
        systemLogsCount: systemLogsCount[0].count,
        monitorLogsCount: monitorLogsCount[0].count,
        operationLogsCount: operationLogsCount[0].count,
        mysqlStatus: mysqlStatus,
        requestCount: req.requestCount || 0,
        timestamp: new Date().toISOString(),
        version: require('../../package.json').version
      });
    } catch (error) {
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        console.error('获取统计数据错误: 数据库连接超时');
        res.status(500).json({ message: '数据库连接超时，请稍后再试' });
      } else {
        console.error('获取统计数据错误:', error.message);
        res.status(500).json({ message: '服务器内部错误' });
      }
    }
  });

// 清理日志
router.delete('/clean', authenticateToken, async (req, res) => {
  try {
    // 清理数据库中的日志记录
    await db.execute('TRUNCATE TABLE liveHistory');
    await db.execute('TRUNCATE TABLE livebot_sends');
    await db.execute('TRUNCATE TABLE messages');
    await db.execute('TRUNCATE TABLE monitor_logs');
    await db.execute('TRUNCATE TABLE system_logs');
    
    // 清理日志文件
    const logDir = path.join(__dirname, '../../log');
    if (fs.existsSync(logDir)) {
      const files = fs.readdirSync(logDir);
      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(logDir, file);
          fs.unlinkSync(filePath);
        }
      }
    }
    
    res.status(200).json({ message: '日志清理成功' });
  } catch (error) {
    console.error('清理日志错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 实时日志存储
const logBuffer = [];
const MAX_LOG_BUFFER = 100;

// 保存原始的console方法
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

// 重写console方法来捕获日志
const logTypeMapping = {
  log: 'info',
  error: 'error',
  warn: 'warn',
  info: 'info'
};

Object.keys(originalConsole).forEach(method => {
  console[method] = function(...args) {
    // 调用原始方法
    originalConsole[method].apply(console, args);
    
    // 捕获日志
    try {
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      const logEntry = {
        type: 'backend',
        level: logTypeMapping[method] || 'info',
        content: message,
        timestamp: new Date().toISOString()
      };
      
      logBuffer.push(logEntry);
      if (logBuffer.length > MAX_LOG_BUFFER) {
        logBuffer.shift();
      }
    } catch (e) {
      // 忽略错误
    }
  };
});

// 实时日志订阅 - 使用SSE (Server-Sent Events)
router.get('/realtime', authenticateToken, (req, res) => {
  // 设置响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // 发送初始连接消息
  res.write(`data: ${JSON.stringify({ type: 'connected', message: '实时日志连接成功', timestamp: new Date().toISOString() })}\n\n`);
  
  // 发送已有日志
  logBuffer.forEach(log => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  });
  
  let lastSentIndex = logBuffer.length;
  
  // 定期检查新日志 (每1秒)
  const interval = setInterval(() => {
    while (lastSentIndex < logBuffer.length) {
      res.write(`data: ${JSON.stringify(logBuffer[lastSentIndex])}\n\n`);
      lastSentIndex++;
    }
  }, 1000);
  
  // 当客户端断开连接时清理
  req.on('close', () => {
    clearInterval(interval);
  });
});

module.exports = router;