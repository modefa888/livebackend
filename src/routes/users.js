const express = require('express');
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { logOperation } = require('./operation-logs');
const router = express.Router();

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
const authorizeAdmin = (req, res, next) => {
  // 超级管理员拥有所有权限
  if (req.user.permissionLevel === 3) {
    return next();
  }
  if (req.user.permissionLevel !== 2) {
    return res.status(403).json({ message: '权限不足' });
  }
  next();
};

// 获取所有用户（仅管理员）
router.get('/', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { keyword, permissionLevel } = req.query;
    let query = 'SELECT id, userId, username, type, fromId, role, permissionLevel, createTime FROM users';
    const conditions = [];
    const params = [];

    // 添加关键字搜索条件（搜索用户名、用户ID）
    if (keyword) {
      conditions.push('(username LIKE ? OR userId LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    // 添加权限级别筛选条件
    if (permissionLevel !== undefined) {
      conditions.push('permissionLevel = ?');
      params.push(permissionLevel);
    }

    // 如果有条件，添加 WHERE 子句
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY id DESC';

    const [users] = await db.execute(query, params);
    res.status(200).json(users);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取用户列表错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取用户列表错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取单个用户
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  // 只允许管理员或用户自己查看
  if (req.user.permissionLevel !== 3 && req.user.permissionLevel !== 2 && req.user.id != id) {
    return res.status(403).json({ message: '权限不足' });
  }
  
  try {
    const [users] = await db.execute('SELECT id, userId, username, type, fromId, role, permissionLevel, createTime FROM users WHERE id = ?', [id]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    res.status(200).json(users[0]);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取用户详情错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取用户详情错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 添加用户（仅管理员）
router.post('/', authenticateToken, authorizeAdmin, async (req, res) => {
  const { username, password, permissionLevel, type, fromId, role } = req.body;
  
  try {
    // 检查用户名是否已存在
    const [users] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length > 0) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const userId = Date.now() + Math.floor(Math.random() * 1000);
    await db.execute(
      'INSERT INTO users (userId, username, type, fromId, role, password, permissionLevel) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, username, type || null, fromId || null, role || 'user', hashedPassword, permissionLevel || 1]
    );

    // 记录操作日志
    await logOperation(req, 'add', 'user', userId, username, `添加用户: ${username}, 权限: ${permissionLevel || 1}`);

    res.status(201).json({ message: '用户添加成功' });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('添加用户错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('添加用户错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 更新用户（仅管理员或用户自己）
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { username, password, permissionLevel, type, fromId, role } = req.body;
  
  // 只允许管理员或用户自己更新
  if (req.user.permissionLevel !== 3 && req.user.permissionLevel !== 2 && req.user.id != id) {
    return res.status(403).json({ message: '权限不足' });
  }
  
  // 普通用户不能修改权限级别和其他敏感字段
  if (req.user.permissionLevel !== 3 && req.user.permissionLevel !== 2 && (permissionLevel || type || fromId || role)) {
    return res.status(403).json({ message: '权限不足' });
  }
  
  try {
    // 检查用户是否存在
    const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const originalUser = users[0];
    
    // 不允许非超级管理员拉黑管理员
    if (req.user.permissionLevel !== 3 && originalUser.permissionLevel === 2 && permissionLevel === 0) {
      return res.status(403).json({ message: '不允许拉黑管理员' });
    }

    // 构建更新语句
    let updateFields = [];
    let updateValues = [];

    if (username) {
      updateFields.push('username = ?');
      updateValues.push(username);
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push('password = ?');
      updateValues.push(hashedPassword);
    }

    if (permissionLevel !== undefined && (req.user.permissionLevel === 3 || req.user.permissionLevel === 2)) {
      updateFields.push('permissionLevel = ?');
      updateValues.push(permissionLevel);
    }

    if (type && (req.user.permissionLevel === 3 || req.user.permissionLevel === 2)) {
      updateFields.push('type = ?');
      updateValues.push(type);
    }

    if (fromId && (req.user.permissionLevel === 3 || req.user.permissionLevel === 2)) {
      updateFields.push('fromId = ?');
      updateValues.push(fromId);
    }

    if (role && (req.user.permissionLevel === 3 || req.user.permissionLevel === 2)) {
      updateFields.push('role = ?');
      updateValues.push(role);
    }

    if (updateFields.length === 0) {
      return res.status(200).json({ message: '用户更新成功' });
    }

    updateValues.push(id);

    // 执行更新
    await db.execute(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // 记录操作日志
    const updatedFields = [];
    if (username && username !== originalUser.username) updatedFields.push(`用户名: ${originalUser.username} → ${username}`);
    if (password) updatedFields.push('密码: ******');
    if (permissionLevel && permissionLevel !== originalUser.permissionLevel) updatedFields.push(`权限: ${originalUser.permissionLevel} → ${permissionLevel}`);
    if (type && type !== originalUser.type) updatedFields.push(`类型: ${originalUser.type || '-'} → ${type}`);
    if (fromId && fromId !== originalUser.fromId) updatedFields.push(`来源ID: ${originalUser.fromId || '-'} → ${fromId}`);
    if (role && role !== originalUser.role) updatedFields.push(`角色: ${originalUser.role || '-'} → ${role}`);
    
    if (updatedFields.length > 0) {
      await logOperation(req, 'update', 'user', originalUser.userId, originalUser.username, `更新用户: ${originalUser.username}, ${updatedFields.join(', ')}`);
    }

    res.status(200).json({ message: '用户更新成功' });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('更新用户错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('更新用户错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 删除用户（仅管理员）
router.delete('/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    // 先获取用户信息
    const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
    if (users.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }
    const user = users[0];
    
    // 删除用户
    const [result] = await db.execute('DELETE FROM users WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    // 记录操作日志
    await logOperation(req, 'delete', 'user', user.userId, user.username, `删除用户: ${user.username}, 权限: ${user.permissionLevel}`);
    
    res.status(200).json({ message: '用户删除成功' });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('删除用户错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('删除用户错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 修改当前用户密码
router.put('/me/password', authenticateToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.id;
  
  try {
    // 获取当前用户信息
    const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    const user = users[0];
    
    // 验证旧密码
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: '当前密码错误' });
    }
    
    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // 更新密码
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
    
    // 记录操作日志
    await logOperation(req, 'update', 'user', user.userId, user.username, `修改密码: ${user.username}`);
    
    res.status(200).json({ message: '密码修改成功' });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('修改密码错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('修改密码错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

module.exports = router;