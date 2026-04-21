
let weimiHost = '';


// 随机video消息模块
async function sendRandomVideo(chatId, $, type = 'video'){
    try {
        let videoList = $.videoMessages;
        if (type !== ""){
            videoList = $.videoMessages.filter(video => video.type === type);
        }
        const randomNumber = $.getRandomNumber(videoList.length);
        const videoBody = videoList[randomNumber - 1];
        // 发送视频消息
        let keyboard = {
            inline_keyboard: [
                [{text: '再来一发', callback_data: type + '_random'}]
            ]
        };
        console.log(videoBody)
        // 处理发送
        $.bot.sendVideo(chatId, videoBody.fileId,{
            caption: videoBody.caption,
            reply_markup: JSON.stringify(keyboard)
        })
    } catch (error) {
        $.log('Error processing /video command:' + error.message, 'error');
    }
}


// 发布video消息模块
async function faBuVideo(chatId,channelId, $, dbm, type = 'video') {
    try {
        const videoMessages = await dbm.getMessagesAll();
        // 获取对应类型的视频列表
        let videoList = type === "" ? videoMessages : videoMessages.filter(video => video.type === type);
        
        // 查找匹配file_id的视频（直接使用find）
        const videoBody = videoList[videoList.length - 1];
        
        // 检查是否找到视频
        if (!videoBody) {
            throw new Error(`未找到file_id为最后一个视频`);
        }
        
        // 发送视频消息
        await $.bot.sendVideo(channelId, videoBody.fileId, {
            caption: videoBody.caption || '' // 防止无caption时报错
        });
        $.bot.sendMessage(chatId, '发布成功！');
        
    } catch (error) {
        $.log('发布视频失败：' + error.message, 'error');
        $.bot.sendMessage(chatId, '发布失败！');
        throw error; // 可根据需要决定是否向外抛出
    }
}

// 随机微密圈消息模块
async function sendRandomWeimi(chatId, $, config){
    try {
        let weimiList = $.weimiMessages;
        const randomNumber = $.getRandomNumber(weimiList.length);
        const weimiBody = weimiList[randomNumber - 1];
        // 发送图片消息
        let keyboard = {
            inline_keyboard: [
                [{text: '再来一发', callback_data: 'weimi_random'}]
            ]
        };
        let img = weimiBody.img;
        if (!img.includes('.jpg')) {
            img += '.jpg';
        }
        const tarImg = "https://api.buxiangyao.link/weimiQ/?img=" + img.replace("d1e5aemxpyeang.cloudfront.net", config.weimiHost);
        // 处理发送
        $.bot.sendPhoto(chatId, tarImg, {
            caption: weimiBody.title + '\n\n日期: ' + weimiBody.time + '\n\n' + '源站👉[前往](' + weimiBody.href + ')',
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(keyboard)
        });
    } catch (error) {
        $.log('Error processing /weimi command:' + error.message, 'error');
    }
}

module.exports = {
    sendRandomVideo,
    sendRandomWeimi,
    faBuVideo
}
