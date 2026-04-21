const xiuren = require('../spiderOther/images/xiurenAPI');
const njavtv = require('../spiderOther/search/jableAPI');
const sendBody = require('../utils/sendModel');

const path = require('path');

// ********************
// happy功能
// ********************

module.exports = async ($, dbm, config) => {

    // 插入$
    xiuren.setConfig($);

    // 随机一份秀人图
    $.bot.onText(/^\/xr(?:\s*(.*))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const page = match[1] || 0; // 如果没有匹配到内容，默认使用空字符串
        try {
            // 处理发送随机内容的逻辑
            xiuren.sendRandom(chatId, page);
            $.log(`Command /xr received with parameter: ${page}`);
        } catch (error) {
            $.log('Error processing /xr command:' + error.message, 'error');
        }
    });

    // 插入$
    njavtv.setConfig($);

    // 随机一份AV视频
    $.bot.onText(/^\/njav(?:\s*(.*))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const url = match[1] || 0; // 如果没有匹配到内容，默认使用空字符串
        try {
            // 处理发送随机内容的逻辑
            njavtv.sendDetail(chatId, url);
            $.log(`Command /njav received with parameter: ${page}`);
        } catch (error) {
            $.log('Error processing /njav command:' + error.message, 'error');
        }
    });

    // 加载videoMessages
    $.videoMessages = await dbm.getMessagesAll();
    $.emitter.on('updateMessages',async () => {
        $.videoMessages = await dbm.getMessagesAll();
        $.log('Reloaded Messages.');
    });

    // 随机一份小电影
    $.bot.onText(/^\/video(?:\s*(.*))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const page = match[1] || 0; // 如果没有匹配到内容，默认使用空字符串
        sendBody.sendRandomVideo(chatId, $);
    });

    // 随机一份3级电影
    $.bot.onText(/^\/movie(?:\s*(.*))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const page = match[1] || 0; // 如果没有匹配到内容，默认使用空字符串
        sendBody.sendRandomVideo(chatId, $, '3movie');
    });

    // 查看目前一共有多少视频
    $.bot.onText(/^\/vlist/, async (msg, match) => {
        const count = $.videoMessages.length;
        $.bot.sendMessage(msg.chat.id, `一共${count}个视频。`, $.defTgMsgForm);
    });

    // 加载weimiList
    // let JSONData = [];
    // if (config.sourceData === 'mysql'){
    //     JSONData = await dbm.getWeimiList();
    // } else{
    //     JSONData = $.getFileJSONData(path.join(__dirname, '../../data/weimi/data.json'));
    // }

    // if (JSONData) {
    //     $.weimiMessages = JSONData;
    //     $.log(`微密圈 加载完毕！一共 ${$.weimiMessages.length} 条。`);
    // }

    // 随机一份微密圈
    $.bot.onText(/^\/weimi(?:\s*(.*))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        // sendBody.sendRandomWeimi(chatId, $, config);
        const url = 'https://wemimao1.com/';
        $.bot.sendMessage(chatId, `第三方微密圈 [跳转](${url})`, $.defTgMsgForm);
    });

    $.log("happy模块加载完毕。。。");
}

