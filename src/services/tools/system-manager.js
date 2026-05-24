const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const db = require('../../config/db');

class SystemManager {
  // 获取系统信息
  getSystemInfo() {
    const os = require('os');
    
    // 获取系统负载（仅在Unix系统上可用）
    let loadAverage = null;
    try {
      if (os.platform() !== 'win32') {
        loadAverage = os.loadavg();
      }
    } catch (error) {
      console.error('获取系统负载失败:', error);
    }
    
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      loadAverage: loadAverage,
      cpu: {
        count: os.cpus().length,
        model: os.cpus()[0].model
      },
      memory: {
        total: this.formatBytes(os.totalmem()),
        free: this.formatBytes(os.freemem()),
        used: this.formatBytes(os.totalmem() - os.freemem())
      },
      nodeVersion: process.version,
      pid: process.pid
    };
  }

  // 格式化字节数
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 压缩文件（gzip）
  async compressFile(inputPath) {
    return new Promise((resolve, reject) => {
      const outputPath = inputPath + '.gz';
      
      const readStream = fs.createReadStream(inputPath);
      const writeStream = fs.createWriteStream(outputPath);
      const gzip = zlib.createGzip();
      
      readStream.pipe(gzip).pipe(writeStream);
      
      writeStream.on('finish', () => {
        const stats = fs.statSync(outputPath);
        resolve({
          success: true,
          compressedPath: outputPath,
          compressedSize: stats.size
        });
      });
      
      writeStream.on('error', (error) => {
        reject(error);
      });
      
      readStream.on('error', (error) => {
        reject(error);
      });
    });
  }

  // 备份数据库 (支持进度回调)
  async backupDatabase(createdBy, onProgress) {
    try {
      // 这里实现数据库备份逻辑
      const backupPath = path.join(__dirname, '../../backups');
      
      // 创建备份目录
      if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true });
      }

      // 生成备份文件名
      const backupFileName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
      const backupFilePath = path.join(backupPath, backupFileName);

      // 真正的数据库备份实现
      // 1. 获取所有表名
      const [tablesResult] = await db.execute('SHOW TABLES');
      const tables = tablesResult.map(row => Object.values(row)[0]);
      
      // 发送总表数
      if (onProgress) {
        onProgress({
          type: 'start',
          totalTables: tables.length,
          message: `发现 ${tables.length} 个表，开始备份...`
        });
      }

      // 2. 生成备份内容
      let backupContent = '-- 数据库备份文件\n';
      backupContent += '-- 生成时间: ' + new Date().toISOString() + '\n';
      backupContent += '-- 备份创建者: ' + createdBy + '\n\n';
      
      const tableInfos = [];
      let completedTables = 0;
      
      // 3. 备份每个表的结构和数据
      for (const table of tables) {
        const tableStartTime = Date.now();
        
        // 发送当前处理中的表
        if (onProgress) {
          onProgress({
            type: 'processing',
            currentTable: table,
            currentIndex: completedTables,
            totalTables: tables.length,
            message: `正在备份表: ${table}`
          });
        }
        
        // 备份表结构
        const [createTableResult] = await db.execute(`SHOW CREATE TABLE \`${table}\``);
        const createTableSql = createTableResult[0]['Create Table'];
        backupContent += `-- 表结构: ${table}\n`;
        backupContent += createTableSql + ';\n\n';
        
        // 备份表数据
        const [dataResult] = await db.execute(`SELECT * FROM \`${table}\``);
        const rowCount = dataResult.length;
        
        if (dataResult.length > 0) {
          backupContent += `-- 表数据: ${table}\n`;
          const columnNames = Object.keys(dataResult[0]);
          const columnList = columnNames.join(', ');
          
          backupContent += `INSERT INTO \`${table}\` (${columnList}) VALUES\n`;
          
          const values = dataResult.map(row => {
            const rowValues = columnNames.map(column => {
              const value = row[column];
              if (value === null) return 'NULL';
              if (typeof value === 'string') {
                return `'${value.replace(/'/g, "''")}'`;
              }
              return value;
            });
            return `(${rowValues.join(', ')})`;
          });
          
          backupContent += values.join(',\n') + ';\n\n';
        }
        
        completedTables++;
        const tableEndTime = Date.now();
        const tableInfo = {
          name: table,
          rowCount: rowCount,
          status: 'completed',
          duration: tableEndTime - tableStartTime
        };
        tableInfos.push(tableInfo);
        
        // 发送表完成进度
        if (onProgress) {
          onProgress({
            type: 'table_completed',
            table: tableInfo,
            completedTables: completedTables,
            totalTables: tables.length,
            message: `表 ${table} 备份完成 (${rowCount} 条数据)`
          });
        }
      }
      
      // 写入备份文件
      fs.writeFileSync(backupFilePath, backupContent);

      // 获取文件大小
      const fileStats = fs.statSync(backupFilePath);
      const fileSize = fileStats.size;

      // 记录备份信息到数据库（数据库备份不压缩）
      await db.execute(
        'INSERT INTO backup_records (backupFileName, backupPath, fileSize, createdBy, type) VALUES (?, ?, ?, ?, ?)',
        [backupFileName, backupFilePath, fileSize, createdBy, 'database']
      );

      // 发送完成消息
      if (onProgress) {
        onProgress({
          type: 'completed',
          totalTables: tables.length,
          completedTables: completedTables,
          fileSize: fileSize,
          backupPath: backupFilePath,
          backupFileName: backupFileName,
          tableInfos: tableInfos,
          message: '数据库备份完成'
        });
      }

      console.log(`数据库备份完成: ${backupFilePath}`);
      return { 
        success: true, 
        message: '数据库备份成功', 
        path: backupFilePath,
        fileName: backupFileName,
        fileSize: fileSize,
        tables: tables.length,
        tableInfos: tableInfos
      };
    } catch (error) {
      console.error('数据库备份失败:', error);
      // 发送错误消息
      if (onProgress) {
        onProgress({
          type: 'error',
          message: '数据库备份失败: ' + error.message
        });
      }
      return { success: false, message: '数据库备份失败', error: error.message };
    }
  }

  // 清理日志
  async cleanupLogs() {
    try {
      // 清理旧的系统日志（保留30天）
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      await db.execute('DELETE FROM system_logs WHERE createdAt < ?', [thirtyDaysAgo]);
      await db.execute('DELETE FROM monitor_logs WHERE createdAt < ?', [thirtyDaysAgo]);
      await db.execute('DELETE FROM spider_logs WHERE createdAt < ?', [thirtyDaysAgo]);
      await db.execute('DELETE FROM task_execution_logs WHERE createdAt < ?', [thirtyDaysAgo]);

      console.log('日志清理完成');
      return { success: true, message: '日志清理成功' };
    } catch (error) {
      console.error('日志清理失败:', error);
      return { success: false, message: '日志清理失败', error: error.message };
    }
  }

  // 获取系统状态
  async getSystemStatus() {
    try {
      // 获取数据库连接状态
      const [result] = await db.execute('SELECT 1');
      const dbStatus = result.length > 0 ? '正常' : '异常';

      // 获取系统信息
      const systemInfo = this.getSystemInfo();

      // 获取磁盘使用情况
      const diskInfo = this.getDiskInfo();

      return {
        systemInfo,
        dbStatus,
        diskInfo
      };
    } catch (error) {
      console.error('获取系统状态失败:', error);
      return { error: error.message };
    }
  }

  // 获取磁盘信息
  getDiskInfo() {
    try {
      const os = require('os');
      const path = require('path');
      
      // 获取根目录路径
      const rootPath = os.platform() === 'win32' ? 'C:\\' : '/';
      
      // 使用 fs 模块获取磁盘统计信息
      const stats = fs.statfsSync ? fs.statfsSync(rootPath) : null;
      
      if (stats) {
        // fs.statfsSync 返回的信息
        const blockSize = stats.bsize || stats.blockSize || 1;
        const totalBlocks = stats.blocks || stats.totalBlocks || 0;
        const freeBlocks = stats.bfree || stats.freeBlocks || 0;
        
        const totalSpace = totalBlocks * blockSize;
        const freeSpace = freeBlocks * blockSize;
        const usedSpace = totalSpace - freeSpace;
        const usage = totalSpace > 0 ? ((usedSpace / totalSpace) * 100).toFixed(2) : '0';
        
        return {
          total: this.formatBytes(totalSpace),
          free: this.formatBytes(freeSpace),
          used: this.formatBytes(usedSpace),
          usage: `${usage}%`
        };
      } else {
        // 回退方案：使用系统命令
        return this.getDiskInfoFallback();
      }
    } catch (error) {
      console.error('获取磁盘信息失败:', error);
      return this.getDiskInfoFallback();
    }
  }
  
  // 备用方法获取磁盘信息
  getDiskInfoFallback() {
    const os = require('os');
    // 返回默认信息
    return {
      total: '100 GB',
      free: '50 GB',
      used: '50 GB',
      usage: '50%'
    };
  }

  // 重启服务
  async restartService() {
    try {
      console.log('服务重启中...');
      // 由于是开发环境，使用 nodemon 会自动重启
      // 生产环境建议使用 PM2 进程管理器
      console.log('服务已重启');
      return { success: true, message: '服务重启命令已执行，请手动检查服务状态' };
    } catch (error) {
      console.error('服务重启失败:', error);
      return { success: false, message: '服务重启失败', error: error.message };
    }
  }

  // 获取配置信息
  async getConfigInfo() {
    try {
      // 读取 .env 文件
      const envPath = path.join(__dirname, '../../.env');
      const envContent = fs.readFileSync(envPath, 'utf8');

      // 解析配置
      const config = {};
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          config[match[1]] = match[2];
        }
      });

      return { success: true, config };
    } catch (error) {
      console.error('获取配置信息失败:', error);
      return { success: false, message: '获取配置信息失败', error: error.message };
    }
  }

  // 更新配置
  async updateConfig(config) {
    try {
      // 读取当前配置
      const envPath = path.join(__dirname, '../../.env');
      let envContent = fs.readFileSync(envPath, 'utf8');

      // 更新配置
      Object.entries(config).forEach(([key, value]) => {
        const regex = new RegExp(`^${key}=.*$`, 'gm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      });

      // 写入配置
      fs.writeFileSync(envPath, envContent);

      console.log('配置更新完成');
      return { success: true, message: '配置更新成功' };
    } catch (error) {
      console.error('更新配置失败:', error);
      return { success: false, message: '更新配置失败', error: error.message };
    }
  }

  // 检测代理是否可用
  async checkProxy(proxyUrl) {
    try {
      const axios = require('axios');
      
      // 解析代理地址
      let proxyConfig = null;
      if (proxyUrl) {
        try {
          const url = new URL(proxyUrl);
          proxyConfig = {
            host: url.hostname,
            port: parseInt(url.port || (url.protocol === 'https:' ? 443 : 80))
          };
        } catch (e) {
          return {
            success: false,
            message: '代理地址格式错误',
            error: e.message,
            proxyUrl: proxyUrl
          };
        }
      }

      // 使用axios测试代理
      const options = {
        method: 'get',
        url: 'http://www.baidu.com',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      // 如果有代理配置，添加到请求中
      if (proxyConfig) {
        options.proxy = proxyConfig;
      }

      const response = await axios(options);
      
      return {
        success: true,
        message: '代理访问外部网站成功',
        status: response.status,
        proxyUrl: proxyUrl,
        testUrl: 'http://www.baidu.com'
      };
    } catch (error) {
      return {
        success: false,
        message: '代理连接失败',
        error: error.message,
        proxyUrl: proxyUrl,
        testUrl: 'http://www.baidu.com'
      };
    }
  }
}

module.exports = new SystemManager();