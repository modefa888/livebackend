const {searchMusic, getDetailMusic} = require("../spiderOther/music/FangpiMusic");
let $ = null;
let dbm = null;

// 用局部对象存储用户搜索结果，替代global
const userSessions = new Map(); // 使用Map存储，键为chatId，值为搜索结果

module.exports = async (includes, databaseManager) => {
    dbm = databaseManager;
    $ = includes;

    // =========================== 音乐 ==============================
    // 搜索命令
    // 搜索命令（带分页功能）
    $.bot.onText(/\/search (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const keyword = match[1];
        const pageSize = 10; // 每页显示10条结果

        try {
            // 发送"正在搜索"提示
            const processingMsg = await $.bot.sendMessage(chatId, `🔍 正在搜索 "${keyword}"，请稍候...`);

            // 调用音乐服务进行搜索
            const result = await searchMusic(keyword);

            // 删除处理中的消息
            await $.bot.deleteMessage(chatId, processingMsg.message_id);

            if (!result.success) {
                return $.bot.sendMessage(chatId, `❌ 搜索失败：${result.error}`);
            }

            if (result.data.total === 0) {
                return $.bot.sendMessage(chatId, `🔍 未找到与 "${keyword}" 相关的音乐`);
            }

            // 计算总页数
            const totalPages = Math.ceil(result.data.total / pageSize);

            // 存储完整搜索结果和分页信息到用户会话
            userSessions.set(chatId, {
                results: result.data.results,
                total: result.data.total,
                totalPages: totalPages,
                currentPage: 1,
                keyword: keyword
            });

            // 显示第一页结果
            await sendPageResults(chatId, 1, pageSize);

        } catch (error) {
            console.error('搜索处理错误:', error);
            await $.bot.sendMessage(chatId, `❌ 处理搜索请求时出错：${error.message}`);
        }
    });

    // 发送指定页的搜索结果
    async function sendPageResults(chatId, pageNum, pageSize) {
        const session = userSessions.get(chatId);
        if (!session) return;

        const { results, total, totalPages, keyword } = session;

        // 计算当前页的结果范围
        const startIndex = (pageNum - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, results.length);
        const currentResults = results.slice(startIndex, endIndex);

        // 格式化当前页结果
        let response = `🎵 找到 ${total} 条与 "${keyword}" 相关的结果（第${pageNum}/${totalPages}页）：\n\n`;

        currentResults.forEach((item, index) => {
            const displayIndex = startIndex + index + 1;
            response += `${displayIndex}. ${item.title} - ${item.author}\n`;
            response += `   发送 #${displayIndex} 获取播放地址\n\n`;
        });

        // 创建分页按钮
        const keyboard = [];
        const buttons = [];

        // 上一页按钮
        if (pageNum > 1) {
            buttons.push({
                text: '◀️ 上一页',
                callback_data: `page_${pageNum - 1}`
            });
        }

        // 下一页按钮
        if (pageNum < totalPages) {
            buttons.push({
                text: '下一页 ▶️',
                callback_data: `page_${pageNum + 1}`
            });
        }

        if (buttons.length > 0) {
            keyboard.push(buttons);
        }

        // 发送当前页结果和分页按钮
        await $.bot.sendMessage(chatId, response, {
            reply_markup: {
                inline_keyboard: keyboard
            }
        });

        // 更新当前页码
        session.currentPage = pageNum;
        userSessions.set(chatId, session);
    }

    // 监听分页按钮点击
    $.bot.on('callback_query', async (callbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;
        const messageId = callbackQuery.message.message_id;

        // 检查是否是分页请求
        if (data.startsWith('page_')) {
            try {
                // 删除当前消息
                await $.bot.deleteMessage(chatId, messageId);

                // 解析页码
                const pageNum = parseInt(data.split('_')[1], 10);
                const session = userSessions.get(chatId);

                if (session && pageNum >= 1 && pageNum <= session.totalPages) {
                    // 发送请求的页码结果
                    await sendPageResults(chatId, pageNum, 10);
                }
            } catch (error) {
                console.error('分页处理错误:', error);
            } finally {
                // 确认回调，避免按钮一直处于加载状态
                await $.bot.answerCallbackQuery(callbackQuery.id);
            }
        }
    });

    // 监听编号回复，获取音乐详情（需要调整索引计算）
    $.bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text || '';

        // 检查是否是查询编号（如 #1, #5）
        const numberMatch = text.match(/^#(\d+)$/);
        if (numberMatch) {
            try {
                // 发送"正在处理"提示
                const processingMsg = await $.bot.sendMessage(chatId, `⏳ 正在获取音乐信息，请稍候...`);

                // 获取用户之前的搜索结果
                const resultIndex = parseInt(numberMatch[1], 10) - 1; // 转换为数组索引
                const session = userSessions.get(chatId);

                if (!session || !session.results || !session.results[resultIndex]) {
                    await $.bot.deleteMessage(chatId, processingMsg.message_id);
                    return $.bot.sendMessage(chatId, `❌ 未找到对应的音乐，请先搜索`);
                }

                // 获取音乐详情
                const musicId = session.results[resultIndex].id;
                const detailResult = await getDetailMusic(musicId);

                // 删除处理中的消息
                await $.bot.deleteMessage(chatId, processingMsg.message_id);

                if (!detailResult.success) {
                    return $.bot.sendMessage(chatId, `❌ 获取音乐详情失败：${detailResult.error}`);
                }

                // 格式化音乐详情（保持不变）
                const music = detailResult.data;
                let response = `🎶 ${music.mp3_title}\n`;
                response += `🎤 歌手：${music.mp3_author}\n`;
                response += `⏱ 时长：${music.mp3_duration}\n\n`;

                // 添加播放地址
                if (music.playUrl && music.playUrl.data.url) {
                    response += `📻 播放地址：\n${music.playUrl.data.url}\n`;
                }

                // 如果有其他链接，也一起展示
                if (music.mp3_extra_urls && music.mp3_extra_urls.length > 0) {
                    response += "\n其他链接：\n";
                    music.mp3_extra_urls.forEach(item => {
                        response += `${item.type}：${item.share_link}\n`;
                    });
                }

                await $.bot.sendMessage(chatId, response);

            } catch (error) {
                console.error('获取音乐详情错误:', error);
                await $.bot.sendMessage(chatId, `❌ 处理音乐请求时出错：${error.message}`);
            }
        }
    });

    $.log("音乐模块加载完毕。。。");
}