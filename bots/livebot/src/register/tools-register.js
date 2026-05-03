// ********************
// 工具列表
// ********************
const gpc = require("../spiderOther/tools/GPCChainBot");
const xinye = require("../spiderOther/tools/XinyeVPN");


// 缓存存储
let contentCache = {
    data: null,
    timestamp: 0
};

module.exports = ($, dbm, config) => {



    function checkPermissionAdmin(handler) {
        return (msg, match) => {
            const userId = msg.from.id;
            if (!dbm.hasPermission(userId, 2)) { // 假设权限级别1是管理用户的最低权限
                $.bot.sendMessage(msg.chat.id, '🔒您没有权限执行此操作。');
                return;
            }
            handler(msg, match);
        };
    }

    // 定义一个帮助信息的字符串
    const toolsMessage = `
🧰工具箱
/xinye - 获取xinye节点
`;

    // 工具箱的帮助命令
    $.bot.onText(/^\/tools$/, checkPermissionAdmin((msg) => {
        $.bot.sendMessage(msg.chat.id, toolsMessage, $.defTgMsgForm);
    }));

    // 领取gpc   /gpc - 领取GPC
    // $.bot.onText(/^\/gpc$/, checkPermissionAdmin(async (msg) => {
    //     const result = await gpc(config.GPCToken);
    //     await $.bot.sendMessage(msg.chat.id, result, $.defTgMsgForm);
    // }));

    // ================================  领取xinye   ================================
    // 领取xinye节点
    $.bot.onText(/^\/xinye$/, checkPermissionAdmin(async (msg) => {
        const chatId = msg.chat.id;
        await handleContentRequest(chatId, true);
    }));

    /**
     * 处理内容请求
     * @param {number} chatId - 聊天ID
     * @param {boolean} forceRefresh - 是否强制刷新（忽略缓存）
     */
    async function handleContentRequest(chatId, forceRefresh = false) {
        try {
            // 检查缓存
            const now = Date.now();
            if (!forceRefresh && contentCache.data && (now - contentCache.timestamp) < CACHE_TTL) {
                console.log('使用缓存内容');
                return sendContent(chatId, contentCache.data);
            }

            // 发送处理中提示
            const processingMsg = await $.bot.sendMessage(chatId, `🔍 正在获取最新内容，请稍候...`);

            // 调用爬取模块获取内容
            const result = await xinye.getFormattedContent();

            // 删除处理中提示
            await $.bot.deleteMessage(chatId, processingMsg.message_id);

            if (result.success) {
                // 更新缓存
                contentCache = {
                    data: result.message,
                    timestamp: now
                };
                return sendContent(chatId, result.message);
            } else {
                return $.bot.sendMessage(chatId, `❌ ${result.message}` + (result.error ? `: ${result.error}` : ''));
            }
        } catch (error) {
            $.log('处理请求错误:' + error, 'error');
            await $.bot.sendMessage(chatId, `❌ 处理请求时出错：${error.message}`);
        }
    }

    /**
     * 发送内容到Telegram
     * @param {number} chatId - 聊天ID
     * @param {string} content - 要发送的内容
     */
    async function sendContent(chatId, content) {
        try {
            await $.bot.sendMessage(chatId, content, {
                parse_mode: 'HTML',
                disable_web_page_preview: false
            });
        } catch (error) {
            console.error('发送消息失败:', error);
            // 尝试发送纯文本
            await $.bot.sendMessage(chatId, `内容获取成功，但格式化失败：\n${content}`);
        }
    }

    // =========================     获取币实时价格     ===================================
    // 获取币实时价格
    $.bot.onText(/^\/price (.+)/, checkPermissionAdmin(async (msg, match) => {
        const chatId = msg.chat.id;
        const symbol = match[1];
        const response = await $.axios.get(`https://www.bydfi.com/swap/public/common/premiumIndex/${symbol}-USDT`);
        // 发送给用户
        try {
            const data = response.data.data;
            let body = '';
            if (data) {
                // 别名
                const alias = data.alias;
                // 代号
                const symbol = data.symbol;
                // 币名
                // const baseSymbol = data.baseSymbol;
                // // USDT
                // const priceSymbol = data.priceSymbol;
                // 价格
                const flagPrice = data.flagPrice;
                // 利率
                const fundRate = data.fundRate;
                // 杠杆配置
                // const leverageConfig = data.leverageConfig;
                body += `Token: ${symbol}\n`;
                body += `alias: ${alias}\n`;
                body += `Price: *${flagPrice}*\n`;
                body += `利率: ${parseFloat(fundRate) * 100}%\n`;
            }
            // 通知命令的发送者
            await $.bot.sendMessage(chatId, body, $.defTgMsgForm);
        } catch (error) {
            $.log('发送给用户' + symbol + '失败' + error.message, 'error');
        }
    }));

    $.log("工具模块加载完毕。。。");
}

