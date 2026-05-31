const express = require('express');
const router = express.Router();
const { pool } = require('../../bots/fabuBot/config/database');
const { logOperation } = require('./operation-logs');

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

// 中间件：验证管理员权限
const verifyAdmin = async (req, res, next) => {
  if (req.user.permissionLevel !== 2 && req.user.permissionLevel !== 3) {
    return res.status(403).json({ message: '权限不足' });
  }
  next();
};

// 获取影视资源列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    const conn = await pool.getConnection();
    try {
      const [sources] = await conn.execute(
        'SELECT * FROM fabubot_vod_sources WHERE deleted = 0 ORDER BY sort ASC, created_at DESC LIMIT ? OFFSET ?',
        [parseInt(pageSize), parseInt(offset)]
      );

      const [[{ total }]] = await conn.execute(
        'SELECT COUNT(*) as total FROM fabubot_vod_sources WHERE deleted = 0'
      );

      res.status(200).json({
        sources,
        total: total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取影视资源列表失败', error: error.message });
  }
});

// 获取所有分类
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        'SELECT DISTINCT category FROM fabubot_vod_sources WHERE deleted = 0 AND enabled = 1 ORDER BY category'
      );
      
      const categories = rows.map(row => row.category);
      
      res.status(200).json({
        success: true,
        categories: ['all', ...categories]
      });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '获取分类失败', error: error.message });
  }
});

// 聚合搜索接口
router.get('/search/aggregate', authenticateToken, async (req, res) => {
  try {
    const { keyword, category = 'all', pg = 1 } = req.query;

    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ success: false, message: '请输入搜索关键词' });
    }

    const conn = await pool.getConnection();
    let sources;
    try {
      let query = 'SELECT id, name, url, category FROM fabubot_vod_sources WHERE deleted = 0 AND enabled = 1';
      const params = [];

      if (category !== 'all') {
        query += ' AND category = ?';
        params.push(category);
      }

      query += ' ORDER BY sort ASC';

      [sources] = await conn.execute(query, params);
    } finally {
      conn.release();
    }

    if (!sources.length) {
      return res.json({
        success: true,
        list: [],
        total: 0,
        searchedSources: 0,
        successSources: 0
      });
    }

    const axios = require('axios');
    const pLimit = require('p-limit');
    const limit = pLimit(5); // 并发限制（建议 3~8）

    // axios实例（复用连接）
    const axiosInstance = axios.create({
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      httpAgent: new (require('http').Agent)({ keepAlive: true }),
      httpsAgent: new (require('https').Agent)({ keepAlive: true })
    });

    // 去HTML
    const stripHtml = (str) => {
      if (!str) return '';
      return str.replace(/<[^>]*>/g, '').trim();
    };

    // 解析播放列表
    const parseEpisodes = (playUrl) => {
      if (!playUrl) return [];
      return playUrl.split('#').map(part => {
        const [name, url] = part.split('$');
        return name && url ? { name: name.trim(), url: url.trim() } : null;
      }).filter(Boolean);
    };

    // 👉 单个资源站搜索（只请求 pg 页）
    const searchSource = async (source) => {
      try {
        let searchUrl = source.url;

        if (searchUrl.includes('?')) {
          searchUrl += `&ac=detail&wd=${encodeURIComponent(keyword)}&pg=${pg}`;
        } else {
          searchUrl += `?ac=detail&wd=${encodeURIComponent(keyword)}&pg=${pg}`;
        }

        const response = await axiosInstance.get(searchUrl);

        const data = response.data;
        let list = [];

        if (Array.isArray(data?.list)) {
          list = data.list;
        } else if (Array.isArray(data?.data)) {
          list = data.data;
        }

        return list.map((item, index) => {
          const playUrl = item.vod_play_url || item.play_url || item.url || '';

          return {
            id: item.vod_id || item.id || `${source.id}-${pg}-${index}`,
            title: item.vod_name || item.title || item.name || '未知标题',
            year: item.vod_year || item.year || '',
            type: item.type_name || item.type || '未知',
            rating: parseFloat(item.vod_score || item.score || 0),
            desc: stripHtml(item.vod_content || item.vod_desc || item.desc || ''),
            playUrl,
            downloadUrl: item.download_url || '',
            pic: item.vod_pic || '',
            vodClass: item.vod_class || '',
            actor: item.vod_actor || '',
            director: item.vod_director || '',
            lang: item.vod_lang || '',
            remarks: item.vod_remarks || '',
            episodes: parseEpisodes(playUrl),
            sourceName: source.name,
            sourceId: source.id,
            originalItem: item
          };
        });

      } catch (err) {
        console.log(`[聚合搜索] ${source.name} 失败: ${err.message}`);
        return [];
      }
    };

    // 👉 并发执行（受限）
    const promises = sources.map(source =>
      limit(() => searchSource(source))
    );

    const results = await Promise.allSettled(promises);

    // 👉 去重合并
    const allMovies = [];
    const seen = new Set();
    let uniqueId = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const movie of result.value) {
          const key = movie.title.trim().toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            allMovies.push({
              ...movie,
              uniqueId: `movie-${uniqueId++}`
            });
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      list: allMovies,
      total: allMovies.length,
      searchedSources: sources.length,
      successSources: results.filter(r => r.status === 'fulfilled' && r.value.length > 0).length
    });

  } catch (error) {
    console.error('[聚合搜索] 错误:', error);
    res.status(500).json({
      success: false,
      message: '聚合搜索失败',
      error: error.message
    });
  }
});


router.get('/search/aggregate/stream', authenticateToken, async (req, res) => {
  const { keyword, category = 'all', pg = 1 } = req.query;

  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ message: '请输入搜索关键词' });
  }

  // ✅ SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.error('发送SSE数据失败:', e);
    }
  };

  try {
    // 获取资源站
    const conn = await pool.getConnection();
    let sources;
    try {
      let query = 'SELECT id, name, url FROM fabubot_vod_sources WHERE deleted = 0 AND enabled = 1';
      const params = [];

      if (category !== 'all') {
        query += ' AND category = ?';
        params.push(category);
      }

      query += ' ORDER BY sort ASC';

      [sources] = await conn.execute(query, params);
    } finally {
      conn.release();
    }

    if (!sources.length) {
      send('end', { total: 0 });
      return res.end();
    }

    const axios = require('axios');
    const pLimit = require('p-limit');
    const limit = pLimit(5);

    const axiosInstance = axios.create({
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      httpAgent: new (require('http').Agent)({ keepAlive: true }),
      httpsAgent: new (require('https').Agent)({ keepAlive: true })
    });

    const stripHtml = (str) => str ? str.replace(/<[^>]*>/g, '').trim() : '';

    const parseEpisodes = (playUrl) => {
      if (!playUrl) return [];
      return playUrl.split('#').map(p => {
        const [name, url] = p.split('$');
        return name && url ? { name, url } : null;
      }).filter(Boolean);
    };

    const seen = new Set();
    let total = 0;

    // 👉 单源搜索
    const searchSource = async (source) => {
      try {
        let searchUrl = source.url;
        if (searchUrl.includes('?')) {
          searchUrl += `&ac=detail&wd=${encodeURIComponent(keyword)}&pg=${pg}`;
        } else {
          searchUrl += `?ac=detail&wd=${encodeURIComponent(keyword)}&pg=${pg}`;
        }

        const response = await axiosInstance.get(searchUrl);
        const data = response.data;

        let list = [];
        if (Array.isArray(data?.list)) list = data.list;
        else if (Array.isArray(data?.data)) list = data.data;

        const results = [];

        for (const item of list) {
          const title = (item.vod_name || item.title || '').trim();
          const key = title.toLowerCase();

          if (!title || seen.has(key)) continue;
          seen.add(key);

          const playUrl = item.vod_play_url || item.play_url || '';

          results.push({
            title,
            year: item.vod_year || '',
            type: item.type_name || '',
            pic: item.vod_pic || '',
            sourceName: source.name,
            sourceId: source.id,
            episodes: parseEpisodes(playUrl),
            desc: stripHtml(item.vod_content || '')
          });
        }

        if (results.length > 0) {
          total += results.length;

          // 🚀 推送当前源结果
          send('data', {
            source: source.name,
            count: results.length,
            list: results
          });
        }

      } catch (err) {
        send('error', {
          source: source.name,
          message: err.message
        });
      }
    };

    // 👉 并发执行（边完成边推送）
    await Promise.allSettled(
      sources.map(source => limit(() => searchSource(source)))
    );

    // ✅ 结束
    send('end', {
      total,
      searchedSources: sources.length
    });

    res.end();

  } catch (error) {
    send('error', { message: error.message });
    res.end();
  }
});

// 获取单个影视资源
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const conn = await pool.getConnection();
    try {
      const [sources] = await conn.execute(
        'SELECT * FROM fabubot_vod_sources WHERE id = ? AND deleted = 0',
        [id]
      );
      
      if (sources.length === 0) {
        return res.status(404).json({ message: '影视资源不存在' });
      }
      
      res.status(200).json(sources[0]);
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '获取影视资源详情失败', error: error.message });
  }
});

// 使用爬虫搜索影视（根据资源ID搜索）
router.get('/:id/search', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { keyword, page = 1, pageSize = 10 } = req.query;
    
    if (!keyword) {
      return res.status(400).json({ success: false, message: '请输入搜索关键词' });
    }

    const conn = await pool.getConnection();
    let vodSource;
    try {
      const [sources] = await conn.execute(
        'SELECT * FROM fabubot_vod_sources WHERE id = ? AND deleted = 0',
        [id]
      );
      
      if (sources.length === 0) {
        return res.status(404).json({ success: false, message: '影视资源不存在' });
      }
      vodSource = sources[0];
    } finally {
      conn.release();
    }

    const axios = require('axios');
    
    // 构建搜索URL - 根据资源URL格式添加搜索参数
    let searchUrl = vodSource.url;
    if (searchUrl.includes('?')) {
      searchUrl += `&ac=detail&wd=${encodeURIComponent(keyword)}&pg=${page}`;
    } else {
      searchUrl += `?ac=detail&wd=${encodeURIComponent(keyword)}&pg=${page}`;
    }

    console.log(`[VOD搜索] 正在搜索: ${searchUrl}`);
    
    const response = await axios.get(searchUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const data = response.data;
    
    // 去除HTML标签的函数
    const stripHtml = (str) => {
      if (!str) return '';
      return str.replace(/<[^>]*>/g, '').trim();
    };

    // 解析集数字段
    const parseEpisodes = (playUrl) => {
      if (!playUrl) return [];
      const episodes = [];
      const parts = playUrl.split('#');
      for (const part of parts) {
        const [name, url] = part.split('$');
        if (name && url) {
          episodes.push({ name: name.trim(), url: url.trim() });
        }
      }
      return episodes;
    };

    // 解析返回的数据
    let movies = [];
    
    if (data && data.list && Array.isArray(data.list)) {
      movies = data.list.map((item, index) => {
        const playUrl = item.vod_play_url || item.play_url || item.url || '';
        return {
          id: item.vod_id || item.id || `${id}-${index}`,
          title: item.vod_name || item.title || item.name || '未知标题',
          year: item.vod_year || item.year || '',
          type: item.type_name || item.type || item.vod_type || '未知',
          rating: parseFloat(item.vod_score || item.score || 0),
          desc: stripHtml(item.vod_content || item.vod_desc || item.desc || item.description || ''),
          playUrl: playUrl,
          downloadUrl: item.download_url || '',
          pic: item.vod_pic || item.pic || '',
          vodClass: item.vod_class || item.class || '',
          actor: item.vod_actor || item.actor || '',
          director: item.vod_director || item.director || '',
          lang: item.vod_lang || item.lang || '',
          remarks: item.vod_remarks || item.remarks || '',
          episodes: parseEpisodes(playUrl),
          originalItem: item
        };
      });
    } else if (data && data.data && Array.isArray(data.data)) {
      movies = data.data.map((item, index) => {
        const playUrl = item.vod_play_url || item.play_url || item.url || '';
        return {
          id: item.vod_id || item.id || `${id}-${index}`,
          title: item.vod_name || item.title || item.name || '未知标题',
          year: item.vod_year || item.year || '',
          type: item.type_name || item.type || item.vod_type || '未知',
          rating: parseFloat(item.vod_score || item.score || 0),
          desc: stripHtml(item.vod_content || item.vod_desc || item.desc || item.description || ''),
          playUrl: playUrl,
          downloadUrl: item.download_url || '',
          pic: item.vod_pic || item.pic || '',
          vodClass: item.vod_class || item.class || '',
          actor: item.vod_actor || item.actor || '',
          director: item.vod_director || item.director || '',
          lang: item.vod_lang || item.lang || '',
          remarks: item.vod_remarks || item.remarks || '',
          episodes: parseEpisodes(playUrl),
          originalItem: item
        };
      });
    }

    // 分页处理
    const startIndex = (page - 1) * pageSize;
    const paginatedMovies = movies.slice(startIndex, startIndex + pageSize);

    res.status(200).json({
      success: true,
      list: paginatedMovies,
      total: movies.length,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      vodSource: { id: vodSource.id, name: vodSource.name, url: vodSource.url }
    });
  } catch (error) {
    console.error('爬虫搜索失败:', error);
    res.status(500).json({ success: false, message: '搜索失败', error: error.message });
  }
});

// 添加影视资源
router.post('/', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { id, name, url, type = 'vod', category = 'normal', enabled = 1, sort = 0 } = req.body;
    
    if (!id || !name || !url) {
      return res.status(400).json({ message: 'ID、名称和URL不能为空' });
    }

    const conn = await pool.getConnection();
    try {
      const [existing] = await conn.execute(
        'SELECT id FROM fabubot_vod_sources WHERE id = ? AND deleted = 0',
        [id]
      );
      
      if (existing.length > 0) {
        return res.status(400).json({ message: '资源ID已存在' });
      }

      await conn.execute(
        'INSERT INTO fabubot_vod_sources (id, name, url, type, category, enabled, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [id, name, url, type, category, enabled, sort]
      );

      await logOperation(req, 'add', '影视资源', id, name, `添加影视资源: ${name}`);

      res.status(200).json({ success: true, message: '影视资源添加成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '添加影视资源失败', error: error.message });
  }
});

// 更新影视资源
router.put('/:id', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, type, category, enabled, sort } = req.body;

    const conn = await pool.getConnection();
    try {
      const [existing] = await conn.execute(
        'SELECT id FROM fabubot_vod_sources WHERE id = ? AND deleted = 0',
        [id]
      );
      
      if (existing.length === 0) {
        return res.status(404).json({ message: '影视资源不存在' });
      }

      const updates = [];
      const values = [];

      if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
      }
      if (url !== undefined) {
        updates.push('url = ?');
        values.push(url);
      }
      if (type !== undefined) {
        updates.push('type = ?');
        values.push(type);
      }
      if (category !== undefined) {
        updates.push('category = ?');
        values.push(category);
      }
      if (enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(enabled);
      }
      if (sort !== undefined) {
        updates.push('sort = ?');
        values.push(sort);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: '没有需要更新的字段' });
      }

      values.push(id);

      await conn.execute(
        `UPDATE fabubot_vod_sources SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      await logOperation(req, 'update', '影视资源', parseInt(id), name || `资源${id}`, `更新影视资源: ${name || `ID ${id}`}`);

      res.status(200).json({ success: true, message: '影视资源更新成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '更新影视资源失败', error: error.message });
  }
});

// 批量更新排序
router.put('/sort/batch', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ message: '无效的排序数据' });
    }

    const conn = await pool.getConnection();
    try {
      for (const item of items) {
        await conn.execute(
          'UPDATE fabubot_vod_sources SET sort = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [item.sort, item.id]
        );
      }

      await logOperation(req, 'update', '影视资源', 0, '批量排序', `批量更新影视资源排序`);

      res.status(200).json({ success: true, message: '排序更新成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '批量更新排序失败', error: error.message });
  }
});

// 删除影视资源
router.delete('/:id', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const conn = await pool.getConnection();
    try {
      const [existing] = await conn.execute(
        'SELECT id FROM fabubot_vod_sources WHERE id = ? AND deleted = 0',
        [id]
      );
      
      if (existing.length === 0) {
        return res.status(404).json({ message: '影视资源不存在' });
      }

      await conn.execute(
        'UPDATE fabubot_vod_sources SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );

      res.status(200).json({ success: true, message: '影视资源删除成功' });
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: '删除影视资源失败', error: error.message });
  }
});

// 测试单个资源延迟
router.post('/:id/ping', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const conn = await pool.getConnection();
    let vodSource;
    try {
      const [sources] = await conn.execute(
        'SELECT * FROM fabubot_vod_sources WHERE id = ? AND deleted = 0',
        [id]
      );
      
      if (sources.length === 0) {
        return res.status(404).json({ message: '影视资源不存在' });
      }
      vodSource = sources[0];
    } finally {
      conn.release();
    }

    const axios = require('axios');
    const startTime = Date.now();
    
    try {
      await axios.get(vodSource.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const ping = Date.now() - startTime;
      
      await pool.execute(
        'UPDATE fabubot_vod_sources SET ping = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [ping, id]
      );

      res.status(200).json({ success: true, ping });
    } catch (error) {
      await pool.execute(
        'UPDATE fabubot_vod_sources SET ping = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );
      
      res.status(200).json({ success: false, message: '连接失败', error: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: '测试延迟失败', error: error.message });
  }
});

// 批量测试延迟
router.post('/ping/batch', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    
    const conn = await pool.getConnection();
    let sources;
    try {
      let query = 'SELECT id, url FROM fabubot_vod_sources WHERE deleted = 0';
      const params = [];
      
      if (ids && Array.isArray(ids) && ids.length > 0) {
        query += ' AND id IN (?)';
        params.push(ids);
      }
      
      [sources] = await conn.execute(query, params);
    } finally {
      conn.release();
    }

    const axios = require('axios');
    const pLimit = require('p-limit');
    const limit = pLimit(5); // 限制并发数为5
    const results = [];

    const testSource = async (source) => {
      const startTime = Date.now();
      try {
        await axios.get(source.url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const ping = Date.now() - startTime;
        
        await pool.execute(
          'UPDATE fabubot_vod_sources SET ping = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [ping, source.id]
        );

        results.push({ id: source.id, success: true, ping });
      } catch (error) {
        await pool.execute(
          'UPDATE fabubot_vod_sources SET ping = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [source.id]
        );
        
        results.push({ id: source.id, success: false, message: error.message });
      }
    };

    await Promise.allSettled(
      sources.map(source => limit(() => testSource(source)))
    );

    res.status(200).json({ success: true, results });
  } catch (error) {
    res.status(500).json({ message: '批量测试延迟失败', error: error.message });
  }
});

module.exports = router;