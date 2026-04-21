const express = require('express');
const db = require('../config/db');
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

// 中间件：验证管理员权限（管理员 permissionLevel = 2，超级管理员 permissionLevel = 3）
const authorizeAdmin = (req, res, next) => {
  if (req.user.permissionLevel < 2) {
    return res.status(403).json({ message: '权限不足' });
  }
  next();
};

// 获取登录日志列表（仅管理员）
router.get('/', authenticateToken, authorizeAdmin, async (req, res) => {
  const { page = 1, limit = 10, username, status } = req.query;
  const offset = (page - 1) * limit;

  try {
    // 构建查询条件
    let whereClause = [];
    let queryParams = [];

    if (username) {
      whereClause.push('username LIKE ?');
      queryParams.push(`%${username}%`);
    }

    if (status !== undefined) {
      whereClause.push('status = ?');
      queryParams.push(status);
    }

    const whereSql = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

    // 查询登录日志
    const [logs] = await db.execute(
      `SELECT id, userId, username, ip, userAgent, loginTime, status FROM login_logs ${whereSql} ORDER BY loginTime DESC LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    // 查询总数
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM login_logs ${whereSql}`,
      queryParams
    );

    res.status(200).json({
      logs,
      pagination: {
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取登录日志错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取登录日志错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取当前用户的登录日志
router.get('/me', authenticateToken, async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    // 查询当前用户的登录日志
    const [logs] = await db.execute(
      `SELECT id, userId, username, ip, userAgent, loginTime, status FROM login_logs WHERE username = ? ORDER BY loginTime DESC LIMIT ? OFFSET ?`,
      [req.user.username, parseInt(limit), parseInt(offset)]
    );

    // 查询总数
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM login_logs WHERE username = ?`,
      [req.user.username]
    );

    res.status(200).json({
      logs,
      pagination: {
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取登录日志错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取登录日志错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

module.exports = router;