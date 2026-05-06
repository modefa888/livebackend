const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 搜索缓存系统
const searchCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15分钟

// 生成缓存key
function getCacheKey(keyword, category, pg, type = 'stream') {
  return `${type}_${keyword}_${category}_${pg}`;
}

// 保存缓存
function saveToCache(keyword, category, pg, type, data) {
  const key = getCacheKey(keyword, category, pg, type);
  searchCache.set(key, {
    data: data,
    timestamp: Date.now()
  });
  
  // 15分钟后自动清除
  setTimeout(() => {
    searchCache.delete(key);
  }, CACHE_TTL);
}

// 检查并获取缓存
function getFromCache(keyword, category, pg, type) {
  const key = getCacheKey(keyword, category, pg, type);
  const cached = searchCache.get(key);
  
  if (!cached) return null;
  
  // 检查是否过期
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    searchCache.delete(key);
    return null;
  }
  
  return cached;
}

// 中间件：验证JWT令牌
const authenticateToken = async (req, res, next) => {
  // 先从url参数获取token，再从header获取，兼容SSE连接
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

// 获取聚合影视资源
router.get('/aggregated', authenticateToken, async (req, res) => {
  try {
    const { getVodSourceAggregator } = require('../services/vod-source-aggregator');
    const aggregator = getVodSourceAggregator();
    const limit = parseInt(req.query.limit) || 50;
    const sources = await aggregator.getAggregatedSources(limit);
    res.status(200).json({
      success: true,
      sources: sources
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: '获取聚合影视资源失败', 
      error: error.message 
    });
  }
});

// 按域名分组获取影视资源
router.get('/by-domain', authenticateToken, async (req, res) => {
  try {
    const { getVodSourceAggregator } = require('../services/vod-source-aggregator');
    const aggregator = getVodSourceAggregator();
    const domainGroups = await aggregator.getSourcesByDomain();
    res.status(200).json({
      success: true,
      domainGroups: domainGroups
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: '按域名分组获取影视资源失败', 
      error: error.message 
    });
  }
});

// 批量测试延迟（注意：必须放在 /ping/:id 前面！）- 使用 SSE 流来支持实时进度！
router.post('/ping/batch', authenticateToken, async (req, res) => {
  // 设置 SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const { ids } = req.body;

    const conn = await pool.getConnection();
    let sources;
    try {
      let query = 'SELECT id, name, url FROM fabubot_vod_sources WHERE deleted = 0';
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
    const limit = pLimit(5);
    const results = [];
    let completed = 0;
    const total = sources.length;

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

        const result = { id: source.id, name: source.name, success: true, ping };
        results.push(result);
        
        // 发送进度事件
        completed++;
        res.write(`event: progress\n`);
        res.write(`data: ${JSON.stringify({
          current: completed,
          total: total,
          percent: Math.round((completed / total) * 100),
          result: result
        })}\n\n`);
      } catch (error) {
        await pool.execute(
          'UPDATE fabubot_vod_sources SET ping = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [source.id]
        );

        const result = { id: source.id, name: source.name, success: false, message: error.message };
        results.push(result);
        
        // 发送进度事件
        completed++;
        res.write(`event: progress\n`);
        res.write(`data: ${JSON.stringify({
          current: completed,
          total: total,
          percent: Math.round((completed / total) * 100),
          result: result
        })}\n\n`);
      }
    };

    // 发送开始事件
    res.write(`event: start\n`);
    res.write(`data: ${JSON.stringify({ total: total })}\n\n`);

    await Promise.allSettled(
      sources.map(source => limit(() => testSource(source)))
    );

    // 发送结束事件
    res.write(`event: end\n`);
    res.write(`data: ${JSON.stringify({ success: true, results: results })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message: '批量测试延迟失败', error: error.message })}\n\n`);
    res.end();
  }
});

// 测试单个资源延迟
router.post('/ping/:id', authenticateToken, async (req, res) => {
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
        return res.status(404).json({ success: false, message: '影视资源不存在' });
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

// 聚合搜索接口
router.get('/search/aggregate', authenticateToken, async (req, res) => {
  try {
    const { keyword, category = 'all' } = req.query;

    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ success: false, message: '请输入搜索关键词' });
    }

    // 检查缓存
    const cached = getFromCache(keyword, category, 1, 'aggregate');
    if (cached) {
      console.log(`[搜索缓存] 命中缓存: ${keyword}`);
      return res.status(200).json(cached.data);
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
      const result = {
        success: true,
        list: [],
        total: 0,
        searchedSources: 0,
        successSources: 0
      };
      return res.json(result);
    }

    const axios = require('axios');
    const pLimit = require('p-limit');
    const limit = pLimit(5);

    const axiosInstance = axios.create({
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      httpAgent: new (require('http').Agent)({ keepAlive: true }),
      httpsAgent: new (require('https').Agent)({ keepAlive: true })
    });

    const stripHtml = (str) => str ? str.replace(/<[^>]*>/g, '').trim() : '';

    const parseEpisodes = (item) => {
                console.log(`开始解析视频项，vod_name: ${item.vod_name || item.title || '未知'}`);
                
                // 获取播放源和播放链接
                const playFrom = item.vod_play_from || '';
                const playUrl = item.vod_play_url || item.play_url || item.playUrl || item.url || '';
                const playServer = item.vod_play_server || '';
                const playNote = item.vod_play_note || '';
                
                // 检查是否有多个播放源（用 $$$ 分隔）
                const fromList = playFrom.split('$$$').filter(f => f.trim());
                const urlList = playUrl.split('$$$').filter(u => u.trim());
                const serverList = playServer.split('$$$');
                const noteList = playNote.split('$$$');
                
                let allEpisodes = [];
                
                if (fromList.length > 0 && urlList.length > 0) {
                    // 多播放源格式
                    console.log(`检测到 ${Math.min(fromList.length, urlList.length)} 个播放源`);
                    
                    for (let i = 0; i < Math.min(fromList.length, urlList.length); i++) {
                        const sourceName = fromList[i]?.trim() || `播放源${i + 1}`;
                        const sourceUrls = urlList[i]?.trim() || '';
                        const sourceServer = serverList[i]?.trim() || '';
                        const sourceNote = noteList[i]?.trim() || '';
                        
                        if (!sourceUrls) continue;
                        
                        console.log(`解析播放源 [${sourceName}] 的链接`);
                        
                        // 解析单个播放源的集数
                        const episodes = sourceUrls.split('#').map(p => {
                            if (!p.trim()) return null;
                            
                            const parts = p.split('$');
                            let name = parts[0]?.trim();
                            let url = parts.slice(1).join('$')?.trim();
                            
                            // 如果只有链接没有名称，尝试从备注或其他地方获取
                            if (!url && name && (name.startsWith('http') || name.includes('://'))) {
                                url = name;
                                name = '第' + (allEpisodes.length + 1) + '集';
                            }
                            
                            // 筛选：只返回包含 .m3u8 的地址
                            return name && url && url.includes('.m3u8') ? { 
                                name, 
                                url,
                                source: sourceName,
                                server: sourceServer,
                                note: sourceNote
                            } : null;
                        }).filter(Boolean);
                        
                        console.log(`播放源 [${sourceName}] 解析到 ${episodes.length} 集`);
                        allEpisodes = allEpisodes.concat(episodes);
                    }
                } else if (playUrl) {
                    // 单播放源格式
                    console.log(`单播放源格式，直接解析`);
                    
                    const episodes = playUrl.split('#').map(p => {
                        if (!p.trim()) return null;
                        
                        const parts = p.split('$');
                        let name = parts[0]?.trim();
                        let url = parts.slice(1).join('$')?.trim();
                        
                        if (!url && name && (name.startsWith('http') || name.includes('://'))) {
                            url = name;
                            name = item.vod_name || item.title || '播放';
                        }
                        
                        // 筛选：只返回包含 .m3u8 的地址
                        return name && url && url.includes('.m3u8') ? { name, url } : null;
                    }).filter(Boolean);
                    
                    if (episodes.length === 0 && playUrl.trim() && playUrl.includes('.m3u8')) {
                        episodes.push({
                            name: item.vod_name || item.title || '播放',
                            url: playUrl
                        });
                    }
                    
                    allEpisodes = episodes;
                }
                
                console.log(`总共解析到 ${allEpisodes.length} 个播放项`);
                return allEpisodes;
            };

    const searchSource = async (source) => {
      try {
        let searchUrl = source.url;
        if (searchUrl.includes('?')) {
          searchUrl += `&ac=detail&wd=${encodeURIComponent(keyword)}`;
        } else {
          searchUrl += `?ac=detail&wd=${encodeURIComponent(keyword)}`;
        }

        const response = await axiosInstance.get(searchUrl);
        const data = response.data;

        let list = [];
        if (Array.isArray(data?.list)) list = data.list;
        else if (Array.isArray(data?.data)) list = data.data;

        return list.map((item, index) => {
                        return {
                            id: item.vod_id || item.id || `${source.id}-${index}`,
                            title: item.vod_name || item.title || '未知标题',
                            year: item.vod_year || item.year || '',
                            type: item.type_name || item.type || '未知',
                            desc: stripHtml(item.vod_content || item.vod_blurb || ''),
                            pic: item.vod_pic || '',
                            picThumb: item.vod_pic_thumb || '',
                            picSlide: item.vod_pic_slide || '',
                            actor: item.vod_actor || '',
                            director: item.vod_director || '',
                            remarks: item.vod_remarks || '',
                            area: item.vod_area || '',
                            lang: item.vod_lang || '',
                            pubdate: item.vod_pubdate || '',
                            playFrom: item.vod_play_from || '',
                            episodes: parseEpisodes(item),
                            sourceName: source.name,
                            sourceId: source.id
                        };
                    });
      } catch (err) {
        console.log(`[聚合搜索] ${source.name} 失败: ${err.message}`);
        return [];
      }
    };

    const promises = sources.map(source => limit(() => searchSource(source)));
    const results = await Promise.allSettled(promises);

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

    const finalResult = {
      success: true,
      list: allMovies,
      total: allMovies.length,
      searchedSources: sources.length,
      successSources: results.filter(r => r.status === 'fulfilled' && r.value.length > 0).length
    };

    // 只在有数据时才保存缓存
    if (finalResult.total > 0) {
      saveToCache(keyword, category, 1, 'aggregate', finalResult);
      console.log(`[搜索缓存] 已保存: ${keyword}, ${allMovies.length} 个结果`);
    } else {
      console.log(`[搜索缓存] 无结果，不保存缓存: ${keyword}`);
    }

    res.status(200).json(finalResult);
  } catch (error) {
    console.error('[聚合搜索] 错误:', error);
    res.status(500).json({
      success: false,
      message: '聚合搜索失败',
      error: error.message
    });
  }
});

// 公开流式搜索接口（无需认证）
router.get('/search/aggregate/stream/public', async (req, res) => {
  const { keyword, category = 'all', pg = 1 } = req.query;

  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ message: '请输入搜索关键词' });
  }

  // 检查缓存
  const cached = getFromCache(keyword, category, pg, 'stream_public');
  if (cached) {
    console.log(`[搜索缓存] 命中缓存: ${keyword}`);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.flushHeaders();
    
    // 从缓存直接推送
    for (const eventData of cached.data) {
      res.write(`event: ${eventData.event}\n`);
      res.write(`data: ${JSON.stringify(eventData.data)}\n\n`);
    }
    return res.end();
  }

  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.flushHeaders();

  // 检测连接是否断开
  let connectionClosed = false;
  req.on('close', () => {
    connectionClosed = true;
  });

  // 记录事件用于缓存
  const cachedEvents = [];

  const send = (event, data) => {
    if (connectionClosed) return;
    
    // 记录事件
    cachedEvents.push({ event, data });
    
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.error('发送SSE数据失败:', e);
      connectionClosed = true;
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
    const limit = pLimit(3); // 减少并发，更稳定

    const axiosInstance = axios.create({
      timeout: 15000, // 增加超时时间
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      httpAgent: new (require('http').Agent)({ keepAlive: true }),
      httpsAgent: new (require('https').Agent)({ keepAlive: true })
    });

    const stripHtml = (str) => str ? str.replace(/<[^>]*>/g, '').trim() : '';

    const parseEpisodes = (item) => {
                console.log(`开始解析视频项，vod_name: ${item.vod_name || item.title || '未知'}`);
                
                // 获取播放源和播放链接
                const playFrom = item.vod_play_from || '';
                const playUrl = item.vod_play_url || item.play_url || item.playUrl || item.url || '';
                const playServer = item.vod_play_server || '';
                const playNote = item.vod_play_note || '';
                
                // 检查是否有多个播放源（用 $$$ 分隔）
                const fromList = playFrom.split('$$$').filter(f => f.trim());
                const urlList = playUrl.split('$$$').filter(u => u.trim());
                const serverList = playServer.split('$$$');
                const noteList = playNote.split('$$$');
                
                let allEpisodes = [];
                
                if (fromList.length > 0 && urlList.length > 0) {
                    // 多播放源格式
                    console.log(`检测到 ${Math.min(fromList.length, urlList.length)} 个播放源`);
                    
                    for (let i = 0; i < Math.min(fromList.length, urlList.length); i++) {
                        const sourceName = fromList[i]?.trim() || `播放源${i + 1}`;
                        const sourceUrls = urlList[i]?.trim() || '';
                        const sourceServer = serverList[i]?.trim() || '';
                        const sourceNote = noteList[i]?.trim() || '';
                        
                        if (!sourceUrls) continue;
                        
                        console.log(`解析播放源 [${sourceName}] 的链接`);
                        
                        // 解析单个播放源的集数
                        const episodes = sourceUrls.split('#').map(p => {
                            if (!p.trim()) return null;
                            
                            const parts = p.split('$');
                            let name = parts[0]?.trim();
                            let url = parts.slice(1).join('$')?.trim();
                            
                            // 如果只有链接没有名称，尝试从备注或其他地方获取
                            if (!url && name && (name.startsWith('http') || name.includes('://'))) {
                                url = name;
                                name = '第' + (allEpisodes.length + 1) + '集';
                            }
                            
                            // 筛选：只返回包含 .m3u8 的地址
                            return name && url && url.includes('.m3u8') ? { 
                                name, 
                                url,
                                source: sourceName,
                                server: sourceServer,
                                note: sourceNote
                            } : null;
                        }).filter(Boolean);
                        
                        console.log(`播放源 [${sourceName}] 解析到 ${episodes.length} 集`);
                        allEpisodes = allEpisodes.concat(episodes);
                    }
                } else if (playUrl) {
                    // 单播放源格式
                    console.log(`单播放源格式，直接解析`);
                    
                    const episodes = playUrl.split('#').map(p => {
                        if (!p.trim()) return null;
                        
                        const parts = p.split('$');
                        let name = parts[0]?.trim();
                        let url = parts.slice(1).join('$')?.trim();
                        
                        if (!url && name && (name.startsWith('http') || name.includes('://'))) {
                            url = name;
                            name = item.vod_name || item.title || '播放';
                        }
                        
                        // 筛选：只返回包含 .m3u8 的地址
                        return name && url && url.includes('.m3u8') ? { name, url } : null;
                    }).filter(Boolean);
                    
                    if (episodes.length === 0 && playUrl.trim() && playUrl.includes('.m3u8')) {
                        episodes.push({
                            name: item.vod_name || item.title || '播放',
                            url: playUrl
                        });
                    }
                    
                    allEpisodes = episodes;
                }
                
                console.log(`总共解析到 ${allEpisodes.length} 个播放项`);
                return allEpisodes;
            };

    const seen = new Set();
    let total = 0;
    let completedCount = 0;

    // 单源搜索
    const searchSource = async (source) => {
      if (connectionClosed) return;
      
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

                    results.push({
                        id: item.vod_id || item.id || `${source.id}-${index}`,
                        title,
                        year: item.vod_year || item.year || '',
                        type: item.type_name || item.type || '未知',
                        desc: stripHtml(item.vod_content || item.vod_blurb || ''),
                        pic: item.vod_pic || '',
                        picThumb: item.vod_pic_thumb || '',
                        picSlide: item.vod_pic_slide || '',
                        actor: item.vod_actor || '',
                        director: item.vod_director || '',
                        remarks: item.vod_remarks || '',
                        area: item.vod_area || '',
                        lang: item.vod_lang || '',
                        pubdate: item.vod_pubdate || '',
                        playFrom: item.vod_play_from || '',
                        sourceName: source.name,
                        sourceId: source.id,
                        episodes: parseEpisodes(item)
                    });
                }

        if (results.length > 0) {
          total += results.length;

          // 推送当前源结果
          send('data', {
            source: source.name,
            count: results.length,
            list: results
          });
        }

      } catch (err) {
        // 只在连接还在时发送错误
        if (!connectionClosed) {
          send('error', {
            source: source.name,
            message: err.message
          });
        }
      } finally {
        completedCount++;
      }
    };

    // 并发执行（边完成边推送）
    await Promise.allSettled(
      sources.map(source => limit(() => searchSource(source)))
    );

    // 结束（只在连接还在时）
    if (!connectionClosed) {
      send('end', {
        total,
        searchedSources: sources.length
      });
    }

    res.end();

    // 只在有数据时才保存缓存 - 检查是否有data事件且有结果
    const hasData = cachedEvents.some(event => 
      event.event === 'data' && event.data.list && event.data.list.length > 0
    );
    
    if (hasData) {
      saveToCache(keyword, category, pg, 'stream_public', cachedEvents);
      console.log(`[搜索缓存] 已保存: ${keyword}, ${cachedEvents.length} events`);
    } else {
      console.log(`[搜索缓存] 无结果，不保存缓存: ${keyword}`);
    }

  } catch (error) {
    if (!connectionClosed) {
      send('error', { message: error.message });
      send('end', { total: 0, searchedSources: 0 });
    }
    res.end();
  }
});

// 流式搜索接口（需要认证）
router.get('/search/aggregate/stream', authenticateToken, async (req, res) => {
  const { keyword, category = 'all', pg = 1 } = req.query;

  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ message: '请输入搜索关键词' });
  }

  // 检查缓存
  const cached = getFromCache(keyword, category, pg, 'stream_auth');
  if (cached) {
    console.log(`[搜索缓存] 命中缓存: ${keyword}`);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // 从缓存直接推送
    for (const eventData of cached.data) {
      res.write(`event: ${eventData.event}\n`);
      res.write(`data: ${JSON.stringify(eventData.data)}\n\n`);
    }
    return res.end();
  }

  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 记录事件用于缓存
  const cachedEvents = [];

  const send = (event, data) => {
    cachedEvents.push({ event, data });
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

    const parseEpisodes = (item) => {
                console.log(`开始解析视频项，vod_name: ${item.vod_name || item.title || '未知'}`);
                
                // 获取播放源和播放链接
                const playFrom = item.vod_play_from || '';
                const playUrl = item.vod_play_url || item.play_url || item.playUrl || item.url || '';
                const playServer = item.vod_play_server || '';
                const playNote = item.vod_play_note || '';
                
                // 检查是否有多个播放源（用 $$$ 分隔）
                const fromList = playFrom.split('$$$').filter(f => f.trim());
                const urlList = playUrl.split('$$$').filter(u => u.trim());
                const serverList = playServer.split('$$$');
                const noteList = playNote.split('$$$');
                
                let allEpisodes = [];
                
                if (fromList.length > 0 && urlList.length > 0) {
                    // 多播放源格式
                    console.log(`检测到 ${Math.min(fromList.length, urlList.length)} 个播放源`);
                    
                    for (let i = 0; i < Math.min(fromList.length, urlList.length); i++) {
                        const sourceName = fromList[i]?.trim() || `播放源${i + 1}`;
                        const sourceUrls = urlList[i]?.trim() || '';
                        const sourceServer = serverList[i]?.trim() || '';
                        const sourceNote = noteList[i]?.trim() || '';
                        
                        if (!sourceUrls) continue;
                        
                        console.log(`解析播放源 [${sourceName}] 的链接`);
                        
                        // 解析单个播放源的集数
                        const episodes = sourceUrls.split('#').map(p => {
                            if (!p.trim()) return null;
                            
                            const parts = p.split('$');
                            let name = parts[0]?.trim();
                            let url = parts.slice(1).join('$')?.trim();
                            
                            // 如果只有链接没有名称，尝试从备注或其他地方获取
                            if (!url && name && (name.startsWith('http') || name.includes('://'))) {
                                url = name;
                                name = '第' + (allEpisodes.length + 1) + '集';
                            }
                            
                            // 筛选：只返回包含 .m3u8 的地址
                            return name && url && url.includes('.m3u8') ? { 
                                name, 
                                url,
                                source: sourceName,
                                server: sourceServer,
                                note: sourceNote
                            } : null;
                        }).filter(Boolean);
                        
                        console.log(`播放源 [${sourceName}] 解析到 ${episodes.length} 集`);
                        allEpisodes = allEpisodes.concat(episodes);
                    }
                } else if (playUrl) {
                    // 单播放源格式
                    console.log(`单播放源格式，直接解析`);
                    
                    const episodes = playUrl.split('#').map(p => {
                        if (!p.trim()) return null;
                        
                        const parts = p.split('$');
                        let name = parts[0]?.trim();
                        let url = parts.slice(1).join('$')?.trim();
                        
                        if (!url && name && (name.startsWith('http') || name.includes('://'))) {
                            url = name;
                            name = item.vod_name || item.title || '播放';
                        }
                        
                        // 筛选：只返回包含 .m3u8 的地址
                        return name && url && url.includes('.m3u8') ? { name, url } : null;
                    }).filter(Boolean);
                    
                    if (episodes.length === 0 && playUrl.trim() && playUrl.includes('.m3u8')) {
                        episodes.push({
                            name: item.vod_name || item.title || '播放',
                            url: playUrl
                        });
                    }
                    
                    allEpisodes = episodes;
                }
                
                console.log(`总共解析到 ${allEpisodes.length} 个播放项`);
                return allEpisodes;
            };

    const seen = new Set();
    let total = 0;

    // 单源搜索
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

                    results.push({
                        id: item.vod_id || item.id || `${source.id}-${index}`,
                        title,
                        year: item.vod_year || item.year || '',
                        type: item.type_name || item.type || '未知',
                        desc: stripHtml(item.vod_content || item.vod_blurb || ''),
                        pic: item.vod_pic || '',
                        picThumb: item.vod_pic_thumb || '',
                        picSlide: item.vod_pic_slide || '',
                        actor: item.vod_actor || '',
                        director: item.vod_director || '',
                        remarks: item.vod_remarks || '',
                        area: item.vod_area || '',
                        lang: item.vod_lang || '',
                        pubdate: item.vod_pubdate || '',
                        playFrom: item.vod_play_from || '',
                        sourceName: source.name,
                        sourceId: source.id,
                        episodes: parseEpisodes(item)
                    });
                }

        if (results.length > 0) {
          total += results.length;

          // 推送当前源结果
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

    // 并发执行（边完成边推送）
    await Promise.allSettled(
      sources.map(source => limit(() => searchSource(source)))
    );

    // 结束
    send('end', {
      total,
      searchedSources: sources.length
    });

    res.end();

    // 只在有数据时才保存缓存 - 检查是否有data事件且有结果
    const hasData = cachedEvents.some(event => 
      event.event === 'data' && event.data.list && event.data.list.length > 0
    );
    
    if (hasData) {
      saveToCache(keyword, category, pg, 'stream_auth', cachedEvents);
      console.log(`[搜索缓存] 已保存: ${keyword}, ${cachedEvents.length} events`);
    } else {
      console.log(`[搜索缓存] 无结果，不保存缓存: ${keyword}`);
    }

  } catch (error) {
    send('error', { message: error.message });
    send('end', { total: 0, searchedSources: 0 });
    res.end();
  }
});

module.exports = router;
