const express = require('express');
const jwt = require('jsonwebtoken');
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

// 获取监控统计数据
router.get('/stats', authenticateToken, async (req, res) => {
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
        res.status(200).json({
          isRunning: true,
          systemInfo: {
            platform: 'win32',
            arch: 'x64',
            release: '10.0.19045',
            hostname: 'DESKTOP-123456',
            uptime: 3600,
            cpu: {
              count: 8
            },
            memory: {
              used: '4GB',
              total: '16GB'
            }
          },
          diskInfo: {
            used: '100GB',
            total: '500GB'
          },
          dbStatus: '正常'
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