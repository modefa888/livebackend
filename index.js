// 设置终端编码为 UTF-8（解决 Windows 终端中文乱码问题）
if (process.platform === 'win32') {
  process.env.LANG = 'zh_CN.UTF-8';
}

// 禁用 dotenv 提示信息
process.env.DOTENV_SILENCE = 'true';

const dotenv = require('dotenv');

// 加载环境变量（在所有 require 之前加载）
dotenv.config({
  path: './.env'
});

const express = require('express');
const cors = require('cors');
// 延迟导入 db 模块，确保环境变量已加载
let db;
const { logger, info, error, logRequest, logSpider, logBot, logSystem } = require('./src/utils/log-utils');
const authRoutes = require('./src/routes/auth');
const vtbsRoutes = require('./src/routes/vtbs');
const settingsRoutes = require('./src/routes/settings');
const logsRoutes = require('./src/routes/logs');
const usersRoutes = require('./src/routes/users');
const loginLogsRoutes = require('./src/routes/login-logs');
const { router: operationLogsRoutes } = require('./src/routes/operation-logs');
const monitorRoutes = require('./src/routes/monitor');
const spiderRoutes = require('./src/routes/spider');
const toolsRoutes = require('./src/routes/tools');
const botRoutes = require('./src/routes/bot');
const robotRoutes = require('./src/routes/robot');
const configRoutes = require('./src/routes/config');
const permissionRoutes = require('./src/routes/permission');
const pagesRoutes = require('./src/routes/pages');
const siteInfoRoutes = require('./src/routes/site-info');
const uploadSiteRoutes = require('./src/routes/upload-site');
const parseRecordsRoutes = require('./src/routes/parse-records');
const fabuBotRoutes = require('./src/routes/fabu-bot');
const spiderApiRoutes = require('./src/routes/spider-api');
const spiderDynamicRoutes = require('./src/routes/spider-dynamic');

// 导入爬虫接口动态加载器
const spiderLoader = require('./src/services/spider/spider-loader');

// 导入机器人管理模块
const { startBot, stopBot, getBotStatus } = require('./bots/livebot/bot');
const { startFabuBot, stopFabuBot, getFabuBotStatus } = require('./bots/fabuBot/bot');

// 导入机器人守护服务
const { getBotGuard } = require('./src/services/bot/bot-guard');

// 导入爬虫管理模块
const spiderManager = require('./src/services/spider/spider-manager');

// 导入影视资源监控模块
const { getVodSourceMonitor } = require('./src/services/vod-source-monitor');

const app = express();
const PORT = process.env[`${process.env.ENVIRONMENT.toUpperCase()}_BACKEND_PORT`] || 3002;

// 全局变量：记录请求次数
let requestCount = 0;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态资源服务
app.use('/images', express.static('public/images'));
app.use('/api/scripts', express.static('src/public/scripts'));

// 统计请求次数的中间件
app.use((req, res, next) => {
  requestCount++;
  next();
});

// 请求日志中间件
app.use(logRequest);

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/vtbs', vtbsRoutes);
app.use('/api/settings', settingsRoutes);
// 传递 requestCount 给 logs 路由
app.use('/api/logs', (req, res, next) => {
  req.requestCount = requestCount;
  next();
}, logsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/login-logs', loginLogsRoutes);
app.use('/api/operation-logs', operationLogsRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/spider', spiderRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/robot', robotRoutes);
app.use('/api/config', configRoutes);
app.use('/api/permission', permissionRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/site-info', siteInfoRoutes);
app.use('/api/parse-records', parseRecordsRoutes);
app.use('/api/fabu-bot', fabuBotRoutes);
app.use('/api/spider-api', spiderApiRoutes);
app.use('/spider-api', spiderDynamicRoutes);
app.use('/', uploadSiteRoutes);

// 根路径
app.get('/', (req, res) => {
  const botGuard = getBotGuard();
  res.json({
    success: true,
    message: '后端服务运行正常',
    data: {
      server: {
        status: 'running',
        port: PORT,
        requestCount: requestCount
      },
      livebot: getBotStatus(),
      fabuBot: getFabuBotStatus(),
      botGuard: botGuard.getStatus(),
      timestamp: new Date().toISOString()
    }
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 定义服务器实例变量，方便后续管理
let server;

// 优雅关闭函数
const gracefulShutdown = async (signal) => {
  info(`\n收到信号: ${signal}. 正在优雅关闭服务器...`);
  
  // 1. 停止接收新请求
  if (server) {
    server.close(async () => {
      info('HTTP 服务器已关闭');
      
      // 2. 停止 livebot 机器人
      try {
        await stopBot();
        info('livebot 已停止');
      } catch (err) {
        error('停止 livebot 出错:', err);
      }

      // 3. 停止 faBuBot 机器人
      try {
        await stopFabuBot();
        info('faBuBot 已停止');
      } catch (err) {
        error('停止 faBuBot 出错:', err);
      }

      // 4. 关闭数据库连接
      try {
        if (db.destroy) await db.destroy(); 
        info('数据库连接已关闭');
      } catch (err) {
        error('关闭数据库出错:', err);
      }

      // 5. 关闭爬虫管理
      try {
        await spiderManager.shutdown();
        info('爬虫服务已停止');
      } catch (err) {
        error('关闭爬虫服务出错:', err);
      }
      
      // 6. 关闭影视资源监控
      try {
        const vodSourceMonitor = getVodSourceMonitor();
        vodSourceMonitor.stop();
        info('影视资源监控已停止');
      } catch (err) {
        error('关闭影视资源监控出错:', err);
      }

      process.exit(0);
    });
  } else {
    process.exit(1);
  }
};

// 监听进程终止信号 (Ctrl+C 或 kill 命令)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 测试数据库连接并启动服务器
async function startServer() {
  try {
    // 动态导入 db 模块，确保环境变量已加载
    db = require('./src/config/db');
    
    // 测试数据库连接
    const connection = await db.getConnection();
    info('✅ 数据库连接成功');
    
    connection.release();
    
    // 启动服务器
    server = app.listen(PORT, async () => {
      const apiHost = process.env.API_HOST || 'http://localhost';
      const fullApiUrl = `${apiHost}:${PORT}`;
      info(`🚀 后端服务器运行在 ${fullApiUrl}`);
      info(`📡 完整 API 地址: ${fullApiUrl}`);
      
      // 初始化爬虫管理
      try {
        await spiderManager.initialize();
        info('✅ 爬虫管理器初始化完成');
      } catch (spiderError) {
        error('⚠️ 爬虫管理器初始化失败:', spiderError);
      }

      // 初始化爬虫接口动态加载器
      try {
        await spiderLoader.initialize();
        info('✅ 爬虫接口加载器初始化完成');
      } catch (spiderApiError) {
        error('⚠️ 爬虫接口加载器初始化失败:', spiderApiError);
      }

      // 启动机器人守护服务
      try {
        const botGuard = getBotGuard();
        await botGuard.start();
        info('✅ BotGuard 机器人守护服务启动完成');
      } catch (botGuardError) {
        error('⚠️ BotGuard 机器人守护服务启动失败:', botGuardError);
      }
      
      // 启动影视资源监控
      try {
        const vodSourceMonitor = getVodSourceMonitor();
        await vodSourceMonitor.start();
        info('✅ 影视资源自动测速监控启动完成');
      } catch (vodSourceError) {
        error('⚠️ 影视资源自动测速监控启动失败:', vodSourceError);
      }
    });

    // 监听端口占用错误
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        error(`❌ 启动失败: 端口 ${PORT} 已被占用`);
        info(`💡 提示: 请检查是否有其他程序正在使用端口 ${PORT}，或者尝试修改 .env 文件中的 BACKEND_PORT`);
        // 可以在这里选择自动退出，或者尝试使用另一个端口
        process.exit(1); 
      } else {
        error('❌ 服务器启动发生未知错误:', err);
        process.exit(1);
      }
    });

  } catch (err) {
    error('❌ 数据库连接失败:', err);
    process.exit(1);
  }
}

// 启动服务器
startServer();