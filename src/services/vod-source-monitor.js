let instance = null;

class VodSourceMonitor {
  constructor() {
    this.running = false;
    this.interval = null;
  }

  async start() {
    this.running = true;
    console.log('影视资源监控服务已启动');
  }

  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('影视资源监控服务已停止');
  }

  getStatus() {
    return {
      running: this.running
    };
  }
}

function getVodSourceMonitor() {
  if (!instance) {
    instance = new VodSourceMonitor();
  }
  return instance;
}

module.exports = {
  getVodSourceMonitor
};
