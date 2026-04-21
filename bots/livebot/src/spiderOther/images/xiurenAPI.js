const cheerio = require("cheerio");
let config = null;

let countNum = 20;
let pageNum = 15;

function setConfig($) {
    config = $;
}

// 生成一个 1 到 num 之间的随机数
function getRandomNumber(num) {
    return Math.floor(Math.random() * num) + 1;
}

async function sendDetail(chatId, url) {
    try {
        const axios = config.axios;
        // 获取网页内容
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // 提取网页标题
        const title = $('title').text();
        const tags = $('meta').eq(3).attr('content');

        // 提取图片 URL
        let photoUrls = [];
        $('.photoThum img').each(function () {
            let photoUrl = $(this).attr('src').replace("Thum/Thum-", "");
            photoUrls.push(photoUrl);
        });

        const resultCount = photoUrls.length;
        // 将图片分批发送，每批不超过 10 张
        while (photoUrls.length) {
            const batch = photoUrls.splice(0, 10);
            const mediaGroup = batch.map((photoUrl) => ({
                type: 'photo',
                media: photoUrl,
                caption: title
            }));
            await config.bot.sendMediaGroup(chatId, mediaGroup);
            config.log('图文消息发送' + batch.length + '成功, 剩余' + photoUrls.length + '张');
        }
        await config.bot.sendMessage(chatId, `一共 ${resultCount} 张。`);
    } catch (error) {
        config.log('发送图文消息时出错:' + error.message, 'error');
        // 👇 出错时给出提示 + 再试一次按钮
        const retryKeyboard = {
            inline_keyboard: [
                [{ text: '🔁 再试一次', callback_data: 'xiurenRetryDetail_' + url }]
            ]
        };
        await config.bot.sendMessage(chatId, '😢 运气跑掉了，你可以再试试呢～', {
            reply_markup: JSON.stringify(retryKeyboard)
        });
    }
}

async function sendRandom(chatId, page = 0) {
    try {
        let url = `http://www.xiuren.org/page-${page}.html`;
        let newPage = page;
        if (page === 0) {
            newPage = getRandomNumber(countNum);
            url = `http://www.xiuren.org/page-${newPage}.html`;
        }
        console.log(url)

        const axios = config.axios;
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        let photos = [];

        $('.content a').each(function () {
            const title = $(this).attr('title');
            const href = $(this).attr('href');
            const pic = $(this).find('img').attr('src').split("src=")[1];
            photos.push({ title, pic, href });
        });

        const currentBody = photos[getRandomNumber(pageNum)];
        let targetUrl = currentBody.href;
        let keyboard = {
            inline_keyboard: [
                [
                    { text: '查看', callback_data: 'xiurenShow_' + targetUrl },
                    { text: '删除消息', callback_data: 'delete_message' },
                    { text: '跳转链接', url: targetUrl }
                ],
                [
                    { text: '本页随机', callback_data: 'xiurenRandom_' + newPage },
                    { text: '全站随机', callback_data: 'xiurenRandom_0' }
                ]
            ]
        };
        await config.bot.sendPhoto(chatId, currentBody.pic, {
            caption: currentBody.title,
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(keyboard)
        });
    } catch (error) {
        config.log('发送图文消息时出错:' + error.message, 'error');
        // 👇 出错时提示 + “再试一次”按钮
        const retryKeyboard = {
            inline_keyboard: [
                [{ text: '🔁 再试一次', callback_data: 'xiurenRandom_0' }]
            ]
        };
        await config.bot.sendMessage(chatId, '😢 运气跑掉了，你可以再试试呢～', {
            reply_markup: JSON.stringify(retryKeyboard)
        });
    }
}

module.exports = {
    setConfig,
    sendDetail,
    sendRandom
};
