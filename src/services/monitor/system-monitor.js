const os = require('os');
const fs = require('fs');
const path = require('path');
const db = require('../../config/db');

class SystemMonitor {
  constructor() {
    this.isRunning = false;
    this.monitorInterval = null;
  }

  // 启动系统监控
  async start() {
    if (this.isRunning) {
      return { success: false, message: '监控已经在运行' };
    }

    this.isRunning = true;
    console.log('系统监控已启动');

    // 每1分钟检查一次系统状态
    this.monitorInterval = setInterval(async () => {
      await this.checkSystemStatus();
    }, 1 * 60 * 1000);

    // 立即执行一次
    await this.checkSystemStatus();

    return { success: true, message: '系统监控已启动' };
  }

  // 停止系统监控
  stop() {
    if (!this.isRunning) {
      return { success: false, message: '监控未运行' };
    }

    clearInterval(this.monitorInterval);
    this.isRunning = false;
    console.log('系统监控已停止');

    return { success: true, message: '系统监控已停止' };
  }

  // 检查系统状态
  async checkSystemStatus() {
    try {
      const systemStatus = this.getSystemInfo();
      
      // 记录系统状态
      await this.recordSystemStatus(systemStatus);
      
      console.log('系统状态检查完成:', systemStatus);
    } catch (error) {
      console.error('系统监控出错:', error);
    }
  }

  // 获取系统信息
  getSystemInfo() {
    // CPU 信息
    const cpus = os.cpus();
    const cpuCount = cpus.length;
    const cpuModel = cpus[0].model;
    
    // 内存信息
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory * 100).toFixed(2);
    
    // 磁盘信息
    const diskInfo = this.getDiskInfo();
    
    // 系统信息
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      cpu: {
        count: cpuCount,
        model: cpuModel
      },
      memory: {
        total: this.formatBytes(totalMemory),
        free: this.formatBytes(freeMemory),
        used: this.formatBytes(usedMemory),
        usage: `${memoryUsage}%`
      },
      disk: diskInfo
    };
    
    return systemInfo;
  }

  // 获取磁盘信息
  getDiskInfo() {
    try {
      // 对于 Windows 系统，检查 C 盘
      if (os.platform() === 'win32') {
        const stats = fs.statSync('C:');
        const totalSpace = stats.size;
        const freeSpace = fs.freemem(); // 这里只是示例，实际应该使用专门的磁盘空间检测方法
        const usedSpace = totalSpace - freeSpace;
        const usage = (usedSpace / totalSpace * 100).toFixed(2);
        
        return {
          total: this.formatBytes(totalSpace),
          free: this.formatBytes(freeSpace),
          used: this.formatBytes(usedSpace),
          usage: `${usage}%`
        };
      }
      return { error: '不支持的平台' };
    } catch (error) {
      console.error('获取磁盘信息失败:', error);
      return { error: error.message };
    }
  }

  // 格式化字节数
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 记录系统状态
  async recordSystemStatus(status) {
    try {
      // 记录系统日志
      await db.execute(
        'INSERT INTO system_logs (type, message, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
        ['system', JSON.stringify(status)]
      );
    } catch (error) {
      console.error('记录系统状态失败:', error);
    }
  }

  // 获取系统监控状态
  async getStatus() {
    try {
      const systemInfo = this.getSystemInfo();
      
      return {
        isRunning: this.isRunning,
        systemInfo
      };
    } catch (error) {
      console.error('获取系统监控状态失败:', error);
      return { isRunning: this.isRunning, error: error.message };
    }
  }
}

module.exports = new SystemMonitor();