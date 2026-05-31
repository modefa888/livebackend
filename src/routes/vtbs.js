const express = require('express');
const db = require('../config/db');
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

// 获取所有主播
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { keyword, category } = req.query;
    let query = 'SELECT * FROM vtbs';
    const conditions = [];
    const params = [];

    // 添加关键字搜索条件（搜索名称和房间号）
    if (keyword) {
      conditions.push('(username LIKE ? OR roomid LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    // 添加分类筛选条件
    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    // 如果有条件，添加 WHERE 子句
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY id DESC';

    const [vtbs] = await db.execute(query, params);
    res.status(200).json(vtbs);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取主播列表错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取主播列表错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取单个主播
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const [vtbs] = await db.execute('SELECT * FROM vtbs WHERE id = ?', [id]);
    
    if (vtbs.length === 0) {
      return res.status(404).json({ message: '主播不存在' });
    }
    
    res.status(200).json(vtbs[0]);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取主播详情错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取主播详情错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 添加主播
router.post('/', authenticateToken, async (req, res) => {
  const { username, roomid, site, category, targetUrl } = req.body;
  
  try {
    // 插入主播数据
    const [result] = await db.execute(
      'INSERT INTO vtbs (username, roomid, site, category, targetUrl) VALUES (?, ?, ?, ?, ?)',
      [username, roomid, site, category, targetUrl]
    );
    
    // 记录操作日志
    await logOperation(req, 'add', 'vtb', result.insertId, username, `添加主播: ${username}, 房间号: ${roomid}, 平台: ${site}`);
    
    res.status(201).json({ message: '主播添加成功' });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('添加主播错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('添加主播错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 更新主播
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { username, roomid, site, category, targetUrl } = req.body;
  
  try {
    // 先获取原主播信息
    const [originalVtbs] = await db.execute('SELECT username FROM vtbs WHERE id = ?', [id]);
    if (originalVtbs.length === 0) {
      return res.status(404).json({ message: '主播不存在' });
    }
    const originalUsername = originalVtbs[0].username;
    
    // 更新主播数据
    const [result] = await db.execute(
      'UPDATE vtbs SET username = ?, roomid = ?, site = ?, category = ?, targetUrl = ? WHERE id = ?',
      [username, roomid, site, category, targetUrl, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '主播不存在' });
    }
    
    // 记录操作日志
    await logOperation(req, 'update', '主播', id, username, `更新主播: ${originalUsername} → ${username}, 房间号: ${roomid}, 平台: ${site}`);
    
    res.status(200).json({ message: '主播更新成功' });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('更新主播错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('更新主播错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 删除主播
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    // 先获取主播信息
    const [vtbs] = await db.execute('SELECT username FROM vtbs WHERE id = ?', [id]);
    if (vtbs.length === 0) {
      return res.status(404).json({ message: '主播不存在' });
    }
    const username = vtbs[0].username;
    
    // 删除主播数据
    const [result] = await db.execute('DELETE FROM vtbs WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '主播不存在' });
    }
    
    // 记录操作日志
    await logOperation(req, 'delete', '主播', id, username, `删除主播: ${username}`);
    
    res.status(200).json({ message: '主播删除成功' });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('删除主播错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('删除主播错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 搜索主播
router.get('/search/:keyword', authenticateToken, async (req, res) => {
  const { keyword } = req.params;
  
  try {
    const [vtbs] = await db.execute(
      'SELECT * FROM vtbs WHERE username LIKE ? OR roomid LIKE ?',
      [`%${keyword}%`, `%${keyword}%`]
    );
    
    res.status(200).json(vtbs);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('搜索主播错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('搜索主播错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取用户关注的主播列表
router.get('/user/followed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { liveStatus } = req.query;
    
    // 先获取用户的userId（在users表中）
    const [users] = await db.execute('SELECT userId FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    const chatId = users[0].userId;
    let query = 'SELECT v.* FROM vtbs v JOIN watch w ON v.mid = w.mid WHERE w.chatid = ? AND w.disabled = 0';
    const params = [chatId];
    
    // 添加liveStatus过滤条件
    if (liveStatus !== undefined) {
      query += ' AND v.liveStatus = ?';
      params.push(liveStatus.toString());
    }
    
    // 连接watch表和vtbs表，查询用户关注的主播
    const [vtbs] = await db.execute(query, params);
    
    res.status(200).json(vtbs);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取用户关注的主播列表错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取用户关注的主播列表错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

module.exports = router;