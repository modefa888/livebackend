const express = require('express');
const jwt = require('jsonwebtoken');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const db = require('../config/db');

// 中间件：验证JWT令牌
const authenticateToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: '无效的认证令牌' });
  }
};

// 获取监控频率设置 - 必须在 /:type 之前定义
router.get('/interval', authenticateToken, async (req, res) => {
  const { type } = req.query;

  if (!type || (type !== 'live' && type !== 'spider')) {
    return res.status(400).json({ message: '无效的监控类型' });
  }

  try {
    res.status(200).json({
      success: true,
      interval: 5
    });
  } catch (error) {
    console.error('获取监控频率设置错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取监控统计数据（支持分页）
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const offset = (page - 1) * pageSize;
    
    const [stats] = await db.execute(
      'select * from monitorStats order by id desc limit ? offset ?',
      [parseInt(pageSize), parseInt(offset)]
    );
    
    const [countResult] = await db.execute('select count(*) as total from monitorStats');
    const total = countResult[0]?.total || 0;
    
    res.status(200).json({
      data: stats,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取监控统计数据错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取监控统计数据错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取监控历史记录
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const [stats] = await db.execute('select * from monitorStats order by id desc');
    res.status(200).json(stats);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取监控统计数据错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取监控统计数据错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取监控状态
router.get('/:type', authenticateToken, async (req, res) => {
  const { type } = req.params;

  try {
    switch (type) {
      case 'live':
        const [vtbs] = await db.execute('SELECT * FROM vtbs');
        const liveCount = vtbs.filter(vtb => vtb.liveStatus === '1').length;
        res.status(200).json({
          isRunning: true,
          totalCount: vtbs.length,
          liveCount: liveCount,
          statusList: vtbs.map(vtb => ({
            id: vtb.id,
            username: vtb.username,
            site: vtb.site,
            isLive: vtb.liveStatus === '1',
            targetUrl: vtb.targetUrl,
            updatedAt: vtb.updatedAt
          }))
        });
        break;
      case 'system':
        // 获取真实的系统信息
        const cpuCount = os.cpus().length;
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        
        // 计算 CPU 使用率（简单估算）
        const cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        cpus.forEach(cpu => {
          for (let type in cpu.times) {
            totalTick += cpu.times[type];
          }
          totalIdle += cpu.times.idle;
        });
        const cpuUsage = Math.round((1 - totalIdle / totalTick) * 100);
        
        // 格式化内存大小
        const formatBytes = (bytes) => {
          const gb = bytes / (1024 * 1024 * 1024);
          return `${gb.toFixed(1)}GB`;
        };
        
        // 获取磁盘空间信息
        const getDiskInfo = () => {
          return new Promise((resolve) => {
            const platform = os.platform();
            
            if (platform === 'win32') {
              // Windows 系统：获取后端运行盘符
              const driveLetter = process.cwd().substring(0, 2);
              exec(`wmic logicaldisk where "DeviceID='${driveLetter}'" get Size,FreeSpace /value`, (error, stdout) => {
                if (error) {
                  resolve({ used: 'N/A', total: 'N/A', usage: 0 });
                  return;
                }
                
                const freeMatch = stdout.match(/FreeSpace=(\d+)/);
                const sizeMatch = stdout.match(/Size=(\d+)/);
                
                if (freeMatch && sizeMatch) {
                  const freeBytes = parseInt(freeMatch[1]);
                  const totalBytes = parseInt(sizeMatch[1]);
                  const usedBytes = totalBytes - freeBytes;
                  const usage = Math.round((usedBytes / totalBytes) * 100);
                  
                  resolve({
                    used: formatBytes(usedBytes),
                    total: formatBytes(totalBytes),
                    usage: usage
                  });
                } else {
                  resolve({ used: 'N/A', total: 'N/A', usage: 0 });
                }
              });
            } else {
              // Linux/Mac 系统：获取根目录磁盘空间
              exec(`df -h /`, (error, stdout) => {
                if (error) {
                  resolve({ used: 'N/A', total: 'N/A', usage: 0 });
                  return;
                }
                
                const lines = stdout.trim().split('\n');
                if (lines.length >= 2) {
                  const parts = lines[1].split(/\s+/);
                  const total = parts[1];
                  const used = parts[2];
                  const usagePercent = parseInt(parts[4]);
                  
                  resolve({
                    used: used,
                    total: total,
                    usage: usagePercent
                  });
                } else {
                  resolve({ used: 'N/A', total: 'N/A', usage: 0 });
                }
              });
            }
          });
        };
        
        // 检查数据库连接状态
        let dbStatus = '正常';
        try {
          const connection = await db.getConnection();
          connection.release();
        } catch (err) {
          dbStatus = '异常';
        }
        
        // 获取磁盘信息
        const diskInfo = await getDiskInfo();
        
        res.status(200).json({
          isRunning: true,
          systemInfo: {
            platform: os.platform(),
            arch: os.arch(),
            release: os.release(),
            hostname: os.hostname(),
            uptime: Math.floor(os.uptime()),
            cpu: {
              count: cpuCount,
              usage: cpuUsage
            },
            memory: {
              used: formatBytes(usedMemory),
              total: formatBytes(totalMemory),
              usage: Math.round((usedMemory / totalMemory) * 100)
            }
          },
          diskInfo: diskInfo,
          dbStatus: dbStatus
        });
        break;
      case 'spider':
        res.status(200).json({
          isRunning: true,
          totalCount: 27,
          runningCount: 15,
          statusList: [
            { id: 1, name: 'bilibili', type: 'live', isRunning: true, url: 'https://live.bilibili.com' },
            { id: 2, name: 'douyu', type: 'live', isRunning: false, url: 'https://www.douyu.com' },
            { id: 3, name: 'huya', type: 'live', isRunning: true, url: 'https://www.huya.com' }
          ]
        });
        break;
      default:
        res.status(400).json({ message: '无效的监控类型' });
        break;
    }
  } catch (error) {
    console.error('获取监控状态错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 启动监控
router.post('/start', authenticateToken, async (req, res) => {
  const { type } = req.body;

  try {
    console.log(`启动${type}监控`);
    res.status(200).json({ message: '监控启动成功' });
  } catch (error) {
    console.error('启动监控错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 停止监控
router.post('/stop', authenticateToken, async (req, res) => {
  const { type } = req.body;

  try {
    console.log(`停止${type}监控`);
    res.status(200).json({ message: '监控停止成功' });
  } catch (error) {
    console.error('停止监控错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 设置监控频率
router.post('/interval', authenticateToken, async (req, res) => {
  const { type, minutes } = req.body;

  try {
    console.log(`设置${type}监控频率为${minutes}分钟`);
    res.status(200).json({ message: '监控频率设置成功' });
  } catch (error) {
    console.error('设置监控频率错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;