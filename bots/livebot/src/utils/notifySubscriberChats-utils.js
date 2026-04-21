const {segmentText} = require("./fenci/fenci");

let dbm;
let $;
let config;

function setNotifyConfig(inc, db, conf) {
    dbm = db;
    $ = inc;
    config = conf;
}

// 发送给所有订阅用户消息
async function notifySubscriberChats(vtb, siteCgList, site19List) {
    let isCg = false;
    if (siteCgList.includes(vtb.site)) {
        const getCgByTargetUrl = await dbm.getCgByTargetUrl(vtb.targetUrl);
        if (getCgByTargetUrl) {
            $.log(`Cg => 发送 ${vtb.title} 【失败】【已存在】, 地址: ${vtb.targetUrl}`);
            return 0;
        }
        isCg = true;
    }
    let is19 = false;
    if (site19List.includes(vtb.site)) {
        is19 = true;
    }

    $.log('Let\'s notify subscribers about 更新了【' + vtb.username + '】  (来源:' + vtb.site + ' ' + vtb.mid + ')');
    const head = `[${vtb.username}](${vtb.targetUrl})`;
    const body = await buildBody(vtb);

    let watches = await dbm.getWatchByMid(vtb.mid);

    for (let [index, watch] of watches.entries()) {
        await handleWatchNotification(watch, head, body, vtb, isCg, is19);

        if (index % 20 === 0 && index !== 0) {
            await $.sleep(1000);
        }
    }
}

// 通知消息的消息主体说明
async function buildBody(vtb) {
    let body = '';
    let baseUrl = vtb.site !== 'www.pandalive.co.kr' ? vtb.site : `${vtb.site}/live/play`;
    baseUrl = vtb.site !== 'live.kuaishou.com' ? baseUrl : `${vtb.site}/u`;

    if (vtb.liveStatus !== "0") {
        body += `\n主题👉${vtb.title}\n`;
        if (vtb.site === 'www.pandalive.co.kr') {
            body += '开播时间👉' + vtb.pic.split('#')[1] + '(韩国时间早一小时)\n';
        }
        body += buildUrls(vtb, baseUrl);
    } else {
        body = await buildOfflineBody(vtb);
    }
    return body;
}

// 直播间地址
function buildUrls(vtb, baseUrl) {
    let body = '';
    if (vtb.url !== '' && vtb.url.split('/')[2] !== vtb.site) {
        if (!vtb.targetUrl) {
            body += '源站👉[前往](https://' + baseUrl + '/' + vtb.roomid + ')\n';
        } else {
            body += '源站👉[前往](' + vtb.targetUrl + ')\n';
        }
        body += buildPlayUrls(vtb);
    } else {
        body += '源站👉[前往](' + vtb.targetUrl + ')\n';
    }
    return body;
}

// 播放地址处理方法
function buildPlayUrls(vtb) {
    const urlList = vtb.url.split("#");
    const deSite = ["h4ywz1.yhnmxvyv.me", "www.51cg1.com", "heiliao.com", "hlj.fun", "rou.video"];
    let body = '';
    if (deSite.includes(vtb.site)) {
        body = addSegmentation(vtb.title);
    }
    urlList.forEach((url, index) => {
        const count = index + 1;
        if (deSite.includes(vtb.site)) {
            url = config.extendAPI + vtb.targetUrl + "&pg=" + count;
            body += '第' + count + '集 👉▶️[播放](' + url.replace(/&/g, "&amp;") + ')\n';
        } else {
            body += '直接播放 👉▶️[播放](' + url.replace(/&/g, "&amp;") + ')\n';
        }
    });
    return body;
}

// 分词方法
function addSegmentation(title) {
    try {
        let result = '';
        for (let segmentTextElement of segmentText(title)) {
            if (segmentTextElement.length > 1) {
                result += `#${segmentTextElement} `
            }
        }
        return result + '\n';
    } catch (err) {
        $.log(`分词失败: ${title} ${err.message}`, 'error');
        return '';
    }
}

// 计算当前直播间直播时长
async function buildOfflineBody(vtb) {
    let body = '';
    if (vtb.site === 'fd.live.douyin.com') {
        body = ' 福袋结束了！';
    } else {
        const live = await dbm.getLiveHistoryOrderByMid(vtb.mid);
        if (live) {
            const duration = calculateLiveDuration(live.startLive, live.endLive);
            body += `\n❤️直播时长: *${duration.hours}*小时*${duration.minutes}*分钟 *${duration.seconds}*秒`;
        }
    }
    return body;
}

// 抖音福袋计算开奖剩余时间方法
function calculateLiveDuration(startLive, endLive) {
    const start = parseInt(startLive);
    const end = parseInt(endLive);
    const diffInMilliseconds = Math.abs(end - start);
    const diffInSeconds = diffInMilliseconds / 1000;
    const hours = Math.floor(diffInSeconds / 3600);
    const secondsAfterHours = diffInSeconds % 3600;
    const minutes = Math.floor(secondsAfterHours / 60);
    const seconds = Math.floor(secondsAfterHours % 60);

    return {hours, minutes, seconds};
}

async function handleWatchNotification(watch, head, body, vtb, isCg, is19) {
    const targetID = watch.chatid;
    const messageId = watch.messageId;
    let historyMessage = '';

    if (messageId !== null && targetID > 0 && messageId > 0) {
        messageId.split('#').forEach(async (msgId) => {
            try {
                await $.bot.deleteMessage(targetID, parseInt(msgId));
            } catch (e) {
                $.log('历史消息id-' + messageId + ' 删除失败 =》 ' + e.message, 'error');
                historyMessage += messageId + "#";
            }
        });
    }

    if (targetID > 0 && vtb.site !== 'fd.live.douyin.com') {
        if (vtb.liveStatus === "1") {
            head += ' 🎬开播啦！';
            head += '\n#' + config.keyObject[vtb.category];
        } else if (vtb.liveStatus === "0") {
            head += ' 📴下播了！';
        } else {
            head += ' 🆕新消息!';
        }
    }

    try {
        let messageBody = await sendNotification(targetID, head, body, vtb, isCg, is19);
        await saveWatchMessageId(targetID, watch.mid, historyMessage + messageBody.message_id);
        if (isCg) {
            await saveCg(vtb);
        }
    } catch (error) {
        handleSendError(error, targetID);
    }
}

// 发送消息（直播和未直播两种处理方法）
async function sendNotification(targetID, head, body, vtb, isCg, is19) {
    if (vtb.pic !== '' && vtb.liveStatus !== "0") {
        let unfollowCallbackData = `unfollow_${vtb.mid}`;
        let targetUrl = 'https://' + vtb.site + '/' + vtb.roomid;
        let keyboard = {
            inline_keyboard: [
                [{text: '取消关注', callback_data: unfollowCallbackData},
                    {text: '删除消息', callback_data: 'delete_message'},
                    {text: '跳转链接', url: targetUrl}],
            ]
        };
        if (targetID < 0) {
            keyboard = {inline_keyboard: []};
        }
        return await $.bot.sendPhoto(targetID, vtb.pic, {
            caption: head + body,
            parse_mode: 'Markdown',
            has_spoiler: is19, // 针对特定平台开启遮挡
            reply_markup: JSON.stringify(keyboard)
        });
    } else {
        return await $.bot.sendMessage(targetID, head + body, $.defTgMsgForm);
    }
}

// 保存发送成功的消息id
async function saveWatchMessageId(targetID, mid, messageId) {
    const updateWatchMessageId = await dbm.updateWatchMessageId(targetID, mid, messageId);
    if (!updateWatchMessageId) {
        $.log(`添加messageId错误 【${messageId}】`, 'error');
    }
}

// 保存cg信息地址
async function saveCg(vtb) {
    const addCg = await dbm.addCg(vtb.username, vtb.liveStatus, vtb.title, vtb.site, vtb.pic, vtb.url, vtb.targetUrl);
    if (addCg) {
        $.log(`Cg => 添加 ${vtb.title} 【成功】, 地址: ${vtb.targetUrl}`);
    } else {
        $.log(`Cg => 添加 ${vtb.title} 【失败】, 地址: ${vtb.targetUrl}`);
    }
}

// 拦截错误处理
function handleSendError(error, targetID) {
    if (error.response && (error.response.statusCode === 400 || error.response.statusCode === 403)) {
        $.log('无法发送消息到用户' + targetID + '，可能消息体有问题，可能是因为用户删除了机器人或聊天不存在:' + error.message, 'error');
    } else {
        $.log('发送给' + targetID + '消息时出现错误:' + error.message, 'error');
    }
}

module.exports = {
    setNotifyConfig,
    notifySubscriberChats
};
