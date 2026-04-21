// message-register.js - 用户消息发送模块 (单条消息内确认与撤回 + 全局优化版 + 撤回全部)
// ===============================================================

module.exports = function ($, dbm) {
    const confirmationStates = new Map();
    const recallTasks = new Map(); // 用于存储可撤回的任务

    const ConfirmationType = {
        GLOBAL_NOTIFICATION: 'global_notification',
        SINGLE_MESSAGE: 'single_message'
    };

    function init() {
        registerCommands();
        registerCallbackHandlers();
        $.log("✅ 消息发送模块加载完毕 (优化版: 超时保护+耗时统计+撤回全部)");
    }

    const checkPermissionAdmin = (handler) => {
        return async (msg, match) => {
            const userId = msg.from.id;
            const permissionService = $.services.permission;
            const messageService = $.services.message;
            
            if (!await permissionService.checkPermission(userId, 2)) {
                await messageService.sendText(msg.chat.id, '🔒您没有权限执行此操作。');
                return;
            }
            await handler(msg, match);
        };
    };

    // === 注册命令 ===
    function registerCommands() {
        // 单条信息发送
        $.bot.onText(/^\/send (\d+) (.+)/, checkPermissionAdmin(async (msg, match) => {
            const [targetId, messageText] = [match[1], match[2]];
            const senderId = msg.chat.id;

            try {
                const users = await dbm.getUser();
                const targetUser = users.find(u => u.userId === Number(targetId));
                if (!targetUser) {
                    return sendMessage(senderId, `⚠️ 未找到用户 ID: ${targetId}`);
                }

                const confirmationMessage = `
⚠️ <b>确认发送消息</b>

目标用户: <code>${targetId}</code> (${targetUser.username || '未知用户'})
消息内容:
<code>${messageText}</code>
                `;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '✅ 确认发送', callback_data: `confirm_send:${ConfirmationType.SINGLE_MESSAGE}` },
                            { text: '❌ 取消', callback_data: 'cancel_send' }
                        ]
                    ]
                };

                const sentMsg = await sendMessage(senderId, confirmationMessage, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });

                confirmationStates.set(senderId, {
                    type: ConfirmationType.SINGLE_MESSAGE,
                    data: { targetId: Number(targetId), text: messageText, targetUser },
                    confirmMsgId: sentMsg.message_id
                });

            } catch (err) {
                $.log(`准备发送消息失败: ${err.message}`, 'error');
                await sendMessage(senderId, `❌ 准备发送消息失败: ${err.message}`);
            }
        }));

        // 全局发送消息
        $.bot.onText(/^\/sendnotification (.+)/, checkPermissionAdmin(async (msg, match) => {
            const notificationText = match[1];
            const senderId = msg.chat.id;

            const users = await dbm.getUser();
            const targets = users.filter(u => u.userId !== senderId);
            if (!targets.length) return sendMessage(senderId, '⚠️ 没有可发送的用户');

            const confirmationMessage = `
⚠️ <b>确认发送全局通知</b>

将向 <code>${targets.length}</code> 名用户发送：
<code>${notificationText}</code>
            `;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ 确认发送', callback_data: `confirm_send:${ConfirmationType.GLOBAL_NOTIFICATION}` },
                        { text: '❌ 取消', callback_data: 'cancel_send' }
                    ]
                ]
            };

            const sentMsg = await sendMessage(senderId, confirmationMessage, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });

            confirmationStates.set(senderId, {
                type: ConfirmationType.GLOBAL_NOTIFICATION,
                data: { text: notificationText, targetUsers: targets },
                confirmMsgId: sentMsg.message_id
            });
        }));

        // 设置help
        $.bot.onText(/^\/sendhelp$/, checkPermissionAdmin(async (msg) => {
            const helpMessage = `
📝 <b>消息发送命令帮助</b>

1️⃣ <code>/sendnotification [通知内容]</code>
　→ 向所有用户发送全局通知（带确认与撤回）

2️⃣ <code>/send [用户ID] [消息内容]</code>
　→ 向指定用户发送单独消息（带确认与撤回）

🌀 发送流程：
发送命令 → 出现确认按钮 → 点确认后同条消息变为发送结果并带「撤回」按钮。
            `;
            await sendMessage(msg.chat.id, helpMessage, { parse_mode: 'HTML' });
        }));

        // 用户列表
        $.bot.onText(/^\/userlist$/, checkPermissionAdmin(async (msg) => {
            try {
                const users = await dbm.getUser();
                if (!users.length) return sendMessage(msg.chat.id, '⚠️ 当前没有注册用户');

                let txt = `<b>👥 用户列表 (共 ${users.length} 人)</b>\n\n`;
                users.forEach((u, i) => {
                    txt += `${i + 1}. <code>${u.userId}</code> - ${u.username || '未设置用户名'}\n`;
                });
                txt += `\n可用命令：<code>/send [用户ID] [消息]</code>`;
                await sendMessage(msg.chat.id, txt, { parse_mode: 'HTML' });
            } catch (err) {
                $.log(`获取用户列表失败: ${err.message}`, 'error');
                await sendMessage(msg.chat.id, '⚠️ 获取用户列表失败');
            }
        }));

        // 抽奖命令
        $.bot.onText(/^\/lottery$/, async (msg) => {
            try {
                const userId = msg.from.id;
                const userName = msg.from.username || msg.from.first_name || msg.from.last_name || '未知用户';
                const chatId = msg.chat.id;

                // 导入抽奖服务
                const lotteryService = require('../../services/bot/lottery-service');

                // 获取当前活跃的抽奖
                const { lotteries } = await lotteryService.getLotteryList('active');
                if (lotteries.length === 0) {
                    return sendMessage(chatId, '⚠️ 当前没有活跃的抽奖');
                }

                // 检查用户是否已经参与
                const activeLottery = lotteries[0];
                const { success, message } = await lotteryService.checkTaskCompletion(userId, activeLottery.taskId);

                if (!success) {
                    return sendMessage(chatId, `⚠️ ${message}`);
                }

                // 参与抽奖
                const result = await lotteryService.createLottery(
                    userId,
                    activeLottery.title,
                    [{ id: userId, name: userName }],
                    activeLottery.winnerCount,
                    activeLottery.endTime,
                    activeLottery.taskId,
                    activeLottery.taskRequired
                );

                if (result.success) {
                    sendMessage(chatId, `✅ 参与抽奖成功！`);
                } else {
                    sendMessage(chatId, `⚠️ 参与抽奖失败：${result.message}`);
                }
            } catch (error) {
                $.log(`抽奖命令失败: ${error.message}`, 'error');
                await sendMessage(msg.chat.id, '⚠️ 抽奖命令执行失败');
            }
        });

        // 抽奖信息命令
        $.bot.onText(/^\/lotteryinfo$/, async (msg) => {
            try {
                const chatId = msg.chat.id;

                // 导入抽奖服务
                const lotteryService = require('../../services/bot/lottery-service');

                // 获取当前活跃的抽奖
                const { lotteries } = await lotteryService.getLotteryList('active');
                if (lotteries.length === 0) {
                    return sendMessage(chatId, '⚠️ 当前没有活跃的抽奖');
                }

                const activeLottery = lotteries[0];
                let info = `<b>🎁 当前抽奖信息</b>\n\n`;
                info += `标题：${activeLottery.title}\n`;
                info += `中奖人数：${activeLottery.winnerCount}\n`;
                info += `结束时间：${new Date(activeLottery.endTime).toLocaleString()}\n`;

                if (activeLottery.taskRequired && activeLottery.taskId) {
                    // 获取任务信息
                    const { tasks } = await lotteryService.getTaskList();
                    const task = tasks.find(t => t.id === activeLottery.taskId);
                    if (task) {
                        info += `\n任务要求：${task.taskName}\n`;
                        info += `任务描述：${task.taskDescription}\n`;
                        info += `完成要求：${task.requiredCount}次\n`;
                    }
                }

                info += `\n参与方式：发送 /lottery 命令参与抽奖`;
                await sendMessage(chatId, info, { parse_mode: 'HTML' });
            } catch (error) {
                $.log(`获取抽奖信息失败: ${error.message}`, 'error');
                await sendMessage(msg.chat.id, '⚠️ 获取抽奖信息失败');
            }
        });
    }

    // === 回调逻辑 ===
    function registerCallbackHandlers() {
        $.bot.on('callback_query', async (cb) => {
            const data = cb.data;
            const chatId = cb.message.chat.id;
            const msgId = cb.message.message_id;
            const userId = cb.from.id;

            try {
                const [action, ...params] = data.split(':');

                if (action === 'confirm_send') {
                    await handleConfirm(userId, chatId, msgId, params[0]);
                } else if (action === 'cancel_send') {
                    await $.bot.editMessageText('❌ 已取消发送操作。', {
                        chat_id: chatId,
                        message_id: msgId
                    });
                    confirmationStates.delete(userId);
                } else if (action === 'recall_msg') {
                    const [targetId, messageId] = params;
                    await handleRecall(chatId, msgId, targetId, messageId);
                } else if (action === 'recall_all') {
                    const taskId = params[0];
                    const successList = recallTasks.get(taskId);
                    if (successList) await handleRecallAll(chatId, msgId, successList, taskId);
                }

                await $.bot.answerCallbackQuery(cb.id);
            } catch (e) {
                $.log(`回调错误: ${e.message}`, 'error');
            }
        });
    }

    // === 确认处理 ===
    async function handleConfirm(userId, chatId, msgId, type) {
        const state = confirmationStates.get(userId);
        if (!state || state.type !== type) return;

        try {
            if (type === ConfirmationType.SINGLE_MESSAGE)
                await doSendSingle(chatId, msgId, state.data);
            else if (type === ConfirmationType.GLOBAL_NOTIFICATION)
                await doSendGlobal(chatId, msgId, state.data);
        } finally {
            confirmationStates.delete(userId);
        }
    }

    // === 发送单独消息 ===
    async function doSendSingle(chatId, msgId, data) {
        const { targetId, targetUser, text } = data;
        try {
            await $.bot.editMessageText(`⏳ 正在发送中...`, {
                chat_id: chatId,
                message_id: msgId
            });

            const sent = await safeSendMessage(targetId, text);

            const updatedText = `
✅ <b>消息已发送成功</b>
用户: <code>${targetId}</code> (${targetUser.username || '未知用户'})
内容: <code>${text}</code>
            `;

            const keyboard = {
                inline_keyboard: [
                    [{ text: '↩️ 撤回该消息', callback_data: `recall_msg:${targetId}:${sent.message_id}` }]
                ]
            };

            await $.bot.editMessageText(updatedText, {
                chat_id: chatId,
                message_id: msgId,
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (err) {
            await $.bot.editMessageText(`❌ 发送失败: ${err.message}`, {
                chat_id: chatId,
                message_id: msgId
            });
        }
    }

    // === 发送全局通知 ===
    async function doSendGlobal(chatId, msgId, data) {
        const { text, targetUsers } = data;
        const startTime = Date.now();

        await $.bot.editMessageText(`⏳ 正在向 ${targetUsers.length} 名用户发送中...`, {
            chat_id: chatId,
            message_id: msgId
        });

        const success = [];
        const failed = [];

        const BATCH_SIZE = 10;
        const DELAY_MS = 800;
        const TIMEOUT_MS = 2000;

        for (let i = 0; i < targetUsers.length; i += BATCH_SIZE) {
            const batch = targetUsers.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(async (user) => {
                    try {
                        const sent = await safeSendMessage(user.userId, text, TIMEOUT_MS);
                        return { ok: true, userId: user.userId, messageId: sent.message_id };
                    } catch (err) {
                        return { ok: false, userId: user.userId, error: err.message };
                    }
                })
            );

            for (const r of results) {
                if (r.value?.ok) success.push(r.value);
                else failed.push(r.value || { userId: '未知', error: '未知错误' });
            }

            if (i + BATCH_SIZE < targetUsers.length) {
                await new Promise(res => setTimeout(res, DELAY_MS));
            }
        }

        const endTime = Date.now();
        const costSeconds = ((endTime - startTime) / 1000).toFixed(2);

        // 生成任务 ID
        const taskId = `task_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        recallTasks.set(taskId, success);

        const resultText = `
📢 <b>全局通知发送完成</b>
✅ 成功: ${success.length}/${targetUsers.length}
❌ 失败: ${failed.length}
🕒 耗时: <b>${costSeconds}</b> 秒
内容:
<code>${text}</code>
        `;

        const keyboard = {
            inline_keyboard: [
                ...success.slice(0, 10).map(s => [
                    { text: `↩️ 撤回 ${s.userId}`, callback_data: `recall_msg:${s.userId}:${s.messageId}` }
                ]),
                [{ text: '🧹 撤回全部成功消息', callback_data: `recall_all:${taskId}` }]
            ]
        };

        await $.bot.editMessageText(resultText, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    }

    // === 撤回单条 ===
    async function handleRecall(adminChatId, msgId, targetId, messageId) {
        try {
            await $.bot.deleteMessage(Number(targetId), Number(messageId));
            await $.bot.editMessageText(`✅ 已撤回用户 ${targetId} 的消息`, {
                chat_id: adminChatId,
                message_id: msgId
            });
        } catch (err) {
            await $.bot.editMessageText(`❌ 撤回失败: ${err.message}`, {
                chat_id: adminChatId,
                message_id: msgId
            });
        }
    }

    // === 撤回全部 ===
    async function handleRecallAll(adminChatId, msgId, successList, taskId) {
        try {
            let successCount = 0, failCount = 0;
            for (let i = 0; i < successList.length; i++) {
                const { userId, messageId } = successList[i];
                try {
                    await $.bot.deleteMessage(Number(userId), Number(messageId));
                    successCount++;
                } catch {
                    failCount++;
                }

                if (i % 5 === 0) {
                    await $.bot.editMessageText(
                        `🧹 正在撤回 ${successList.length} 条消息...\n✅ 已完成: ${i + 1}/${successList.length}`,
                        { chat_id: adminChatId, message_id: msgId }
                    );
                }

                await new Promise(r => setTimeout(r, 200));
            }

            recallTasks.delete(taskId);

            const result = `
✅ <b>撤回完成</b>
成功撤回: ${successCount}
失败: ${failCount}
            `;
            await $.bot.editMessageText(result, {
                chat_id: adminChatId,
                message_id: msgId,
                parse_mode: 'HTML'
            });
        } catch (err) {
            await $.bot.editMessageText(`❌ 撤回全部失败: ${err.message}`, {
                chat_id: adminChatId,
                message_id: msgId
            });
        }
    }

    // === 安全发送 ===
    async function safeSendMessage(chatId, text, timeoutMs = 2000, options = {}) {
        const sendPromise = $.bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('超时或用户已屏蔽')), timeoutMs)
        );
        return Promise.race([sendPromise, timeoutPromise]);
    }

    async function sendMessage(chatId, text, options = {}) {
        const messageService = $.services.message;
        return messageService.sendText(chatId, text, { parse_mode: 'HTML', ...options });
    }

    init();
    return { sendMessage };
};
