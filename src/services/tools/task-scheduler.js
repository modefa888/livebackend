const cron = require('node-cron');
const db = require('../../config/db');

class TaskScheduler {
  constructor() {
    this.tasks = new Map(); // 存储定时任务实例
  }

  // 初始化定时任务
  async initialize() {
    try {
      // 从数据库获取所有定时任务配置
      const [taskConfigs] = await db.execute('SELECT * FROM scheduled_tasks WHERE isEnabled = true');

      for (const config of taskConfigs) {
        await this.createTask(config);
      }

      console.log('定时任务初始化完成');
    } catch (error) {
      console.error('定时任务初始化失败:', error);
    }
  }

  // 创建定时任务
  async createTask(config) {
    try {
      // 解析 cron 表达式
      const cronExpression = config.cronExpression;
      
      // 创建定时任务
      const task = cron.schedule(cronExpression, async () => {
        await this.executeTask(config);
      }, {
        scheduled: true,
        timezone: 'Asia/Shanghai'
      });

      // 存储任务实例
      this.tasks.set(config.id, task);

      console.log(`定时任务 ${config.name} 已创建并启动`);
    } catch (error) {
      console.error(`创建定时任务 ${config.name} 失败:`, error);
    }
  }

  // 执行定时任务
  async executeTask(config) {
    try {
      console.log(`开始执行定时任务: ${config.name}`);

      // 根据任务类型执行不同的操作
      switch (config.type) {
        case 'backup':
          await this.executeBackupTask(config);
          break;
        case 'cleanup':
          await this.executeCleanupTask(config);
          break;
        case 'notification':
          await this.executeNotificationTask(config);
          break;
        default:
          console.error(`未知的任务类型: ${config.type}`);
      }

      // 记录任务执行日志
      await this.logTaskExecution(config.id, 'success', `任务 ${config.name} 执行成功`);

      console.log(`定时任务 ${config.name} 执行完成`);
    } catch (error) {
      console.error(`定时任务 ${config.name} 执行失败:`, error);
      
      // 记录任务执行失败日志
      await this.logTaskExecution(config.id, 'error', `任务 ${config.name} 执行失败: ${error.message}`);
    }
  }

  // 执行备份任务
  async executeBackupTask(config) {
    // 这里实现备份逻辑
    console.log('执行备份任务');
  }

  // 执行清理任务
  async executeCleanupTask(config) {
    // 这里实现清理逻辑
    console.log('执行清理任务');
  }

  // 执行通知任务
  async executeNotificationTask(config) {
    try {
      // 导入通知服务
      const notificationService = require('../bot/notification-service');
      
      // 发送系统通知
      const result = await notificationService.sendSystemNotification(
        `定时任务执行通知：${config.name} 已在 ${new Date().toLocaleString()} 执行`,
        null // 发送给所有用户
      );
      
      console.log('执行通知任务成功:', result.message);
    } catch (error) {
      console.error('执行通知任务失败:', error);
      throw error;
    }
  }

  // 记录任务执行日志
  async logTaskExecution(taskId, status, message) {
    try {
      await db.execute(
        'INSERT INTO task_execution_logs (taskId, status, message, createdAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [taskId, status, message]
      );
    } catch (error) {
      console.error('记录任务执行日志失败:', error);
    }
  }

  // 停止所有定时任务
  async stopAllTasks() {
    for (const [id, task] of this.tasks.entries()) {
      task.stop();
      this.tasks.delete(id);
    }

    console.log('所有定时任务已停止');
  }

  // 启动所有定时任务
  async startAllTasks() {
    for (const [id, task] of this.tasks.entries()) {
      task.start();
    }

    console.log('所有定时任务已启动');
  }

  // 获取任务状态
  async getTaskStatus() {
    const statusList = [];

    for (const [id, task] of this.tasks.entries()) {
      statusList.push({
        id,
        isRunning: task.running
      });
    }

    return {
      totalCount: this.tasks.size,
      runningCount: statusList.filter(item => item.isRunning).length,
      statusList
    };
  }

  // 添加定时任务
  async addTask(config) {
    try {
      // 插入数据库
      const [result] = await db.execute(
        'INSERT INTO scheduled_tasks (name, type, cronExpression, isEnabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [config.name, config.type, config.cronExpression, config.isEnabled || true]
      );

      // 获取新创建的任务ID
      const newTaskId = result.insertId;
      
      // 创建任务实例
      await this.createTask({ ...config, id: newTaskId });

      return { success: true, message: '定时任务添加成功' };
    } catch (error) {
      console.error('添加定时任务失败:', error);
      return { success: false, message: '添加定时任务失败', error: error.message };
    }
  }

  // 删除定时任务
  async deleteTask(taskId) {
    try {
      // 停止任务
      const task = this.tasks.get(taskId);
      if (task) {
        task.stop();
        this.tasks.delete(taskId);
      }

      // 从数据库删除
      await db.execute('DELETE FROM scheduled_tasks WHERE id = ?', [taskId]);

      return { success: true, message: '定时任务删除成功' };
    } catch (error) {
      console.error('删除定时任务失败:', error);
      return { success: false, message: '删除定时任务失败', error: error.message };
    }
  }

  // 更新定时任务
  async updateTask(taskId, config) {
    try {
      // 停止旧任务
      const oldTask = this.tasks.get(taskId);
      if (oldTask) {
        oldTask.stop();
        this.tasks.delete(taskId);
      }

      // 更新数据库
      await db.execute(
        'UPDATE scheduled_tasks SET name = ?, type = ?, cronExpression = ?, isEnabled = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [config.name, config.type, config.cronExpression, config.isEnabled || true, taskId]
      );

      // 创建新任务实例
      await this.createTask({ ...config, id: taskId });

      return { success: true, message: '定时任务更新成功' };
    } catch (error) {
      console.error('更新定时任务失败:', error);
      return { success: false, message: '更新定时任务失败', error: error.message };
    }
  }
}

module.exports = new TaskScheduler();