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

// 记录操作日志
const logOperation = async (req, operationType, targetType, targetId, targetName, details = '') => {
  console.log('进入 logOperation 函数:', operationType, targetType, targetId, targetName, details);
  
  if (!req.user) {
    console.error('logOperation: req.user 不存在');
    return;
  }
  
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  
  console.log('准备插入操作日志:', req.user.id, req.user.username, operationType, targetType, targetId, targetName, ip, userAgent, details);
  
  try {
    const result = await db.execute(
      'INSERT INTO operation_logs (userId, username, operationType, targetType, targetId, targetName, ip, userAgent, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, req.user.username, operationType, targetType, targetId, targetName, ip, userAgent, details]
    );
    console.log('插入操作日志成功:', result);
  } catch (error) {
    console.error('记录操作日志失败:', error);
  }
};

// 获取操作日志列表（仅管理员）
router.get('/', authenticateToken, authorizeAdmin, async (req, res) => {
  const { page = 1, limit = 10, operationType, targetType, username } = req.query;
  const offset = (page - 1) * limit;

  try {
    // 构建查询条件
    let whereClause = [];
    let queryParams = [];

    if (operationType) {
      whereClause.push('operationType = ?');
      queryParams.push(operationType);
    }

    if (targetType) {
      whereClause.push('targetType = ?');
      queryParams.push(targetType);
    }

    if (username) {
      whereClause.push('username LIKE ?');
      queryParams.push(`%${username}%`);
    }

    const whereSql = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

    // 查询操作日志
    const [logs] = await db.execute(
      `SELECT id, userId, username, operationType, targetType, targetId, targetName, ip, userAgent, operationTime, details FROM operation_logs ${whereSql} ORDER BY operationTime DESC LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    // 查询总数
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM operation_logs ${whereSql}`,
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
      console.error('获取操作日志错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取操作日志错误:', error);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取当前用户的操作日志
router.get('/me', authenticateToken, async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    // 查询当前用户的操作日志
    const [logs] = await db.execute(
      `SELECT id, userId, username, operationType, targetType, targetId, targetName, ip, userAgent, operationTime, details FROM operation_logs WHERE username = ? ORDER BY operationTime DESC LIMIT ? OFFSET ?`,
      [req.user.username, parseInt(limit), parseInt(offset)]
    );

    // 查询总数
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM operation_logs WHERE username = ?`,
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
      console.error('获取操作日志错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取操作日志错误:', error);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 导出记录操作日志的函数
module.exports = { router, logOperation };