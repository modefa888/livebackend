const $ = require("../config/includes");
const axios = $.axios;


async function sendDetail(chatId, url) {
    var data = JSON.stringify({
        "url": url
    });

    var config = {
        method: 'post',
        url: 'https://tubedown.cn/api/youtube',
        headers: {
            'Content-Type': 'application/json'
        },
        data: data
    };

    axios(config)
        .then(function (response) {
            const data = response.data.data;

            const id = data.id;
            const title = data.title;
            const thumbnail = data.thumbnail;
            const description = data.description;
            const webpage_url = data.webpage_url;
            const view_count = data.view_count;
            const categories = data.categories;
            const tags = data.tags;
            const live_status = data.live_status;
            const channel = data.channel;
            const uploader_url = data.uploader_url;
            const fulltitle = data.fulltitle;
            // 时长
            const duration_string = data.duration_string;
            const upload_date = data.upload_date;
            const is_live = data.is_live;
            // 播放地址
            const url = data.url.replace(/&/g, "&amp;");
            const resolution = data.resolution;

            // 构建消息文本
            let messageCaption = `
*Title*: ${title}
*View Count*: ${view_count}
*Categories*: ${categories.join(', ')}
*Live Status*: ${live_status}
*Channel*: ${channel} [Channel](${uploader_url})
*Duration*: ${duration_string}
*Release Date*: ${upload_date}
*Requested Formats*: [${resolution}](${url})
`;
            console.log(messageCaption);
            // 发送图片消息
            // $.bot.sendPhoto(chatId, thumbnail, {caption: messageCaption, parse_mode: 'Markdown'});
            $.bot.sendMessage(chatId, messageCaption, $.defTgMsgForm);
        })
        .catch(function (error) {
            $.log(error.message, 'error');
            $.bot.sendMessage(chatId, '请求*' + url + '*出错，请重试', $.defTgMsgForm);
        });
}

module.exports = {
    sendDetail
}


