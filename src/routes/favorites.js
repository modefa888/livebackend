const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// 验证用户
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: '未授权' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const [users] = await db.execute('SELECT id, userId, username FROM users WHERE id = ?', [decoded.id]);
    
    if (users.length === 0) {
      return res.status(401).json({ error: '用户不存在' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    console.error('认证失败:', error);
    res.status(401).json({ error: '无效的token' });
  }
};

// 添加收藏
router.post('/', authMiddleware, async (req, res) => {
  try {
    const vodData = req.body;
    
    if (!vodData || !vodData.vod_id || !vodData.vod_name) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 检查是否已收藏
    const [existing] = await db.execute(
      'SELECT id FROM fabubot_favorites WHERE user_id = ? AND vod_id = ?',
      [req.user.id, vodData.vod_id || vodData.id]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: '该视频已收藏' });
    }

    // 插入数据
    const [result] = await db.execute(
      `INSERT INTO fabubot_favorites 
       (user_id, vod_id, vod_name, vod_year, vod_type, vod_content, 
        vod_pic, vod_pic_thumb, vod_pic_slide, vod_actor, vod_director, 
        vod_remarks, vod_area, vod_lang, vod_pubdate, vod_play_from, 
        vod_play_url, source_name, source_id, vod_episodes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        vodData.vod_id || vodData.id,
        vodData.vod_name || vodData.title,
        vodData.vod_year || vodData.year,
        vodData.type_name || vodData.type,
        vodData.vod_content || vodData.vod_blurb || vodData.desc,
        vodData.vod_pic || vodData.pic,
        vodData.vod_pic_thumb || vodData.picThumb,
        vodData.vod_pic_slide || vodData.picSlide,
        vodData.vod_actor || vodData.actor,
        vodData.vod_director || vodData.director,
        vodData.vod_remarks || vodData.remarks,
        vodData.vod_area || vodData.area,
        vodData.vod_lang || vodData.lang,
        vodData.vod_pubdate || vodData.pubdate,
        vodData.vod_play_from || vodData.playFrom,
        vodData.vod_play_url || '',
        vodData.sourceName || vodData.source_name,
        vodData.sourceId || vodData.source_id,
        JSON.stringify(vodData.episodes || vodData.vod_episodes || [])
      ]
    );

    res.json({ success: true, id: result.insertId, message: '收藏成功' });
  } catch (error) {
    console.error('添加收藏失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 取消收藏
router.delete('/:vod_id', authMiddleware, async (req, res) => {
  try {
    const { vod_id } = req.params;

    const [result] = await db.execute(
      'DELETE FROM fabubot_favorites WHERE user_id = ? AND vod_id = ?',
      [req.user.id, vod_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '收藏不存在' });
    }

    res.json({ success: true, message: '取消收藏成功' });
  } catch (error) {
    console.error('取消收藏失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取收藏列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    const [favorites] = await db.execute(
      'SELECT * FROM fabubot_favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.user.id, parseInt(pageSize), offset]
    );

    const [countResult] = await db.execute(
      'SELECT COUNT(*) as total FROM fabubot_favorites WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      list: favorites.map(item => ({
        ...item,
        vod_episodes: item.vod_episodes ? JSON.parse(item.vod_episodes) : []
      })),
      total: countResult[0].total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    console.error('获取收藏列表失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 检查是否已收藏
router.get('/check/:vod_id', authMiddleware, async (req, res) => {
  try {
    const { vod_id } = req.params;

    const [favorites] = await db.execute(
      'SELECT id FROM fabubot_favorites WHERE user_id = ? AND vod_id = ?',
      [req.user.id, vod_id]
    );

    res.json({
      success: true,
      isFavorited: favorites.length > 0
    });
  } catch (error) {
    console.error('检查收藏状态失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 清空所有收藏
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM fabubot_favorites WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      message: `已清空 ${result.affectedRows} 个收藏`
    });
  } catch (error) {
    console.error('清空收藏失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = router;
