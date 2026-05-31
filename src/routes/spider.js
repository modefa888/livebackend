const express = require('express');
const router = express.Router();
const spiderManager = require('../services/spider/spider-manager');
const db = require('../config/db');
const { logOperation } = require('./operation-logs');

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

// 获取爬虫状态
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const status = await spiderManager.getSpiderStatus();
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ message: '获取爬虫状态失败', error: error.message });
  }
});

// 获取所有爬虫配置
router.get('/configs', authenticateToken, async (req, res) => {
  try {
    // 从数据库中获取爬虫配置
    const [spiderConfigs] = await db.execute('SELECT * FROM spider_configs');
    
    // 如果数据库中没有爬虫配置，从文件系统中获取
    if (spiderConfigs.length === 0) {
      const fs = require('fs');
      const path = require('path');
      const spiderDir = path.join(__dirname, '../../bots/livebot/src/spider');
      
      // 读取目录中的所有文件
      const files = fs.readdirSync(spiderDir);
      
      // 过滤出 .js 文件，排除 index.js
      const jsFiles = files.filter(file => 
        path.extname(file) === '.js' && file !== 'index.js'
      );
      
      // 处理爬虫文件，获取爬虫信息
      const fileSpiderConfigs = jsFiles.map((file, index) => {
        try {
          const filePath = path.join(spiderDir, file);
          const module = require(filePath);
          
          // 尝试获取模块名称
          let name = file.replace('.js', '');
          if (typeof module.getModuleName === 'function') {
            name = module.getModuleName();
          }
          
          return {
            id: index + 1,
            name: name,
            type: 'live', // 默认类型
            url: module.getHost ? module.getHost() : '',
            crawlInterval: module.getMidCount ? module.getMidCount() : 300,
            isEnabled: true // 默认启用
          };
        } catch (error) {
          console.error(`Error processing spider file ${file}:`, error);
          return null;
        }
      }).filter(spider => spider !== null);
      
      res.status(200).json(fileSpiderConfigs);
    } else {
      res.status(200).json(spiderConfigs);
    }
  } catch (error) {
    res.status(500).json({ message: '获取爬虫配置失败', error: error.message });
  }
});

// 获取爬虫日志
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    const { spiderId, limit = 50 } = req.query;
    let query = 'SELECT * FROM spider_logs';
    const params = [];

    if (spiderId) {
      query += ' WHERE spiderId = ?';
      params.push(spiderId);
    }

    query += ' ORDER BY createdAt DESC LIMIT ?';
    params.push(limit);

    const [logs] = await db.execute(query, params);
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: '获取爬虫日志失败', error: error.message });
  }
});

// 添加爬虫
router.post('/add', authenticateToken, async (req, res) => {
  try {
    const config = req.body;
    
    // 检查是否需要创建脚本文件
    if (config.createScript) {
      const fs = require('fs');
      const path = require('path');
      const spiderDir = path.join(__dirname, '../../bots/livebot/src/spider');
      
      // 生成脚本文件名
      const scriptFileName = `${config.name.toLowerCase().replace(/\s+/g, '-')}.js`;
      const scriptFilePath = path.join(spiderDir, scriptFileName);
      
      // 创建脚本文件内容
      let scriptContent;
      if (config.scriptContent) {
        // 使用用户提供的脚本内容
        scriptContent = config.scriptContent;
      } else {
        // 使用默认模板
        scriptContent = `const $ = require("../config/includes");
const axios = $.axios;

/**
 * 获取站点状态
 * @param {string} mid - 主播ID或房间ID
 * @param {string} proxy - 代理地址
 * @returns {Promise<Object>} 站点状态
 */
const getStationStatus = async (mid, proxy) => {
  try {
    // 实现爬虫逻辑
    // 这里需要根据具体网站的结构进行修改
    
    // 示例代码
    const response = await axios.get('${config.url}', {
      proxy: proxy ? { host: proxy.split(':')[0], port: parseInt(proxy.split(':')[1]) } : undefined,
      timeout: 10000
    });
    
    // 解析响应数据
    // 这里需要根据具体网站的结构进行修改
    
    return {
      code: 1,
      title: '直播标题',
      username: '主播名称',
      roomid: mid,
      avatar_thumb: '头像URL',
      room_status: 1, // 1表示直播中，0表示未直播
      liveUrl: '直播流URL',
      targetUrl: '${config.url}'
    };
  } catch (error) {
    console.error('获取站点状态失败:', error);
    return {
      msg: '请求失败: ' + error.message,
      code: 0,
      room_status: 0
    };
  }
};

/**
 * 获取模块名称
 * @returns {string} 模块名称
 */
const getModuleName = () => {
  return '${config.name}';
};

/**
 * 获取主机地址
 * @returns {string} 主机地址
 */
const getHost = () => {
  return '${config.url}';
};

/**
 * 获取监控间隔
 * @returns {number} 监控间隔（秒）
 */
const getMidCount = () => {
  return ${config.interval || 300};
};

module.exports = {
  getStationStatus,
  getModuleName,
  getHost,
  getMidCount
};
`;
      }
      
      // 写入脚本文件
      fs.writeFileSync(scriptFilePath, scriptContent, 'utf8');
      console.log(`创建爬虫脚本文件: ${scriptFilePath}`);
    }
    
    const result = await spiderManager.addSpider(config);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '添加爬虫失败', error: error.message });
  }
});

// 删除爬虫
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await spiderManager.deleteSpider(parseInt(id));

    if (result.success) {
      await logOperation(req, 'delete', 'spider', parseInt(id), `爬虫${id}`, `删除爬虫: ID ${id}`);
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '删除爬虫失败', error: error.message });
  }
});

// 更新爬虫
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const config = req.body;
    const result = await spiderManager.updateSpider(parseInt(id), config);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '更新爬虫失败', error: error.message });
  }
});

// 根据名称更新爬虫状态
router.put('/toggle/:name', authenticateToken, async (req, res) => {
  try {
    const { name } = req.params;
    const { isEnabled } = req.body;
    const result = await spiderManager.updateSpiderStatus(name, isEnabled);

    if (result.success) {
      await logOperation(req, 'update', 'spider', 0, name, `${isEnabled ? '启用' : '禁用'}爬虫: ${name}`);
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '更新爬虫状态失败', error: error.message });
  }
});

// 启动所有爬虫
router.post('/start-all', authenticateToken, async (req, res) => {
  try {
    await spiderManager.startAllSpiders();
    res.status(200).json({ success: true, message: '所有爬虫已启动' });
  } catch (error) {
    res.status(500).json({ message: '启动所有爬虫失败', error: error.message });
  }
});

// 停止所有爬虫
router.post('/stop-all', authenticateToken, async (req, res) => {
  try {
    await spiderManager.stopAllSpiders();
    res.status(200).json({ success: true, message: '所有爬虫已停止' });
  } catch (error) {
    res.status(500).json({ message: '停止所有爬虫失败', error: error.message });
  }
});

// 获取爬虫脚本
router.get('/script/:site', authenticateToken, async (req, res) => {
  try {
    const { site } = req.params;
    const fs = require('fs');
    const path = require('path');
    const spiderDir = path.join(__dirname, '../../bots/livebot/src/spider');
    
    // 从数据库获取测试关键字
    let testKeyword = '';
    try {
      const [spiders] = await db.execute('SELECT testKeyword FROM spider_configs WHERE name = ?', [site]);
      if (spiders.length > 0) {
        testKeyword = spiders[0].testKeyword || '';
      }
    } catch (error) {
      console.error('获取测试关键字失败:', error);
    }
    
    // 找到对应的爬虫文件
    const files = fs.readdirSync(spiderDir);
    let targetFile = null;
    
    for (const file of files) {
      if (path.extname(file) === '.js' && file !== 'index.js') {
        const filePath = path.join(spiderDir, file);
        try {
          const module = require(filePath);
          let moduleName = file.replace('.js', '');
          if (typeof module.getModuleName === 'function') {
            moduleName = module.getModuleName();
          }
          if (moduleName === site) {
            targetFile = filePath;
            break;
          }
        } catch (error) {
          console.error(`Error processing spider file ${file}:`, error);
        }
      }
    }
    
    if (!targetFile) {
      // 如果没有找到对应的爬虫文件，返回空脚本和测试关键字
      return res.status(200).json({ script: '', testKeyword });
    }
    
    // 读取脚本内容
    const scriptContent = fs.readFileSync(targetFile, 'utf8');
    res.status(200).json({ script: scriptContent, testKeyword });
  } catch (error) {
    res.status(500).json({ message: '获取脚本内容失败', error: error.message });
  }
});

// 保存爬虫脚本
router.post('/script', authenticateToken, async (req, res) => {
  try {
    const { site, script, testKeyword } = req.body;
    const fs = require('fs');
    const path = require('path');
    const spiderDir = path.join(__dirname, '../../bots/livebot/src/spider');
    
    // 找到对应的爬虫文件
    const files = fs.readdirSync(spiderDir);
    let targetFile = null;
    
    for (const file of files) {
      if (path.extname(file) === '.js' && file !== 'index.js') {
        const filePath = path.join(spiderDir, file);
        try {
          const module = require(filePath);
          let moduleName = file.replace('.js', '');
          if (typeof module.getModuleName === 'function') {
            moduleName = module.getModuleName();
          }
          if (moduleName === site) {
            targetFile = filePath;
            break;
          }
        } catch (error) {
          console.error(`Error processing spider file ${file}:`, error);
        }
      }
    }
    
    if (!targetFile) {
      return res.status(404).json({ success: false, message: '未找到对应的爬虫文件' });
    }
    
    // 保存脚本内容
    fs.writeFileSync(targetFile, script, 'utf8');
    
    // 保存测试关键字到数据库
    try {
      await db.execute('UPDATE spider_configs SET testKeyword = ?, updatedAt = CURRENT_TIMESTAMP WHERE name = ?', [testKeyword || '', site]);
    } catch (error) {
      console.error('保存测试关键字失败:', error);
    }
    
    await logOperation(req, 'update', 'spider', 0, site, `保存爬虫脚本: ${site}`);
    
    res.status(200).json({ success: true, message: '脚本保存成功' });
  } catch (error) {
    res.status(500).json({ message: '保存脚本失败', error: error.message });
  }
});

// 测试爬虫脚本
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const { script, mid, proxy } = req.body;
    
    // 创建临时文件来测试脚本
    const fs = require('fs');
    const path = require('path');
    const tempDir = path.join(__dirname, '../temp');
    
    // 确保临时目录存在
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // 创建临时脚本文件
    const tempFile = path.join(tempDir, `test-script-${Date.now()}.js`);
    
    // 处理脚本内容，替换相对路径
    let processedScript = script;
    
    // 替换 ../config/includes 为绝对路径
    const includesPath = path.join(__dirname, '../../bots/livebot/src/config/includes');
    processedScript = processedScript.replace(/require\(['"]\.\.\/config\/includes['"]\)/g, `require('${includesPath.replace(/\\/g, '\\\\')}')`);
    
    // 替换其他可能的相对路径
    const spiderDir = path.join(__dirname, '../../bots/livebot/src/spider');
    processedScript = processedScript.replace(/require\(['"]\.\.\/([^'"]+)['"]\)/g, (match, p1) => {
      const fullPath = path.join(spiderDir, p1);
      return `require('${fullPath.replace(/\\/g, '\\\\')}')`;
    });
    
    fs.writeFileSync(tempFile, processedScript, 'utf8');
    
    // 尝试加载并测试脚本
    let result;
    try {
      const testModule = require(tempFile);
      if (typeof testModule.getStationStatus === 'function') {
        result = await testModule.getStationStatus(mid, proxy);
        res.status(200).json({
          success: true,
          message: '脚本测试成功',
          data: result
        });
      } else {
        res.status(400).json({
          success: false,
          message: '脚本缺少 getStationStatus 函数'
        });
      }
    } catch (error) {
      res.status(400).json({
        success: false,
        message: '脚本执行失败: ' + error.message
      });
    } finally {
      // 清理临时文件
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  } catch (error) {
    res.status(500).json({ message: '测试脚本失败', error: error.message });
  }
});

// 上传脚本到数据库
router.post('/upload-to-db', authenticateToken, async (req, res) => {
  try {
    const { configs } = req.body;
    
    if (!configs || !Array.isArray(configs)) {
      return res.status(400).json({ success: false, message: '无效的爬虫配置列表' });
    }
    
    let uploadedCount = 0;
    let failedCount = 0;
    let existingCount = 0;
    
    // 处理爬虫配置，上传到数据库
    for (const config of configs) {
      try {
        const { name, type, url, crawlInterval, isEnabled } = config;
        
        if (!name) {
          failedCount++;
          continue;
        }
        
        // 检查数据库中是否已存在该爬虫
        const [existing] = await db.execute('SELECT * FROM spider_configs WHERE name = ?', [name]);
        
        if (existing.length === 0) {
          // 插入新爬虫
          await db.execute(
            'INSERT INTO spider_configs (name, type, url, crawlInterval, isEnabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            [name, type || 'live', url || '', crawlInterval || 300, isEnabled !== undefined ? isEnabled : true]
          );
          uploadedCount++;
        } else {
          // 已存在的爬虫
          existingCount++;
        }
      } catch (error) {
        console.error(`Error processing spider config ${config.name}:`, error);
        failedCount++;
      }
    }
    
    res.status(200).json({
      success: true,
      message: `脚本上传完成，成功 ${uploadedCount} 个，数据库已存在 ${existingCount} 个，失败 ${failedCount} 个`
    });
  } catch (error) {
    res.status(500).json({ message: '上传脚本失败', error: error.message });
  }
});

// 获取本地脚本列表
router.get('/local-scripts', authenticateToken, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const spiderDir = path.join(__dirname, '../../bots/livebot/src/spider');
    
    // 读取目录中的文件
    const files = fs.readdirSync(spiderDir);
    const scripts = [];
    
    files.forEach(file => {
      if (file.endsWith('.js') && file !== 'index.js') {
        try {
          const scriptName = file.replace('.js', '');
          const scriptPath = path.join(spiderDir, file);
          const module = require(scriptPath);
          
          // 提取脚本信息
          let name = scriptName;
          if (typeof module.getModuleName === 'function') {
            name = module.getModuleName();
          }
          
          let host = '';
          if (typeof module.getHost === 'function') {
            host = module.getHost();
          }
          
          let interval = 300;
          if (typeof module.getMidCount === 'function') {
            interval = module.getMidCount();
          }
          
          scripts.push({
            name: name,
            file: file,
            host: host,
            interval: interval,
            type: 'live' // 默认类型
          });
        } catch (error) {
          // 如果加载脚本失败，只添加基本信息
          const scriptName = file.replace('.js', '');
          scripts.push({
            name: scriptName,
            file: file,
            host: '',
            interval: 300,
            type: 'live'
          });
        }
      }
    });
    
    res.status(200).json(scripts);
  } catch (error) {
    res.status(500).json({ success: false, message: '获取本地脚本失败', error: error.message });
  }
});

// 从本地脚本添加爬虫
router.post('/add-from-local', authenticateToken, async (req, res) => {
  try {
    const { scriptName } = req.body;
    
    if (!scriptName) {
      return res.status(400).json({ success: false, message: '缺少脚本名称' });
    }
    
    // 检查脚本文件是否存在
    const fs = require('fs');
    const path = require('path');
    const scriptPath = path.join(__dirname, '../../bots/livebot/src/spider', `${scriptName}.js`);
    
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ success: false, message: '脚本文件不存在' });
    }
    
    // 读取脚本内容
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    
    // 加载脚本模块获取信息
    let name = scriptName;
    let host = '';
    let interval = 300;
    
    try {
      const module = require(scriptPath);
      
      // 提取脚本信息
      if (typeof module.getModuleName === 'function') {
        name = module.getModuleName();
      }
      
      if (typeof module.getHost === 'function') {
        host = module.getHost();
      }
      
      if (typeof module.getMidCount === 'function') {
        interval = module.getMidCount();
      }
    } catch (error) {
      // 忽略加载错误，使用默认值
    }
    
    // 构造爬虫数据
    const spiderData = {
      name: name,
      host: host,
      scriptContent: scriptContent,
      isEnabled: 1,
      type: 'live',
      crawlInterval: interval
    };
    
    // 检查是否已存在
    const [existing] = await db.execute('SELECT id FROM spider_configs WHERE name = ?', [name]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: '爬虫名称已存在' });
    }
    
    // 插入数据库
    await db.execute(
      'INSERT INTO spider_configs (name, type, host, crawlInterval, script_content, is_enabled) VALUES (?, ?, ?, ?, ?, ?)',
      [spiderData.name, spiderData.type, spiderData.host, spiderData.crawlInterval, spiderData.scriptContent, spiderData.isEnabled]
    );
    
    await logOperation(req, 'add', 'spider', 0, name, `从本地脚本添加爬虫: ${name}`);
    
    res.status(200).json({ success: true, message: '爬虫添加成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加爬虫失败', error: error.message });
  }
});

// 获取环境配置（包括代理）
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const { loadConfigFromDB } = require('../../bots/livebot/config');
    const config = await loadConfigFromDB();
    const currentEnv = config.environment;
    const envConfig = config[currentEnv];
    
    res.status(200).json({
      proxy: envConfig?.proxy || '',
      environment: currentEnv
    });
  } catch (error) {
    res.status(500).json({ message: '获取配置失败', error: error.message });
  }
});

// 检测代理是否可用
router.post('/check-proxy', authenticateToken, async (req, res) => {
  try {
    const { proxyUrl } = req.body;
    const systemManager = require('../services/tools/system-manager');
    const result = await systemManager.checkProxy(proxyUrl);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: '检测代理失败', error: error.message });
  }
});

// 影视搜索接口
router.get('/search/movies', authenticateToken, async (req, res) => {
  try {
    const { keyword, page = 1, pageSize = 10 } = req.query;
    
    if (!keyword) {
      return res.status(400).json({ success: false, message: '请输入搜索关键词' });
    }

    const axios = require('axios');
    
    // 测试用的模拟数据（当外部API不可用时返回）
    const mockMovies = [
      { id: 1, title: '爱情的故事', year: '2024', type: '爱情', rating: 8.5, desc: '一段跨越时空的爱情故事，讲述了两个人在不同时代相遇相知的感人经历', playUrl: '', downloadUrl: '' },
      { id: 2, title: '星际穿越', year: '2014', type: '科幻', rating: 9.3, desc: '在不远的未来，地球环境恶化，人类必须寻找新家园。宇航员穿越虫洞寻找适合人类居住的星球', playUrl: '', downloadUrl: '' },
      { id: 3, title: '盗梦空间', year: '2010', type: '科幻', rating: 9.4, desc: '一个能够进入他人梦境的盗贼，被委托执行一项几乎不可能完成的任务：在目标的潜意识中植入一个想法', playUrl: '', downloadUrl: '' },
      { id: 4, title: '肖申克的救赎', year: '1994', type: '剧情', rating: 9.7, desc: '一个银行家被诬陷杀害妻子及其情人，在监狱中度过了数十年，最终通过自己的智慧和毅力获得自由', playUrl: '', downloadUrl: '' },
      { id: 5, title: '阿甘正传', year: '1994', type: '剧情', rating: 9.5, desc: '智商只有75的阿甘，凭借自己的努力和善良，参与了美国历史上的许多重大事件', playUrl: '', downloadUrl: '' },
      { id: 6, title: '泰坦尼克号', year: '1997', type: '爱情', rating: 9.4, desc: '一段发生在豪华游轮上的凄美爱情故事，杰克和露丝的爱情感动了无数人', playUrl: '', downloadUrl: '' },
      { id: 7, title: '千与千寻', year: '2001', type: '动画', rating: 9.4, desc: '少女千寻误入神灵世界，为了拯救变成猪的父母，她必须在汤婆婆的澡堂工作', playUrl: '', downloadUrl: '' },
      { id: 8, title: '霸王别姬', year: '1993', type: '剧情', rating: 9.6, desc: '两个京剧演员从小一起长大，经历了中国近代史上的风风雨雨', playUrl: '', downloadUrl: '' },
      { id: 9, title: '阿甘正传', year: '1994', type: '剧情', rating: 9.5, desc: '智商只有75的阿甘，凭借自己的努力和善良，参与了美国历史上的许多重大事件', playUrl: '', downloadUrl: '' },
      { id: 10, title: '这个杀手不太冷', year: '1994', type: '动作', rating: 9.4, desc: '一个职业杀手和一个小女孩之间产生了特殊的感情，他们一起面对危险', playUrl: '', downloadUrl: '' }
    ];

    // 模拟搜索结果
    const filteredMovies = mockMovies.filter(movie => 
      movie.title.includes(keyword) || movie.type.includes(keyword)
    );

    // 分页处理
    const startIndex = (page - 1) * pageSize;
    const paginatedMovies = filteredMovies.slice(startIndex, startIndex + pageSize);

    res.status(200).json({
      success: true,
      list: paginatedMovies,
      total: filteredMovies.length,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    console.error('影视搜索失败:', error);
    res.status(500).json({ success: false, message: '搜索失败', error: error.message });
  }
});

module.exports = router;