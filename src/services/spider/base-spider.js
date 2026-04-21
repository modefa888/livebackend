const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../../config/db');
const spiderMonitor = require('../monitor/spider-monitor');
const { loadConfigFromDB } = require('../../../bots/livebot/config');

class BaseSpider {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.url = config.url;
    this.interval = config.interval || 300000; // 默认5分钟
    this.isEnabled = config.isEnabled || true;
    this.isRunning = false;
    this.intervalId = null;
    this.axiosInstance = axios.create({
      timeout: 30000
    });
    this.configLoaded = false;
    this.config = null;
  }

  // 加载配置并设置代理
  async loadAndSetProxy() {
    try {
      if (!this.configLoaded) {
        this.config = await loadConfigFromDB();
        const proxyConfig = this.config[this.config.environment]?.proxy;
        if (proxyConfig) {
          try {
            const url = new URL(proxyConfig);
            this.axiosInstance.defaults.proxy = {
              host: url.hostname,
              port: parseInt(url.port || (url.protocol === 'https:' ? 443 : 80))
            };
            console.log(`爬虫 ${this.name} 已设置代理: ${proxyConfig}`);
          } catch (e) {
            console.log('代理配置解析失败');
          }
        }
        this.configLoaded = true;
      }
    } catch (err) {
      console.error('加载配置失败:', err);
    }
  }

  // 启动爬虫
  async start() {
    if (this.isRunning) {
      return { success: false, message: '爬虫已经在运行' };
    }

    if (!this.isEnabled) {
      return { success: false, message: '爬虫已禁用' };
    }

    this.isRunning = true;
    console.log(`爬虫 ${this.name} 已启动`);

    // 加载配置并设置代理
    await this.loadAndSetProxy();

    // 注册到监控
    spiderMonitor.registerSpider(this.id, this);

    // 立即执行一次
    await this.run();

    // 设置定时任务
    this.intervalId = setInterval(async () => {
      await this.run();
    }, this.interval);

    return { success: true, message: `爬虫 ${this.name} 已启动` };
  }

  // 停止爬虫
  stop() {
    if (!this.isRunning) {
      return { success: false, message: '爬虫未运行' };
    }

    clearInterval(this.intervalId);
    this.isRunning = false;
    console.log(`爬虫 ${this.name} 已停止`);

    // 从监控中移除
    spiderMonitor.removeSpider(this.id);

    return { success: true, message: `爬虫 ${this.name} 已停止` };
  }

  // 运行爬虫
  async run() {
    try {
      console.log(`开始爬取 ${this.name}: ${this.url}`);
      
      // 发送请求
      const response = await this.fetchPage(this.url);
      
      // 解析页面
      const data = await this.parsePage(response.data);
      
      // 处理数据
      await this.processData(data);
      
      console.log(`爬取 ${this.name} 完成`);
      
      // 记录成功日志
      await this.log('success', `爬取 ${this.name} 成功`);
    } catch (error) {
      console.error(`爬取 ${this.name} 失败:`, error);
      
      // 记录错误日志
      await this.log('error', `爬取 ${this.name} 失败: ${error.message}`);
    }
  }

  // 获取页面
  async fetchPage(url) {
    // 确保代理已设置
    await this.loadAndSetProxy();

    const response = await this.axiosInstance.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    return response;
  }

  // 解析页面
  async parsePage(html) {
    // 子类实现
    return [];
  }

  // 处理数据
  async processData(data) {
    // 子类实现
  }

  // 记录日志
  async log(status, message) {
    try {
      await db.execute(
        'INSERT INTO spider_logs (spiderId, status, message, createdAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [this.id, status, message]
      );
    } catch (error) {
      console.error('记录爬虫日志失败:', error);
    }
  }

  // 获取状态
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      url: this.url,
      interval: this.interval,
      isEnabled: this.isEnabled,
      isRunning: this.isRunning
    };
  }
}

module.exports = BaseSpider;