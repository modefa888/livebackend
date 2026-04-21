const jableAPI = require('../spiderOther/search/jableAPI');
const soupianAPI = require('../spiderOther/search/Soupian');

// ********************
// 公共搜索方法
// ********************

function createSearchHandler(api) {
    return async (query, page = 1) => {
        return await api.search(query, page);
    };
}

// ********************
// 搜索功能
// ********************

module.exports = async ($) => {
    // 存储API搜索方法
    const searchHandlers = {
        'v': createSearchHandler(jableAPI),
        'm': createSearchHandler(soupianAPI),
    };

    // 存储每个用户的搜索状态
    const userStates = {};

    // 搜索视频<关键字>
    $.bot.onText(/^\/(v|m|g) (.+)/, async (msg, match) => {
        const command = match[1];
        const searchQuery = match[2];
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        // 初始化用户状态
        userStates[userId] = { command, searchQuery, page: 1, messageId: null };

        // 显示第一页
        await showPage(chatId, userId);
    });

    $.bot.on('callback_query', async (callbackQuery) => {
        const userId = callbackQuery.from.id;
        const userState = userStates[userId];

        if (!userState) {
            return;
        }

        // 处理上一页和下一页按钮点击
        if (callbackQuery.data === 'pre_page' && userState.page > 1) {
            userState.page -= 1;
        } else if (callbackQuery.data === 'next_page') {
            userState.page += 1;
        }

        // 回复点击事件
        await $.bot.answerCallbackQuery(callbackQuery.id);

        // 显示当前页
        await showPage(callbackQuery.message.chat.id, userId);
    });

    async function showPage(chatId, userId) {
        const userState = userStates[userId];
        if (!userState) {
            return;
        }

        const { command, searchQuery, page } = userState;
        const searchHandler = searchHandlers[command];
        if (!searchHandler) {
            return;
        }

        const { results, totalPages } = await searchHandler(searchQuery, page);

        // 创建按钮
        const buttons = [];
        if (page > 1) {
            buttons.push([{ text: '⬅️上一页', callback_data: 'pre_page' }]);
        }
        if (page < totalPages) {
            buttons.push([{ text: '下一页➡️', callback_data: 'next_page' }]);
        }

        // 创建消息文本和回复标记
        let messageText;
        if (!results || results.length === 0) {
            messageText = `对不起，没有找到与您搜索的关键词 *${searchQuery}* 相关的结果。`;
        } else {
            messageText = `您搜索了: ${searchQuery}\n${results.join('\n')}\n当前页码: *${page}*\n时间:${new Date().toLocaleString()}`;
        }

        const replyMarkup = {
            inline_keyboard: buttons,
            resize_keyboard: true // 启用按钮宽度调整
        };

        // 发送或编辑消息
        if (userState.messageId) {
            try {
                await $.bot.editMessageText(messageText, {
                    chat_id: chatId,
                    message_id: userState.messageId,
                    parse_mode: 'Markdown',
                    reply_markup: replyMarkup
                });
            } catch (err) {
                $.log('重新编辑搜索结果：' + err.message, 'error');
            }
        } else {
            try {
                const sentMessage = await $.bot.sendMessage(chatId, messageText, {
                    parse_mode: 'Markdown',
                    reply_markup: replyMarkup
                });
                userState.messageId = sentMessage.message_id;
            } catch (err) {
                $.log('发送搜索结果：' + err.message, 'error');
            }
        }
    }

    $.log("搜索模块加载完毕。。。");
};
