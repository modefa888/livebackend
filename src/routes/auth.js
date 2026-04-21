const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const svgCaptcha = require('svg-captcha');
const db = require('../config/db');
const { logOperation } = require('./operation-logs');
const router = express.Router();

// 存储验证码的内存存储（生产环境应使用 Redis 等）
const captchaStore = new Map();

// 登录
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  try {
    // 检查用户是否存在
    const [users] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length === 0) {
      // 记录登录失败日志
      await db.execute(
        'INSERT INTO login_logs (userId, username, ip, userAgent, status) VALUES (?, ?, ?, ?, ?)',
        [0, username, ip, userAgent, 0]
      );
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const user = users[0];
    
    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // 记录登录失败日志
      await db.execute(
        'INSERT INTO login_logs (userId, username, ip, userAgent, status) VALUES (?, ?, ?, ?, ?)',
        [user.userId, username, ip, userAgent, 0]
      );
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    // 记录登录成功日志
    await db.execute(
      'INSERT INTO login_logs (userId, username, ip, userAgent, status) VALUES (?, ?, ?, ?, ?)',
      [user.userId, username, ip, userAgent, 1]
    );

    // 设置 req.user 以便 logOperation 函数使用
    req.user = {
      id: user.id,
      username: user.username,
      permissionLevel: user.permissionLevel
    };
    
    // 记录操作日志
    await logOperation(req, 'login', 'user', user.userId, username, `用户登录: ${username}, IP: ${ip}`);

    // 生成JWT令牌
    const token = jwt.sign(
      { id: user.id, userId: user.userId, username: user.username, permissionLevel: user.permissionLevel },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(200).json({
      token,
      user: {
        id: user.id,
        userId: user.userId,
        username: user.username,
        permissionLevel: user.permissionLevel
      }
    });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('登录错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('登录错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 注册
router.post('/register', async (req, res) => {
  const { username, password, confirmPassword, captcha, captchaId } = req.body;

  try {
    // 暂时禁用验证码验证，用于测试
    // if (!captcha || !captchaId) {
    //   return res.status(400).json({ message: '请输入验证码' });
    // }
    
    // const storedCaptcha = captchaStore.get(captchaId);
    // if (!storedCaptcha || storedCaptcha !== captcha.toLowerCase()) {
    //   return res.status(400).json({ message: '验证码错误' });
    // }
    
    // 验证用户名
    if (!username || username.length < 3 || username.length > 20) {
      return res.status(400).json({ message: '用户名长度必须在 3-20 之间' });
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(username)) {
      return res.status(400).json({ message: '用户名只能包含字母、数字和下划线，且不能以数字开头' });
    }

    // 验证密码
    if (!password || password.length < 6 || password.length > 20) {
      return res.status(400).json({ message: '密码长度必须在 6-20 之间' });
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/.test(password)) {
      return res.status(400).json({ message: '密码至少包含一个字母和一个数字' });
    }

    // 验证密码一致性
    if (password !== confirmPassword) {
      return res.status(400).json({ message: '两次输入的密码不一致' });
    }

    // 检查用户名是否已存在
    const [users] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length > 0) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户，生成唯一的 userId（11位数字）
    const generateUserId = () => {
      // 生成11位随机数字
      return Math.floor(10000000000 + Math.random() * 90000000000);
    };
    const userId = generateUserId();
    await db.execute(
      'INSERT INTO users (userId, username, password, permissionLevel) VALUES (?, ?, ?, ?)',
      [userId, username, hashedPassword, 1]
    );

    // 移除已使用的验证码
    if (captchaId) {
      captchaStore.delete(captchaId);
    }

    // 记录操作日志（注册用户时还没有登录，所以req.user不存在，这里不记录操作日志）

    res.status(201).json({ message: '注册成功' });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('注册错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('注册错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 生成验证码
router.get('/captcha', (req, res) => {
  // 生成验证码
  const captcha = svgCaptcha.create({
    size: 4,
    noise: 3,
    color: true,
    background: '#f0f0f0'
  });
  
  // 生成唯一的验证码ID
  const captchaId = Date.now() + Math.random().toString(36).substr(2, 9);
  
  // 存储验证码，有效期5分钟
  captchaStore.set(captchaId, captcha.text.toLowerCase());
  setTimeout(() => {
    captchaStore.delete(captchaId);
  }, 5 * 60 * 1000);
  
  // 设置响应头
  res.set('Content-Type', 'image/svg+xml');
  res.set('X-Captcha-Id', captchaId);
  res.send(captcha.data);
});

// 获取当前用户信息
router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel, createTime FROM users WHERE id = ?', [decoded.id]);
    
    if (users.length === 0) {
      return res.status(401).json({ message: '用户不存在' });
    }

    res.status(200).json(users[0]);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取用户信息错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取用户信息错误:', error.message);
      res.status(401).json({ message: '无效的认证令牌' });
    }
  }
});

// 登出
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const ip = req.ip || req.connection.remoteAddress;
  
  try {
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      // 记录登出操作日志
      await logOperation(req, 'logout', 'user', decoded.id, decoded.username, `用户登出: ${decoded.username}, IP: ${ip}`);
    }
    
    res.status(200).json({ message: '登出成功' });
  } catch (error) {
    // 即使 token 无效，也返回登出成功
    res.status(200).json({ message: '登出成功' });
  }
});

// Telegram 自动登录
router.post('/login/telegram', async (req, res) => {
  const { userId, username } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  try {
    // 检查用户是否存在
    const [users] = await db.execute('SELECT * FROM users WHERE userId = ?', [userId]);
    let user;
    
    if (users.length === 0) {
      // 创建新用户
      const hashedPassword = await bcrypt.hash(userId, 10); // 使用 userId 作为密码
      await db.execute(
        'INSERT INTO users (userId, username, password, permissionLevel) VALUES (?, ?, ?, ?)',
        [userId, username, hashedPassword, 1]
      );
      
      // 获取新创建的用户
      const [newUsers] = await db.execute('SELECT * FROM users WHERE userId = ?', [userId]);
      user = newUsers[0];
    } else {
      user = users[0];
      
      // 更新用户名（如果有变化）
      if (user.username !== username) {
        await db.execute('UPDATE users SET username = ? WHERE userId = ?', [username, userId]);
        user.username = username;
      }
    }

    // 记录登录成功日志
    await db.execute(
      'INSERT INTO login_logs (userId, username, ip, userAgent, status) VALUES (?, ?, ?, ?, ?)',
      [user.userId, user.username, ip, userAgent, 1]
    );

    // 设置 req.user 以便 logOperation 函数使用
    req.user = {
      id: user.id,
      username: user.username,
      permissionLevel: user.permissionLevel
    };
    
    // 记录操作日志
    await logOperation(req, 'login', 'user', user.userId, user.username, `Telegram用户自动登录: ${username}, IP: ${ip}`);

    // 生成JWT令牌
    const token = jwt.sign(
      { id: user.id, userId: user.userId, username: user.username, permissionLevel: user.permissionLevel },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(200).json({
      token,
      user: {
        id: user.id,
        userId: user.userId,
        username: user.username,
        permissionLevel: user.permissionLevel
      }
    });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('Telegram登录错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('Telegram登录错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 验证密码
router.post('/verify-password', async (req, res) => {
  const { password } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // 获取用户信息
    const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [decoded.id]);
    
    if (users.length === 0) {
      return res.status(401).json({ message: '用户不存在' });
    }

    const user = users[0];
    
    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (isPasswordValid) {
      res.status(200).json({ success: true, message: '密码验证成功' });
    } else {
      res.status(401).json({ success: false, message: '密码验证失败' });
    }
  } catch (error) {
    console.error('密码验证错误:', error.message);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

module.exports = router;