const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const multer = require('multer');
const taskScheduler = require('../services/tools/task-scheduler');
const systemManager = require('../services/tools/system-manager');
const db = require('../config/db');

// 配置multer存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 临时存储目录
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      try {
        fs.mkdirSync(tempDir, { recursive: true });
      } catch (error) {
        console.error('创建临时目录失败:', error);
        return cb(error);
      }
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // 使用时间戳和随机字符串作为文件名，避免中文编码问题
    const safeFilename = Date.now() + '-' + Math.random().toString(36).substring(2, 10) + path.extname(file.originalname);
    cb(null, safeFilename);
  }
});

// 创建multer实例
const upload = multer({ storage: storage });

// 检查后端路径是否需要排除
const shouldExcludeBackend = (filePath, baseDir) => {
  const relativePath = path.relative(baseDir, filePath);
  const pathParts = relativePath.split(path.sep);
  
  // 排除的目录和文件
  const excludePaths = ['node_modules', 'backups', 'log', '.git'];
  const excludeFiles = ['package-lock.json'];
  
  // 检查目录
  for (const excludeDir of excludePaths) {
    if (pathParts.includes(excludeDir)) {
      return true;
    }
  }
  
  // 检查文件
  const fileName = path.basename(filePath);
  if (excludeFiles.includes(fileName)) {
    return true;
  }
  
  return false;
};

// 检查前端路径是否需要排除
const shouldExcludeFrontend = (filePath, baseDir) => {
  const relativePath = path.relative(baseDir, filePath);
  const pathParts = relativePath.split(path.sep);
  
  // 排除的目录和文件
  const excludePaths = ['node_modules', 'backups', 'log', '.git'];
  const excludeFiles = ['package-lock.json'];
  
  // 检查目录
  for (const excludeDir of excludePaths) {
    if (pathParts.includes(excludeDir)) {
      return true;
    }
  }
  
  // 检查文件
  const fileName = path.basename(filePath);
  if (excludeFiles.includes(fileName)) {
    return true;
  }
  
  return false;
};

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
const verifyAdmin = async (req, res, next) => {
  if (req.user.permissionLevel < 2) {
    return res.status(403).json({ message: '权限不足' });
  }
  next();
};

// 定时任务相关路由

// 获取定时任务状态
router.get('/tasks/status', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const status = await taskScheduler.getTaskStatus();
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ message: '获取定时任务状态失败', error: error.message });
  }
});

// 获取所有定时任务配置
router.get('/tasks/configs', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const [taskConfigs] = await db.execute('SELECT * FROM scheduled_tasks');
    res.status(200).json(taskConfigs);
  } catch (error) {
    res.status(500).json({ message: '获取定时任务配置失败', error: error.message });
  }
});

// 获取任务执行日志
router.get('/tasks/logs', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { taskId, limit = 50 } = req.query;
    let query = 'SELECT * FROM task_execution_logs';
    const params = [];

    if (taskId) {
      query += ' WHERE taskId = ?';
      params.push(taskId);
    }

    query += ' ORDER BY createdAt DESC LIMIT ?';
    params.push(limit);

    const [logs] = await db.execute(query, params);
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: '获取任务执行日志失败', error: error.message });
  }
});

// 添加定时任务
router.post('/tasks/add', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const config = req.body;
    const result = await taskScheduler.addTask(config);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '添加定时任务失败', error: error.message });
  }
});

// 删除定时任务
router.delete('/tasks/:id', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await taskScheduler.deleteTask(parseInt(id));

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '删除定时任务失败', error: error.message });
  }
});

// 更新定时任务
router.put('/tasks/:id', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const config = req.body;
    const result = await taskScheduler.updateTask(parseInt(id), config);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '更新定时任务失败', error: error.message });
  }
});

// 启动所有定时任务
router.post('/tasks/start-all', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    await taskScheduler.startAllTasks();
    res.status(200).json({ success: true, message: '所有定时任务已启动' });
  } catch (error) {
    res.status(500).json({ message: '启动所有定时任务失败', error: error.message });
  }
});

// 停止所有定时任务
router.post('/tasks/stop-all', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    await taskScheduler.stopAllTasks();
    res.status(200).json({ success: true, message: '所有定时任务已停止' });
  } catch (error) {
    res.status(500).json({ message: '停止所有定时任务失败', error: error.message });
  }
});

// 系统管理相关路由

// 获取系统状态
router.get('/system/status', authenticateToken, async (req, res) => {
  try {
    const status = await systemManager.getSystemStatus();
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ message: '获取系统状态失败', error: error.message });
  }
});

// 备份数据库
router.post('/system/backup', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const result = await systemManager.backupDatabase(req.user.username);
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '备份数据库失败', error: error.message });
  }
});

// 获取备份记录
router.get('/system/backup-records', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const [records] = await db.execute(
      'SELECT id, backupFileName, backupPath, fileSize, backupTime, createdBy, type, compressedFileName, compressedPath, compressedSize FROM backup_records ORDER BY backupTime DESC LIMIT ?',
      [limit]
    );
    res.status(200).json(records);
  } catch (error) {
    res.status(500).json({ message: '获取备份记录失败', error: error.message });
  }
});

// 下载备份文件
router.get('/system/backup/:id', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { type = 'auto' } = req.query;

    const [records] = await db.execute(
      'SELECT backupFileName, backupPath, fileSize, type as backupType, compressedFileName, compressedPath, compressedSize FROM backup_records WHERE id = ?',
      [id]
    );

    if (records.length === 0) {
      return res.status(404).json({ message: '备份文件不存在' });
    }

    const { backupFileName, backupPath, backupType, compressedFileName, compressedPath } = records[0];

    let downloadPath, downloadName;

    if (type === 'compressed') {
      if (!compressedPath || !fs.existsSync(compressedPath)) {
        return res.status(404).json({ message: '压缩文件不存在' });
      }
      downloadPath = compressedPath;
      downloadName = compressedFileName;
    } else if (type === 'original') {
      if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ message: '备份文件不存在' });
      }
      downloadPath = backupPath;
      downloadName = backupFileName;
    } else {
      if (backupType === 'database' || backupFileName.endsWith('.sql')) {
        if (!fs.existsSync(backupPath)) {
          return res.status(404).json({ message: '备份文件不存在' });
        }
        downloadPath = backupPath;
        downloadName = backupFileName;
      } else {
        if (compressedPath && fs.existsSync(compressedPath)) {
          downloadPath = compressedPath;
          downloadName = compressedFileName;
        } else if (fs.existsSync(backupPath)) {
          downloadPath = backupPath;
          downloadName = backupFileName;
        } else {
          return res.status(404).json({ message: '备份文件不存在' });
        }
      }
    }

    const mimeType = require('mime-types').lookup(downloadPath) || 'application/octet-stream';
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    res.setHeader('Content-Type', mimeType);
    
    const fileStream = fs.createReadStream(downloadPath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ message: '下载备份文件失败', error: error.message });
  }
});

// 获取前后端代码备份记录
router.get('/system/code-backup-records', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const [records] = await db.execute(
      'SELECT id, backupFileName, backupPath, fileSize, backupTime, createdBy FROM backup_records ORDER BY backupTime DESC LIMIT ?',
      [limit]
    );
    
    const backupRecords = records.map(record => {
      let type = '数据库';
      if (record.backupFileName.startsWith('备份') && !record.backupFileName.startsWith('前端备份')) {
        type = '后端';
      } else if (record.backupFileName.startsWith('前端备份')) {
        type = '前端';
      }
      
      return {
        ...record,
        type: type
      };
    });
    
    res.status(200).json(backupRecords);
  } catch (error) {
    res.status(500).json({ message: '获取代码备份记录失败', error: error.message });
  }
});

// 清理日志
router.post('/system/cleanup-logs', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const result = await systemManager.cleanupLogs();
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '清理日志失败', error: error.message });
  }
});

// 重启服务
router.post('/system/restart', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const result = await systemManager.restartService();
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '重启服务失败', error: error.message });
  }
});

// 获取配置信息
router.get('/system/config', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const result = await systemManager.getConfigInfo();
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '获取配置信息失败', error: error.message });
  }
});

// 更新配置
router.put('/system/config', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const config = req.body;
    const result = await systemManager.updateConfig(config);
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ message: '更新配置失败', error: error.message });
  }
});

// 检测代理是否可用
router.post('/system/check-proxy', authenticateToken, async (req, res) => {
  try {
    const { proxyUrl } = req.body;
    if (!proxyUrl) {
      return res.status(400).json({ message: '请提供代理地址' });
    }
    const result = await systemManager.checkProxy(proxyUrl);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: '代理检测失败', error: error.message });
  }
});

// 更新后端代码
router.post('/system/update-backend', authenticateToken, verifyAdmin, upload.array('files'), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: '请选择要上传的文件' });
    }
    
    const backendDir = path.join(__dirname, '..', '..');
    const uploadedFiles = [];
    
    for (const file of files) {
      const targetPath = path.join(backendDir, file.originalname);
      
      if (shouldExcludeBackend(targetPath, backendDir)) {
        fs.unlinkSync(file.path);
        continue;
      }
      
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      fs.renameSync(file.path, targetPath);
      uploadedFiles.push(file.originalname);
    }
    
    const tempDir = path.join(__dirname, '../temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    res.status(200).json({
      success: true,
      message: '后端代码更新成功',
      files: uploadedFiles
    });
  } catch (error) {
    if (req.files) {
      for (const file of req.files) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }
    
    const tempDir = path.join(__dirname, '../temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    res.status(500).json({ success: false, message: '更新后端代码失败', error: error.message });
  }
});

// 扫描后端代码
router.get('/system/scan-backend', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const backendDir = path.join(__dirname, '..', '..');
    const files = [];
    const excludedFiles = [];
    
    const scanDirectory = (dir, relativePath = '') => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dir, item.name);
        const itemRelativePath = path.join(relativePath, item.name);
        
        if (shouldExcludeBackend(itemPath, backendDir)) {
          excludedFiles.push(itemRelativePath);
          continue;
        }
        
        if (item.isDirectory()) {
          scanDirectory(itemPath, itemRelativePath);
        } else {
          const stats = fs.statSync(itemPath);
          files.push({
            path: itemRelativePath,
            size: stats.size,
            modified: stats.mtime.toISOString()
          });
        }
      }
    };
    
    scanDirectory(backendDir);
    
    res.status(200).json({
      success: true,
      message: '后端代码扫描成功',
      files: files,
      excludedFiles: excludedFiles
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '扫描后端代码失败', error: error.message });
  }
});

// 扫描前端代码
router.get('/system/scan-frontend', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const backendDir = path.join(__dirname, '..', '..');
    const frontendDir = path.join(backendDir, '..', 'frontend');
    const files = [];
    const excludedFiles = [];
    
    const scanDirectory = (dir, relativePath = '') => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dir, item.name);
        const itemRelativePath = path.join(relativePath, item.name);
        
        if (shouldExcludeFrontend(itemPath, frontendDir)) {
          excludedFiles.push(itemRelativePath);
          continue;
        }
        
        if (item.isDirectory()) {
          scanDirectory(itemPath, itemRelativePath);
        } else {
          const stats = fs.statSync(itemPath);
          files.push({
            path: itemRelativePath,
            size: stats.size,
            modified: stats.mtime.toISOString()
          });
        }
      }
    };
    
    scanDirectory(frontendDir);
    
    res.status(200).json({
      success: true,
      message: '前端代码扫描成功',
      files: files,
      excludedFiles: excludedFiles
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '扫描前端代码失败', error: error.message });
  }
});

// 备份后端代码
router.post('/system/backup-backend', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const backendDir = path.join(__dirname, '..', '..');
    const backupsDir = path.join(backendDir, 'backups');
    
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    const backupName = `后端备份${timestamp}`;
    const backupPath = path.join(backupsDir, backupName);
    
    let totalSize = 0;
    
    const copyDirectory = (dir, relativePath = '') => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dir, item.name);
        const itemRelativePath = path.join(relativePath, item.name);
        const destPath = path.join(backupPath, itemRelativePath);
        
        if (shouldExcludeBackend(itemPath, backendDir)) {
          continue;
        }
        
        if (item.isDirectory()) {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          copyDirectory(itemPath, itemRelativePath);
        } else {
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          fs.copyFileSync(itemPath, destPath);
          const stats = fs.statSync(itemPath);
          totalSize += stats.size;
        }
      }
    };
    
    copyDirectory(backendDir);
    
    const compressedFileName = backupName + '.zip';
    const compressedPath = path.join(backupsDir, compressedFileName);
    
    await new Promise((resolve, reject) => {
      const archiver = require('archiver');
      const output = fs.createWriteStream(compressedPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => {
        resolve();
      });
      
      archive.on('error', (err) => {
        reject(err);
      });
      
      archive.pipe(output);
      archive.directory(backupPath, backupName);
      archive.finalize();
    });
    
    const compressedStats = fs.statSync(compressedPath);
    const compressedSize = compressedStats.size;
    
    try {
      await db.execute(
        'INSERT INTO backup_records (backupFileName, backupPath, fileSize, createdBy, type, compressedFileName, compressedPath, compressedSize) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [backupName, backupPath, totalSize, req.user.username, 'backend', compressedFileName, compressedPath, compressedSize]
      );
    } catch (dbError) {
      console.error('保存备份记录失败:', dbError);
    }
    
    res.status(200).json({
      success: true,
      message: '后端代码备份成功',
      backupPath: backupPath,
      backupSize: totalSize,
      compressedPath: compressedPath,
      compressedSize: compressedSize
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '备份后端代码失败', error: error.message });
  }
});

// 一键备份前后端代码
router.post('/system/backup-both', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const backendDir = path.join(__dirname, '..', '..');
    const frontendDir = path.join(backendDir, '..', 'frontend');
    
    const backendBackupsDir = path.join(backendDir, 'backups');
    if (!fs.existsSync(backendBackupsDir)) {
      fs.mkdirSync(backendBackupsDir, { recursive: true });
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    const backendBackupName = `后端备份${timestamp}`;
    const backendBackupPath = path.join(backendBackupsDir, backendBackupName);
    
    let backendTotalSize = 0;
    
    const copyBackendDirectory = (dir, relativePath = '') => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dir, item.name);
        const itemRelativePath = path.join(relativePath, item.name);
        const destPath = path.join(backendBackupPath, itemRelativePath);
        
        if (shouldExcludeBackend(itemPath, backendDir)) {
          continue;
        }
        
        if (item.isDirectory()) {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          copyBackendDirectory(itemPath, itemRelativePath);
        } else {
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          fs.copyFileSync(itemPath, destPath);
          const stats = fs.statSync(itemPath);
          backendTotalSize += stats.size;
        }
      }
    };
    
    copyBackendDirectory(backendDir);
    
    const backendCompressedFileName = backendBackupName + '.zip';
    const backendCompressedPath = path.join(backendBackupsDir, backendCompressedFileName);
    
    await new Promise((resolve, reject) => {
      const archiver = require('archiver');
      const output = fs.createWriteStream(backendCompressedPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => {
        resolve();
      });
      
      archive.on('error', (err) => {
        reject(err);
      });
      
      archive.pipe(output);
      archive.directory(backendBackupPath, backendBackupName);
      archive.finalize();
    });
    
    const backendCompressedStats = fs.statSync(backendCompressedPath);
    const backendCompressedSize = backendCompressedStats.size;
    
    try {
      await db.execute(
        'INSERT INTO backup_records (backupFileName, backupPath, fileSize, createdBy, type, compressedFileName, compressedPath, compressedSize) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [backendBackupName, backendBackupPath, backendTotalSize, req.user.username, 'backend', backendCompressedFileName, backendCompressedPath, backendCompressedSize]
      );
    } catch (dbError) {
      console.error('保存后端备份记录失败:', dbError);
    }
    
    const frontendBackupsDir = path.join(frontendDir, 'backups');
    if (!fs.existsSync(frontendBackupsDir)) {
      fs.mkdirSync(frontendBackupsDir, { recursive: true });
    }
    
    const frontendBackupName = `前端备份${timestamp}`;
    const frontendBackupPath = path.join(frontendBackupsDir, frontendBackupName);
    
    let frontendTotalSize = 0;
    
    const copyFrontendDirectory = (dir, relativePath = '') => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dir, item.name);
        const itemRelativePath = path.join(relativePath, item.name);
        const destPath = path.join(frontendBackupPath, itemRelativePath);
        
        if (shouldExcludeFrontend(itemPath, frontendDir)) {
          continue;
        }
        
        if (item.isDirectory()) {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          copyFrontendDirectory(itemPath, itemRelativePath);
        } else {
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          fs.copyFileSync(itemPath, destPath);
          const stats = fs.statSync(itemPath);
          frontendTotalSize += stats.size;
        }
      }
    };
    
    copyFrontendDirectory(frontendDir);
    
    const frontendCompressedFileName = frontendBackupName + '.zip';
    const frontendCompressedPath = path.join(frontendBackupsDir, frontendCompressedFileName);
    
    await new Promise((resolve, reject) => {
      const archiver = require('archiver');
      const output = fs.createWriteStream(frontendCompressedPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => {
        resolve();
      });
      
      archive.on('error', (err) => {
        reject(err);
      });
      
      archive.pipe(output);
      archive.directory(frontendBackupPath, frontendBackupName);
      archive.finalize();
    });
    
    const frontendCompressedStats = fs.statSync(frontendCompressedPath);
    const frontendCompressedSize = frontendCompressedStats.size;
    
    try {
      await db.execute(
        'INSERT INTO backup_records (backupFileName, backupPath, fileSize, createdBy, type, compressedFileName, compressedPath, compressedSize) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [frontendBackupName, frontendBackupPath, frontendTotalSize, req.user.username, 'frontend', frontendCompressedFileName, frontendCompressedPath, frontendCompressedSize]
      );
    } catch (dbError) {
      console.error('保存前端备份记录失败:', dbError);
    }
    
    res.status(200).json({
      success: true,
      message: '前后端代码备份成功',
      backendBackup: {
        backupPath: backendBackupPath,
        backupSize: backendTotalSize,
        compressedPath: backendCompressedPath,
        compressedSize: backendCompressedSize
      },
      frontendBackup: {
        backupPath: frontendBackupPath,
        backupSize: frontendTotalSize,
        compressedPath: frontendCompressedPath,
        compressedSize: frontendCompressedSize
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '备份前后端代码失败', error: error.message });
  }
});

// 备份前端代码
router.post('/system/backup-frontend', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const backendDir = path.join(__dirname, '..', '..');
    const frontendDir = path.join(backendDir, '..', 'frontend');
    const backupsDir = path.join(frontendDir, 'backups');
    
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    const backupName = `前端备份${timestamp}`;
    const backupPath = path.join(backupsDir, backupName);
    
    let totalSize = 0;
    
    const copyDirectory = (dir, relativePath = '') => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dir, item.name);
        const itemRelativePath = path.join(relativePath, item.name);
        const destPath = path.join(backupPath, itemRelativePath);
        
        if (shouldExcludeFrontend(itemPath, frontendDir)) {
          continue;
        }
        
        if (item.isDirectory()) {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          copyDirectory(itemPath, itemRelativePath);
        } else {
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          fs.copyFileSync(itemPath, destPath);
          const stats = fs.statSync(itemPath);
          totalSize += stats.size;
        }
      }
    };
    
    copyDirectory(frontendDir);
    
    const compressedFileName = backupName + '.zip';
    const compressedPath = path.join(backupsDir, compressedFileName);
    
    await new Promise((resolve, reject) => {
      const archiver = require('archiver');
      const output = fs.createWriteStream(compressedPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => {
        resolve();
      });
      
      archive.on('error', (err) => {
        reject(err);
      });
      
      archive.pipe(output);
      archive.directory(backupPath, backupName);
      archive.finalize();
    });
    
    const compressedStats = fs.statSync(compressedPath);
    const compressedSize = compressedStats.size;
    
    try {
      await db.execute(
        'INSERT INTO backup_records (backupFileName, backupPath, fileSize, createdBy, type, compressedFileName, compressedPath, compressedSize) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [backupName, backupPath, totalSize, req.user.username, 'frontend', compressedFileName, compressedPath, compressedSize]
      );
    } catch (dbError) {
      console.error('保存备份记录失败:', dbError);
    }
    
    res.status(200).json({
      success: true,
      message: '前端代码备份成功',
      backupPath: backupPath,
      backupSize: totalSize,
      compressedPath: compressedPath,
      compressedSize: compressedSize
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '备份前端代码失败', error: error.message });
  }
});


// 版本控制相关路由

// 检查是否已初始化 Git 仓库
const checkGitInitialized = (dir) => {
  const gitDir = path.join(dir, '.git');
  return fs.existsSync(gitDir);
};

// 初始化 Git 仓库
router.post('/system/git/init', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type } = req.body;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库已初始化' });
    }
    
    const { execSync } = require('child_process');
    
    execSync('git init', { cwd: targetDir });
    
    const gitignoreContent = type === 'frontend' 
      ? `node_modules
backups
log
package-lock.json
dist
.env
.env.*
!.env.example
` 
      : `node_modules
backups
log
package-lock.json
.env
.env.*
!.env.example
`;
    
    fs.writeFileSync(path.join(targetDir, '.gitignore'), gitignoreContent);
    
    execSync('git add .', { cwd: targetDir });
    execSync('git commit -m "Initial commit"', { cwd: targetDir });
    
    res.status(200).json({ success: true, message: 'Git 仓库初始化成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '初始化 Git 仓库失败', error: error.message });
  }
});

// 获取 Git 状态
router.get('/system/git/status', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type } = req.query;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    const { execSync } = require('child_process');
    
    const status = execSync('git status --porcelain', { cwd: targetDir, encoding: 'utf-8' });
    
    const branch = execSync('git branch --show-current', { cwd: targetDir, encoding: 'utf-8' }).trim();
    
    const lastCommit = execSync('git log -1 --pretty=format:"%h - %s (%ar)"', { cwd: targetDir, encoding: 'utf-8' });
    
    res.status(200).json({ 
      success: true, 
      status: status,
      branch: branch,
      lastCommit: lastCommit,
      isInitialized: true
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取 Git 状态失败', error: error.message });
  }
});

// 提交更改
router.post('/system/git/commit', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type, message } = req.body;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    const { execSync } = require('child_process');
    
    execSync('git add .', { cwd: targetDir });
    execSync(`git commit -m "${message || 'Update'}"`, { cwd: targetDir });
    
    const commitHash = execSync('git rev-parse --short HEAD', { cwd: targetDir, encoding: 'utf-8' }).trim();
    
    res.status(200).json({ 
      success: true, 
      message: '提交成功',
      commitHash: commitHash
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '提交失败', error: error.message });
  }
});

// 获取提交历史
router.get('/system/git/log', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type, limit = 20 } = req.query;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    const { execSync } = require('child_process');
    
    const log = execSync(
      `git log -${limit} --pretty=format:"%h|%s|%an|%ar"`, 
      { cwd: targetDir, encoding: 'utf-8' }
    );
    
    const commits = log.split('\n').map(line => {
      const [hash, message, author, time] = line.split('|');
      return { hash, message, author, time };
    });
    
    res.status(200).json({ success: true, commits: commits });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取提交历史失败', error: error.message });
  }
});

// 检出特定提交
router.post('/system/git/checkout', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type, commitHash } = req.body;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    const { execSync } = require('child_process');
    
    execSync(`git checkout ${commitHash}`, { cwd: targetDir });
    
    res.status(200).json({ success: true, message: '检出成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '检出失败', error: error.message });
  }
});

// 获取远程仓库配置
router.get('/system/git/remote', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type } = req.query;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    const { execSync } = require('child_process');
    
    let remoteUrl = '';
    try {
      remoteUrl = execSync('git remote get-url origin', { cwd: targetDir, encoding: 'utf-8' }).trim();
    } catch (error) {
    }
    
    res.status(200).json({ success: true, remoteUrl: remoteUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取远程仓库配置失败', error: error.message });
  }
});

// 设置远程仓库
router.post('/system/git/remote', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type, remoteUrl } = req.body;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    const { execSync } = require('child_process');
    
    let hasOrigin = false;
    try {
      execSync('git remote get-url origin', { cwd: targetDir });
      hasOrigin = true;
    } catch (error) {
    }
    
    if (hasOrigin) {
      execSync(`git remote set-url origin ${remoteUrl}`, { cwd: targetDir });
    } else {
      execSync(`git remote add origin ${remoteUrl}`, { cwd: targetDir });
    }
    
    res.status(200).json({ success: true, message: '远程仓库设置成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '设置远程仓库失败', error: error.message });
  }
});

// 推送到远程仓库
router.post('/system/git/push', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type } = req.body;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    const { execSync } = require('child_process');
    
    let hasOrigin = false;
    try {
      execSync('git remote get-url origin', { cwd: targetDir });
      hasOrigin = true;
    } catch (error) {
      return res.status(400).json({ success: false, message: '请先设置远程仓库' });
    }
    
    let branch = execSync('git branch --show-current', { cwd: targetDir, encoding: 'utf-8' }).trim();
    
    if (!branch) {
      branch = 'main';
      execSync(`git checkout -b ${branch}`, { cwd: targetDir });
    }
    
    execSync(`git push -u origin ${branch}`, { cwd: targetDir });
    
    res.status(200).json({ success: true, message: '推送成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '推送失败', error: error.message });
  }
});

// 从远程仓库拉取
router.post('/system/git/pull', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type } = req.body;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    const { execSync } = require('child_process');
    
    let hasOrigin = false;
    try {
      execSync('git remote get-url origin', { cwd: targetDir });
      hasOrigin = true;
    } catch (error) {
      return res.status(400).json({ success: false, message: '请先设置远程仓库' });
    }
    
    execSync('git pull', { cwd: targetDir });
    
    res.status(200).json({ success: true, message: '拉取成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '拉取失败', error: error.message });
  }
});

// 删除远程分支
router.post('/system/git/delete-branch', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type, branchName } = req.body;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    if (!branchName) {
      return res.status(400).json({ success: false, message: '请提供要删除的分支名称' });
    }
    
    const { execSync } = require('child_process');
    
    let hasOrigin = false;
    try {
      execSync('git remote get-url origin', { cwd: targetDir });
      hasOrigin = true;
    } catch (error) {
      return res.status(400).json({ success: false, message: '请先设置远程仓库' });
    }
    
    execSync(`git push origin --delete ${branchName}`, { cwd: targetDir });
    
    res.status(200).json({ success: true, message: `分支 ${branchName} 删除成功` });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除分支失败', error: error.message });
  }
});

// 获取远程分支列表
router.get('/system/git/branches', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type } = req.query;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    const { execSync } = require('child_process');
    
    const branches = execSync('git branch -r', { cwd: targetDir, encoding: 'utf-8' })
      .trim()
      .split('\n')
      .map(line => line.trim().replace(/^origin\//, ''))
      .filter(branch => branch);
    
    const currentBranch = execSync('git branch --show-current', { cwd: targetDir, encoding: 'utf-8' }).trim();
    
    let defaultBranch = branches.includes('main') ? 'main' : (branches.includes('master') ? 'master' : branches[0] || 'main');
    try {
      const headRef = execSync('git symbolic-ref refs/remotes/origin/HEAD', { cwd: targetDir, encoding: 'utf-8', timeout: 5000 }).trim();
      const detectedBranch = headRef.replace('refs/remotes/origin/', '');
      if (detectedBranch && branches.includes(detectedBranch)) {
        defaultBranch = detectedBranch;
      }
    } catch (error) {
      console.log('无法检测远程默认分支，使用默认值:', defaultBranch);
    }
    
    res.status(200).json({ 
      success: true, 
      branches: branches,
      currentBranch: currentBranch,
      defaultBranch: defaultBranch
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取分支列表失败', error: error.message });
  }
});

// 切换分支
router.post('/system/git/checkout-branch', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type, branchName } = req.body;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    if (!branchName) {
      return res.status(400).json({ success: false, message: '请提供分支名称' });
    }
    
    const { execSync } = require('child_process');
    
    execSync(`git checkout ${branchName}`, { cwd: targetDir });
    
    res.status(200).json({ success: true, message: `已切换到分支 ${branchName}` });
  } catch (error) {
    res.status(500).json({ success: false, message: '切换分支失败', error: error.message });
  }
});

// 重命名分支
router.post('/system/git/rename-branch', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type, oldName, newName } = req.body;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    if (!oldName || !newName) {
      return res.status(400).json({ success: false, message: '请提供原分支名称和新分支名称' });
    }
    
    const { execSync } = require('child_process');
    
    if (oldName === newName) {
      return res.status(200).json({ success: true, message: '新名称与原名称相同' });
    }
    
    execSync(`git branch -m ${oldName} ${newName}`, { cwd: targetDir });
    
    try {
      execSync(`git push origin :${oldName}`, { cwd: targetDir });
      execSync(`git push origin ${newName}`, { cwd: targetDir });
    } catch (error) {
      console.log('远程分支重命名失败，可能远程不存在该分支');
    }
    
    res.status(200).json({ 
      success: true, 
      message: `分支 ${oldName} 重命名为 ${newName} 成功`,
      oldBranch: oldName,
      newBranch: newName
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '重命名分支失败', error: error.message });
  }
});

// 从Git中移除文件
router.post('/system/git/remove-file', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type, filePath, alsoDeleteLocal = false } = req.body;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    const { execSync } = require('child_process');
    
    execSync(`git filter-branch --force --index-filter "git rm --cached --ignore-unmatch ${filePath}" --prune-empty --tag-name-filter cat -- --all`, { 
      cwd: targetDir,
      timeout: 60000
    });
    
    if (alsoDeleteLocal) {
      const fullPath = path.join(targetDir, filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    
    res.status(200).json({ 
      success: true, 
      message: `已从Git历史中移除 ${filePath}`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '移除文件失败', error: error.message });
  }
});

// 重置Git仓库（清除所有历史并重新初始化）
router.post('/system/git/reset', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { type, initialCommitMessage = 'Initial commit' } = req.body;
    const rootDir = path.join(__dirname, '..', '..');
    const targetDir = type === 'frontend' 
      ? path.join(rootDir, '..', 'frontend') 
      : rootDir;
    
    if (!checkGitInitialized(targetDir)) {
      return res.status(400).json({ success: false, message: 'Git 仓库未初始化' });
    }
    
    const { execSync } = require('child_process');
    const gitDir = path.join(targetDir, '.git');
    
    let remoteUrl = '';
    try {
      remoteUrl = execSync('git remote get-url origin', { cwd: targetDir, encoding: 'utf-8' }).trim();
    } catch (e) {
    }
    
    if (fs.existsSync(gitDir)) {
      fs.rmSync(gitDir, { recursive: true, force: true });
    }
    
    execSync('git init', { cwd: targetDir });
    
    if (fs.existsSync(path.join(targetDir, '.gitignore'))) {
      execSync('git add .gitignore', { cwd: targetDir });
    }
    
    execSync('git add .', { cwd: targetDir });
    
    execSync(`git commit -m "${initialCommitMessage}"`, { cwd: targetDir });
    
    if (remoteUrl) {
      execSync(`git remote add origin ${remoteUrl}`, { cwd: targetDir });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Git仓库已重置，历史已清除'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '重置仓库失败', error: error.message });
  }
});

router.get('/system/backup-records/check-files', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const backendDir = path.join(__dirname, '..', '..');
    const frontendDir = path.join(backendDir, '..', 'frontend');
    const backendBackupsDir = path.join(backendDir, 'backups');
    const frontendBackupsDir = path.join(frontendDir, 'backups');
    
    const [records] = await db.execute(
      'SELECT id, backupFileName, type FROM backup_records ORDER BY backupTime DESC'
    );
    
    const localFiles = new Set();
    
    if (fs.existsSync(backendBackupsDir)) {
      const backendFiles = fs.readdirSync(backendBackupsDir);
      backendFiles.forEach(file => {
        const name = file.replace('.zip', '');
        localFiles.add(name);
      });
    }
    
    if (fs.existsSync(frontendBackupsDir)) {
      const frontendFiles = fs.readdirSync(frontendBackupsDir);
      frontendFiles.forEach(file => {
        const name = file.replace('.zip', '');
        localFiles.add(name);
      });
    }
    
    const missingRecords = records.filter(record => {
      const baseName = record.backupFileName.replace('.zip', '');
      return !localFiles.has(baseName);
    });
    
    res.status(200).json({
      success: true,
      missingRecords: missingRecords,
      totalChecked: records.length,
      missingCount: missingRecords.length,
      localFileCount: localFiles.size
    });
  } catch (error) {
    res.status(500).json({ message: '检查备份文件失败', error: error.message });
  }
});

router.delete('/system/backup-records/batch-delete', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: '请提供要删除的记录ID列表' });
    }
    const placeholders = ids.map(() => '?').join(',');
    await db.execute(
      `DELETE FROM backup_records WHERE id IN (${placeholders})`,
      ids
    );
    res.status(200).json({
      success: true,
      message: `成功删除 ${ids.length} 条记录`,
      deletedCount: ids.length
    });
  } catch (error) {
    res.status(500).json({ message: '删除备份记录失败', error: error.message });
  }
});

module.exports = router;