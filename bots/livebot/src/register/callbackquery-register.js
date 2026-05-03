// ******************************************
// 回调功能模块
// ******************************************

const {setScheduleTime, setConfig} = require("../utils/crontab-utils");
const xiuren = require('../spiderOther/images/xiurenAPI');
const sendBody = require('../utils/sendModel');
const cg = require('../spider/51cg');
const { setNotifyConfig, notifySubscriberChats} = require('../utils/notifySubscriberChats-utils');
const github = require('../utils/github-utils');

module.exports = async ($, dbm, config) => {
    // 优先设置定时任务
    setConfig($);
    setNotifyConfig($, dbm, config);
    let getDBTime;
    try {
        getDBTime = await dbm.getSettings('scheduleTime');
        if (!getDBTime || !getDBTime['value']) {
            getDBTime = '*/60 * * * *';
        }else {
            getDBTime = getDBTime['value'];
        }
    } catch (e) {
        getDBTime = '*/60 * * * *';
    }
    setScheduleTime(getDBTime);

    // 获取cg列表数据
    let siteCgList = await dbm.getSettings('cg');
    if (siteCgList && siteCgList['value']) {
        siteCgList = siteCgList['value'].split('#');
    } else {
        siteCgList = [];
    }

    // 处理回调查询的函数
    $.bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const messageService = $.services.message;

        // **************************
        // 删除此消息
        // **************************
        // 检查回调查询的数据
        if (query.data === 'delete_message') {
            try {
                // 删除消息
                await $.bot.deleteMessage(chatId, messageId);
                // 发送确认消息
                await $.bot.answerCallbackQuery(query.id, `消息已删除!`);
            } catch (error) {
                $.log('Error deleting message:' + error.message, 'error');
                // 发送错误消息
                await messageService.sendText(chatId, '删除消息时出错。');
            }
        }

        // **************************
        // 取消关注
        // **************************
        // 检查回调查询的数据是否包含 'unfollow_'
        if (query.data.startsWith('unfollow_')) {
            // 提取 vtb.mid
            let vtbMid = query.data.replace('unfollow_', '');
            try {
                // 检查是否已取消关注
                let isWatch = await dbm.existsWatch(chatId, vtbMid);
                if (isWatch) {
                    // 获取主播信息
                    let vtb = await dbm.getVtbByMid(vtbMid);
                    if (vtb) {
                        let delWatch = await dbm.delWatch(chatId, vtbMid);
                        if (delWatch) {
                            let username = vtb.username;
                            let targetUrl = vtb.targetUrl;
                            // 发送确认消息
                            await messageService.sendText(chatId,
                                '已取消关注 `' + username + '`。\n不小心点错了\n [' + username + '](' + targetUrl + ')',
                                { parse_mode: 'Markdown' });
                        } else {
                            await messageService.sendText(chatId,
                                '取关失败，请重试！');
                        }
                    } else {
                        await messageService.sendText(chatId, '无法找到主播信息，可能早已取关。', { parse_mode: 'Markdown' });
                    }
                } else {
                    await messageService.sendText(chatId, '早已取关了 `' + vtbMid + '`', { parse_mode: 'Markdown' });
                }
            } catch (error) {
                $.log('Error unfollowing:' + error.message, 'error');
                // 发送错误消息
                await messageService.sendText(chatId, '取消关注时出错。');
            }
        }


        // **************************
        // 允许使用机器人
        // **************************
        if (query.data.startsWith('allow_')) {
            let userInfo = query.data.replace('allow_', '').split('_8_');
            // 提取 userId
            let userId = userInfo[0];
            let username = userInfo[1];
            try {
                let addU = await dbm.addUser(userId, chatId, 1, username);
                if (addU) {
                    // 给管理员发
                    await messageService.sendText(chatId, '用户' + userId + "，已被您通过啦！");
                    // 给被通过的用户发
                    await messageService.sendText(userId, '恭喜*' + username + "*，您可以正常使用机器人啦！", { parse_mode: 'Markdown' });
                } else {
                    $.log('允许用户失败，' + username + '用户在黑名单。', 'error');
                    let unBlackCallbackData = 'unBlack_' + userId + '_8_' + username;
                    let keyboard = {
                        inline_keyboard: [
                            [{text: '取消黑名单', callback_data: unBlackCallbackData},
                                {text: '删除消息', callback_data: 'delete_message'},]
                        ]
                    };
                    let sendMsg = '允许用户失败，' + username + '用户在黑名单。' + '\nID：`' + userId + '`';
                    await messageService.sendText(chatId,
                        sendMsg,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: JSON.stringify(keyboard)
                        });
                }
            } catch (error) {
                $.log('Error allow:' + error.message, 'error');
                // 发送错误消息
                await messageService.sendText(chatId, '允许用户授权出错。');
            }
        }

        // **************************
        // 用户黑名单变白
        // **************************
        if (query.data.startsWith('unBlack_')) {
            let userInfo = query.data.replace('unBlack_', '').split('_8_');
            // 提取 userId
            let userId = userInfo[0];
            let username = userInfo[1];
            try {
                let updateUserP = await dbm.updateUserPermissionLevel(userId, 1);
                if (updateUserP) {
                    // 给管理员发
                    await messageService.sendText(chatId, '用户' + userId + "，已被您捞起啦！");
                    // 给被通过的用户发
                    await messageService.sendText(userId, '恭喜*' + username + "*，您可以正常使用机器人啦！", { parse_mode: 'Markdown' });
                } else {
                    $.log('允许用户变白失败，' + username + '用户在黑名单。', 'error');
                }
            } catch (error) {
                $.log('Error allow:' + error.message, 'error');
                // 发送错误消息
                await messageService.sendText(chatId, '允许用户变白出错。');
            }
        }




        if (query.data.startsWith('EditChannel_')) {
            let userInfo = query.data.replace('EditChannel_', '').split('_');
            // 提取 userId
            const userId = userInfo[0];
            // 群组查看
            const vtbList = await dbm.getVtbs();
            const user = await dbm.getUserByUserId(userId);
            const watchList = await dbm.getWatchByChatid(userId);
            // 使用 map 方法获取所有对象中的 name 字段内容
            const roomidList = watchList.map(watch => watch.roomid);
            let userListMessage = "*" + user.username + "* 请选择您想要的网站信息发布：\n\n";
            let inlineKeyboard = [];
            const cgs = await dbm.getSettings('cg');
            const cgList = cgs['value'].split("#");
            vtbList.forEach(vtb => {
                if (!Number.isInteger(vtb.liveStatus) && cgList.includes(vtb.site)) {
                    // vtb.liveStatus 不是整数，在这里执行相应的操作
                    let title = '';
                    if (roomidList.includes(vtb.roomid)) {
                        title = '🎉' + vtb.username + ' [' + vtb.roomid + ']';
                    } else {
                        title = vtb.username + ' [' + vtb.roomid + ']';
                    }
                    inlineKeyboard.push([
                        {
                            text: title,
                            callback_data: `EditSiteChannel_${vtb.roomid}_${userId}_${user.fromId}`
                        }
                    ]);
                }
            });

            if (inlineKeyboard.length === 0) {
                userListMessage = "当前没有任何站点可供选择。";
                inlineKeyboard = undefined; // 如果没有群组，不要添加 inline_keyboard
            }

            // 发送消息时包含 inline_keyboard
            await messageService.sendText(user.fromId, userListMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: inlineKeyboard
                }
            });
        }

        if (query.data.startsWith('EditSiteChannel_')) {
            let userInfo = query.data.replace('EditSiteChannel_', '').split('_');
            // 提取 userId
            const roomid = userInfo[0];
            const userId = userInfo[1];
            const fromId = userInfo[2];

            // 获取是否存在
            const isExists = await dbm.existsWatch(userId, roomid);
            if (isExists) {
                const delWatchChannle = await dbm.delWatchChannle(userId, roomid);
                if (delWatchChannle) {
                    await messageService.sendText(fromId, `*${roomid}* 已删除。`, { parse_mode: 'Markdown' });
                } else {
                    await messageService.sendText(fromId, `*${roomid}* 删除失败。`, { parse_mode: 'Markdown' });
                }
            } else {
                const addWatch = await dbm.addWatch(userId, roomid);
                console.log(addWatch);
                if (addWatch) {
                    await messageService.sendText(fromId, `*${roomid}* 已添加。`, { parse_mode: 'Markdown' });
                } else {
                    await messageService.sendText(fromId, `*${roomid}* 添加失败。`, { parse_mode: 'Markdown' });
                }
            }
        }

        // **************************
        // 定时重启设置
        // **************************
        if (query.data.startsWith('scheduleRestart_')) {

            const [prefix, cronExpression, description] = query.data.split('_');

            if (cronExpression === 'none') {
                try {
                    // 用户选择了 "不重启"
                    setScheduleTime('none'); // 取消定时任务
                    await messageService.sendText(chatId, `已取消自动重启计划。`);
                } catch (err) {
                    $.log(err.message, 'error');
                }
            } else {
                // 设置新的自动重启计划
                setScheduleTime(cronExpression);
                await messageService.sendText(chatId, `自动重启计划已设置为每 ${description}。`);
            }
            // 修改数据库内容
            if (await dbm.updateSettingValue("scheduleTime", cronExpression)) {
                $.log(chatId + " 修改定时重启时间为: " + cronExpression);
            } else {
                $.log(chatId + " 修改定时重启" + cronExpression + "失败", 'error');
            }
        }


        // **************************
        // 秀人网查看
        // **************************
        // 插入$
        xiuren.setConfig($);
        if (query.data.startsWith('xiurenShow_')) {
            const [prefix, url] = query.data.split('_');
            xiuren.sendDetail(chatId, url);
        }
        // 随机
        if (query.data.startsWith('xiurenRandom_')) {
            const [prefix, page] = query.data.split('_');
            xiuren.sendRandom(chatId, page);
        }

        // 随机
        if (query.data.startsWith('video_')) {
            const [prefix, page] = query.data.split('_');
            sendBody.sendRandomVideo(chatId, $);
        }

        // 随机电影
        if (query.data.startsWith('3movie_')) {
            const [prefix, page] = query.data.split('_');
            sendBody.sendRandomVideo(chatId, $, '3movie');
        }

        // 随机
        if (query.data.startsWith('weimi_')) {
            const [prefix, page] = query.data.split('_');
            sendBody.sendRandomWeimi(chatId, $);
        }

        // 发送
        if (query.data.startsWith('sendCg_')) {
            const [prefix, page] = query.data.split('_');
            if ($.cgList.length > 0) {
                const currentCg = $.cgList[page - 1];
                currentCg.url = await cg.getM3u8(currentCg.targetUrl);
                // 发送
                await notifySubscriberChats(currentCg, siteCgList);
                // 发送内容
                await messageService.sendText(chatId, `【${currentCg.title}】发送`);
            } else {
                await messageService.sendText(chatId, `请先/cg <URL>`);
            }
        }


        // **************************
        // 添加类型
        // **************************
        // 检查回调查询的数据是否包含 'douyin_'
        if (query.data.startsWith('douyin_')) {
            const [prefix, midd, typee] = query.data.split('_');
            try {
                let mid = midd;
                let type = typee;
                if (midd === 'fudai'){
                    mid = 'fudai_' + type;
                    type = 'luckys';
                }
                // 进行设置分类
                let isWatch = await dbm.updateVtbByCategory(mid, type);
                if (isWatch) {
                    await messageService.sendText(chatId, '设置【' + config.keyObject[type] + '】成功！', { parse_mode: 'Markdown' });
                } else {
                    await messageService.sendText(chatId, '设置【' + config.keyObject[type] + '】失败！', { parse_mode: 'Markdown' });
                }
            } catch (error) {
                $.log('Error douyin:' + error.message, 'error');
                // 发送错误消息
                await messageService.sendText(chatId, '添加类型出错。');
            }
        }

        // **************************
        // 查看主播列表
        // **************************
        // 检查回调查询的数据是否包含 'list_'
        if (query.data.startsWith('list_')) {
            const [prefix, site] = query.data.split('_');
            try {
                // 检查是否已取消关注
                let watchArr = await dbm.getWatchByChatid(chatId);
                const watchs = watchArr.filter(item => item.site === site);
                let message = '您的监控列表：\n\n';
                if (watchs.length > 0) {
                    message += $.formatWatchMessagePartial(watchs);
                    let sentMessage = await messageService.sendText(chatId, message, { parse_mode: 'Markdown' });
                    // 等待30s后删除消息
                    setTimeout(async () => {
                        try {
                            await $.bot.deleteMessage(chatId, sentMessage.message_id);
                        } catch (error) {
                            $.log('删除消息失败:' + error.message, 'error');
                        }
                    }, 0.5 * 60 * 1000);
                } else {
                    await messageService.sendText(chatId, '你还没有关注任何主播哦！');
                }
            } catch (error) {
                $.log('Error list:' + error.message, 'error');
                // 发送错误消息
                await messageService.sendText(chatId, '查看主播列表出错。');
            }
        }




        // **************************
        // github操作
        // **************************
        // 检查回调查询的数据是否包含 'github_'
        if (query.data.startsWith('github_')) {
            const [prefix, typ] = query.data.split('_');
            if (typ === 'push'){
                github.pushGitHub($, chatId);
            }
        }


        // 一键发布视频
        if (query.data.startsWith('faBu_')) {
            const [prefix, chatId, channelId] = query.data.split('_');
            sendBody.faBuVideo(chatId, channelId, $, dbm);
        }


        // 匹配删除指令的回调数据（格式：delete_unwatched_{mid}_{roomid}）
        if (query.data.startsWith('delete_unwatched_')) {
            try {
                // 解析mid和roomid
                const [, , midd, roomidd, username] = query.data.split('_');
                let mid = midd;
                let roomid = roomidd;
                if (mid === 'fudai'){
                    mid = midd + '_' + roomidd;
                    roomid = mid;
                }

                if (!mid || !roomid) {
                    return $.bot.answerCallbackQuery(query.id, { text: "参数错误，无法删除" });
                }

                // 执行删除操作
                const deleteResult = await dbm.deleteVtbByMidAndRoomid(mid, roomid);

                if (deleteResult) {
                    // 删除成功：直接发送新的成功提示消息给用户
                    await messageService.sendText(
                        chatId,
                        "✅ 已成功删除*" + mid + "*的主播",
                        { parse_mode: 'Markdown' }
                    );
                    // 同时给按钮点击反馈
                    return $.bot.answerCallbackQuery(query.id, { text: "删除成功" });
                } else {
                    return $.bot.answerCallbackQuery(query.id, { text: "删除失败，该主播可能已被移除" });
                }

            } catch (error) {
                console.error("删除未关注主播失败:", error);
                return $.bot.answerCallbackQuery(query.id, { text: "删除失败，请稍后重试" });
            }
        }

        try {
            // 确认回调已处理
            await $.bot.answerCallbackQuery(query.id);
        } catch (e) {

        }

    });

    $.log("回调功能模块加载完毕。。。");
}

