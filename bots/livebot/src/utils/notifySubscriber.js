// ******************************************
// 通知函数
// ******************************************

const fenci = require('./fenci/fenci');

async function notifySubscriberChats(vtb, $, dbm, config) {
    // 加一个吃瓜是否发送
    // 获取cg列表数据
    let siteCgList = await dbm.getSettings('cg');
    if (siteCgList) {
        siteCgList = siteCgList['value'].split('#');
    } else {
        siteCgList = [];
    }
    let isCg = false;
    if (siteCgList.includes(vtb.site)) {
        const getCgByTargetUrl = await dbm.getCgByTargetUrl(vtb.targetUrl);
        if (getCgByTargetUrl) {
            $.log(`Cg => 发送 ${vtb.title} 【失败】【已存在】, 地址: ${vtb.targetUrl}`);
            return 0;
        }
        isCg = true;
    }

    $.log('Let\'s notify subscribers about 更新了' + vtb.username + '  ' + vtb.site);
    let username = vtb.username;
    if (vtb.username === '') {
        username = vtb.mid;
    }
    let head = '`' + username + '` ';
    let body = '';
    let baseUrl = '';
    // 源站连接处理
    baseUrl = vtb.site !== 'www.pandalive.co.kr' ? vtb.site : `${vtb.site}/live/play`;
    baseUrl = vtb.site !== 'live.kuaishou.com' ? baseUrl : `${vtb.site}/u`;
    // 构建消息体
    if (vtb.liveStatus !== "0") {
        // title处理
        body += `\n\n主题👉${vtb.title}\n\n`;
        try {
            body += `${fenci.segmentText(title).join('#')}\n`
        }catch (err){
            $.log(`分词失败: ${vtb.title} ${err.message}`, 'error');
        }
        // 特殊处理pandalive 開播時間
        if (vtb.site === 'www.pandalive.co.kr') {
            body += '开播时间👉' + vtb.pic.split('#')[1] + '(韩国时间早一小时)\n';
        }
        // 是否有可以用播放源
        if (vtb.url !== '' && vtb.url.split('/')[2] !== vtb.site) {
            if (!vtb.targetUrl) {
                body += '源站👉[前往](https://' + baseUrl + '/' + vtb.roomid + ')\n';
            } else {
                body += '源站👉[前往](' + vtb.targetUrl + ')\n';
            }
            // 多个播放地址处理
            const urlList = vtb.url.split("#");
            let count = 0;
            // 特殊站点处理
            const deSite = ["18hlw.com", "hlj.fun", "rou.video"];
            if (urlList.length >= 2) {
                urlList.forEach((url, index) => {
                    count += 1;
                    if (deSite.includes(vtb.site)) {
                        url = config.extendAPI + vtb.targetUrl + "&pg=" + count;
                        body += '第' + count + '集 👉▶️[播放](' + url.replace(/&/g, "&amp;") + ')\n';
                    } else {
                        body += '第' + count + '集 👉▶️[播放](' + url.replace(/&/g, "&amp;") + ')\n';
                    }
                });
            } else {
                if (deSite.includes(vtb.site)) {
                    url = config.extendAPI + vtb.targetUrl + "&pg=1";
                    body += '直接播放👉▶️[播放](' + url.replace(/&/g, "&amp;") + ')\n';
                } else {
                    body += '直接播放👉▶️[播放](' + vtb.url.replace(/&/g, "&amp;") + ')\n';
                }
            }
        } else {
            body += '源站👉[前往](' + vtb.targetUrl + ')\n';
        }
    } else {
        // 下播的消息体
        if (vtb.site === 'fd.live.douyin.com') body = '福袋结束了！';
    }

    // 查看所有关注用户
    let watches = await dbm.getWatchByMid(vtb.mid);

    for (let [index, watch] of watches.entries()) {
        const targetID = watch.chatid;
        // 第一步删除前面的消息
        if (watch.messageId !== null && targetID > 0 && watch.messageId > 0) {
            try {
                await $.bot.deleteMessage(targetID, watch.messageId);
            } catch (e) {
                $.log('历史消息id-' + watch.messageId + '删除失败 =》 ' + e.message, 'error');
            }
        }
        // 第二步处理特殊站点
        if (targetID > 0 && vtb.site !== 'fd.live.douyin.com' && siteCgList.includes(vtb.site)) {
            head += vtb.liveStatus === "1" ? '开播啦！' : 'config[config.environment].proxy。';
        }
        // 第三步开始发布消息
        try {
            // 保存发送返回的消息id
            let messageBody = null;
            // 发送消息
            if (vtb.pic !== '' && vtb.liveStatus !== "0") {
                // 发送图片消息
                let unfollowCallbackData = `unfollow_${vtb.mid}`;
                let targetUrl = 'https://' + baseUrl + '/' + vtb.roomid;
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
                // 发送图片消息
                messageBody = await $.bot.sendPhoto(targetID, vtb.pic, {
                    caption: head + body,
                    parse_mode: 'Markdown',
                    reply_markup: JSON.stringify(keyboard)
                });
            } else {
                messageBody = await $.bot.sendMessage(targetID, head + body, $.defTgMsgForm);
            }
            // 保存到watch中
            const updateWatchMessageId = await dbm.updateWatchMessageId(targetID, watch.mid, messageBody.message_id);
            if (!updateWatchMessageId) {
                $.log('添加messageId错误', 'error');
            }
            if (isCg){
                // 发送成功保存cg
                const addCg = await dbm.addCg(vtb.username, vtb.liveStatus, vtb.title, vtb.site, vtb.pic, vtb.url, vtb.targetUrl);
                if (addCg) {
                    $.log(`Cg => 添加 ${vtb.title} 【成功】, 地址: ${vtb.targetUrl}`);
                } else {
                    $.log(`Cg => 添加 ${vtb.title} 【失败】, 地址: ${vtb.targetUrl}`);
                }
            }

        } catch (error) {
            // 处理发送消息时可能出现的错误
            if (error.response && (error.response.statusCode === 400 || error.response.statusCode === 403)) {
                // 可能是用户删除了机器人，或者聊天不存在
                $.log('无法发送消息到用户' + targetID + '，可以消息体有问题，可能是因为用户删除了机器人或聊天不存在:' + error.message, 'error');
                // 您可以选择在这里执行一些清理操作，比如从数据库中移除这个watch
                // 修改用户权限为0
                // dbm.updateUserPermissionLevel(targetID, 0);
                // $.log('已将该用户: ', targetID + ' 下级处理!');
            } else {
                // 其他错误
                $.log('发送给' + targetID + '消息时出现错误:' + error.message, 'error');
            }
        }

        // 用于控制在发送每20条消息后暂停1秒钟。
        if (index % 20 === 0 && index !== 0) {
            await $.sleep(1000);
        }
    }
}

module.exports = {
    notifySubscriberChats
}
