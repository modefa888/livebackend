const urlParse = require("url-parse");
const {default: nodeGlobalProxy} = require("node-global-proxy");


module.exports = ($, config) => {
    const helpText = `
参数：
  --token <TelegramBotToken> - 必选，Telegram Bot Token
  --proxy <HTTPProxy> - 可选，以 http:// 开头的代理
`;
    // tg的token
    const token = config[config.environment].token;
    if (!token) {
        $.log(helpText);
        process.exit(-1);
    }
    // 重新初始化 TelegramBot 实例，使用正确的 token
    const TelegramBot = require('node-telegram-bot-api');
    $.bot = new TelegramBot(token);

    // 代理设置 -- 无法连接则使用代理
    const proxy = config[config.environment].proxy;
    if (proxy) {
        let proxyUrlObj = urlParse(proxy, true);
        if (proxyUrlObj.protocol !== 'http:') {
            $.log('--proxy 只支持HTTP PROXY');
            process.exit(-1);
        }
        nodeGlobalProxy.setConfig(proxy);
        nodeGlobalProxy.start();
    }
}

