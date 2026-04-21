const { getBotGuard } = require('./src/services/bot/bot-guard');

console.log('开始测试 BotGuard...');

try {
  const botGuard = getBotGuard();
  console.log('成功获取 BotGuard 实例');
  
  console.log('调用 getStatus() 方法...');
  const status = botGuard.getStatus();
  console.log('getStatus() 成功返回:', JSON.stringify(status, null, 2));
  
  console.log('测试成功！');
} catch (error) {
  console.error('测试失败:', error);
  console.error('错误堆栈:', error.stack);
}
