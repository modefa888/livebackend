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

// 获取用户信息（可选认证）
const getOptionalUser = async (req) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return null;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const [users] = await db.execute('SELECT id, userId, username FROM users WHERE id = ?', [decoded.id]);
    
    if (users.length === 0) {
      return null;
    }

    return users[0];
  } catch (error) {
    return null;
  }
};

// 自动创建表
const ensureTableExists = async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS fabubot_favorites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        vod_id VARCHAR(500) NOT NULL,
        vod_name TEXT,
        vod_year VARCHAR(100),
        vod_type VARCHAR(200),
        vod_content TEXT,
        vod_pic TEXT,
        vod_pic_thumb TEXT,
        vod_pic_slide TEXT,
        vod_actor TEXT,
        vod_director TEXT,
        vod_remarks TEXT,
        vod_area VARCHAR(200),
        vod_lang VARCHAR(200),
        vod_pubdate VARCHAR(200),
        vod_play_from VARCHAR(500),
        vod_play_url TEXT,
        source_name TEXT,
        source_id TEXT,
        vod_episodes JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_vod (user_id, vod_id),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('fabubot_favorites 表已确保存在');
    
    // 修改现有表的字段长度
    try {
      await db.execute('ALTER TABLE fabubot_favorites MODIFY COLUMN vod_id VARCHAR(500) NOT NULL');
      await db.execute('ALTER TABLE fabubot_favorites MODIFY COLUMN source_id TEXT');
      await db.execute('ALTER TABLE fabubot_favorites MODIFY COLUMN source_name TEXT');
      await db.execute('ALTER TABLE fabubot_favorites MODIFY COLUMN vod_name TEXT');
      console.log('表字段已更新');
    } catch (alterError) {
      console.log('更新字段时可能已存在，继续执行:', alterError.message);
    }
  } catch (error) {
    console.error('创建表失败:', error);
  }
};

// 初始化时确保表存在
ensureTableExists();

// 添加收藏
router.post('/', async (req, res) => {
  try {
    const user = await getOptionalUser(req);
    if (!user) {
      return res.status(401).json({ error: '请先登录后再收藏' });
    }

    const vodData = req.body;
    console.log('收到的收藏数据:', vodData);
    
    if (!vodData || !vodData.vod_id || !vodData.vod_name) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 检查是否已收藏
    const [existing] = await db.execute(
      'SELECT id FROM fabubot_favorites WHERE user_id = ? AND vod_id = ?',
      [user.id, vodData.vod_id || vodData.id]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: '该视频已收藏' });
    }

    // 辅助函数：截断字符串
    const truncate = (str, maxLen = 500) => {
      if (!str) return null;
      const s = String(str);
      return s.length > maxLen ? s.substring(0, maxLen) : s;
    };

    // 插入数据
    const [result] = await db.execute(
      `INSERT INTO fabubot_favorites 
       (user_id, vod_id, vod_name, vod_year, vod_type, vod_content, 
        vod_pic, vod_pic_thumb, vod_pic_slide, vod_actor, vod_director, 
        vod_remarks, vod_area, vod_lang, vod_pubdate, vod_play_from, 
        vod_play_url, source_name, source_id, vod_episodes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        truncate(vodData.vod_id || vodData.id, 500),
        truncate(vodData.vod_name || vodData.title, 1000),
        truncate(vodData.vod_year || vodData.year, 100),
        truncate(vodData.type_name || vodData.type, 200),
        vodData.vod_content || vodData.vod_blurb || vodData.desc || null,
        vodData.vod_pic || vodData.pic || null,
        vodData.vod_pic_thumb || vodData.picThumb || null,
        vodData.vod_pic_slide || vodData.picSlide || null,
        vodData.vod_actor || vodData.actor || null,
        vodData.vod_director || vodData.director || null,
        vodData.vod_remarks || vodData.remarks || null,
        truncate(vodData.vod_area || vodData.area, 200),
        truncate(vodData.vod_lang || vodData.lang, 200),
        truncate(vodData.vod_pubdate || vodData.pubdate, 200),
        truncate(vodData.vod_play_from || vodData.playFrom, 500),
        vodData.vod_play_url || '',
        vodData.sourceName || vodData.source_name || null,
        vodData.sourceId || vodData.source_id || null,
        JSON.stringify(vodData.episodes || vodData.vod_episodes || [])
      ]
    );

    res.json({ success: true, id: result.insertId, message: '收藏成功' });
  } catch (error) {
    console.error('添加收藏失败:', error);
    res.status(500).json({ error: '服务器内部错误: ' + error.message });
  }
});

// 取消收藏
router.delete('/:vod_id', async (req, res) => {
  try {
    const user = await getOptionalUser(req);
    if (!user) {
      return res.status(401).json({ error: '请先登录' });
    }

    const { vod_id } = req.params;

    const [result] = await db.execute(
      'DELETE FROM fabubot_favorites WHERE user_id = ? AND vod_id = ?',
      [user.id, vod_id]
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
    console.log('获取收藏列表请求, 用户ID:', req.user.id);
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    const [favorites] = await db.execute(
      'SELECT * FROM fabubot_favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.user.id, limit, offset]
    );

    console.log('查询到的收藏数量:', favorites.length);

    const [countResult] = await db.execute(
      'SELECT COUNT(*) as total FROM fabubot_favorites WHERE user_id = ?',
      [req.user.id]
    );

    // 安全解析 JSON
    const parsedList = favorites.map(item => {
      console.log('处理收藏项, vod_id:', item.vod_id);
      console.log('vod_episodes 原始值:', item.vod_episodes);
      console.log('vod_episodes 类型:', typeof item.vod_episodes);
      
      let episodes = [];
      if (item.vod_episodes) {
        if (typeof item.vod_episodes === 'string') {
          // 如果是字符串，尝试解析
          try {
            episodes = JSON.parse(item.vod_episodes);
            console.log('解析成功:', episodes);
          } catch (e) {
            console.log('解析 episodes 失败:', e.message, '原始值:', item.vod_episodes);
            episodes = [];
          }
        } else if (Array.isArray(item.vod_episodes)) {
          // 如果已经是数组，直接使用
          episodes = item.vod_episodes;
          console.log('已经是数组:', episodes);
        } else if (typeof item.vod_episodes === 'object') {
          // 如果是对象（可能是 MySQL 解析后的 JSON）
          episodes = item.vod_episodes;
          console.log('已经是对象:', episodes);
        }
      }
      return {
        ...item,
        vod_episodes: episodes
      };
    });

    console.log('返回收藏列表, 条数:', parsedList.length);

    res.json({
      success: true,
      list: parsedList,
      total: countResult[0].total,
      page: parseInt(page),
      pageSize: limit,
      hasMore: countResult[0].total > offset + limit
    });
  } catch (error) {
    console.error('获取收藏列表失败:', error);
    res.status(500).json({ error: '服务器内部错误: ' + error.message });
  }
});

// 检查是否已收藏（未登录时返回 false）
router.get('/check/:vod_id', async (req, res) => {
  try {
    const { vod_id } = req.params;
    console.log('收到检查收藏请求, vod_id:', vod_id);
    console.log('Authorization头:', req.headers.authorization);
    
    // 尝试获取用户信息，如果未登录则直接返回 false
    let userId = null;
    try {
      const token = req.headers.authorization?.split(' ')[1];
      console.log('解析到的token:', token ? token.substring(0, 20) + '...' : '无');
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        console.log('解码后的用户ID:', decoded.id);
        const [users] = await db.execute('SELECT id FROM users WHERE id = ?', [decoded.id]);
        if (users.length > 0) {
          userId = users[0].id;
          console.log('找到用户:', userId);
        }
      }
    } catch (authError) {
      console.log('认证失败:', authError.message);
      // 认证失败，当作未登录处理
    }

    let isFavorited = false;
    if (userId) {
      const [favorites] = await db.execute(
        'SELECT id FROM fabubot_favorites WHERE user_id = ? AND vod_id = ?',
        [userId, vod_id]
      );
      isFavorited = favorites.length > 0;
      console.log('检查收藏结果, userId:', userId, 'vod_id:', vod_id, 'isFavorited:', isFavorited);
    } else {
      console.log('未登录，返回 isFavorited: false');
    }

    res.json({
      success: true,
      isFavorited: isFavorited
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
