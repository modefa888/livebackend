const cheerio = require("cheerio");
const includes = require("../../config/includes");
const cc = require('../../../config');
let config = null;

function setConfig($) {
    config = $;
}

async function sendDetail(chatId, url) {
    try {
        const axios = config.axios;
        // 获取网页内容
        const response = await axios.get('https://njav.tv/zh/' + atob(url));
        const $ = cheerio.load(response.data);
        // 提取视频信息
        const videoInfo = extractVideoInfo($);
        // 获取播放链接
        const playUrl = await fetchPlayUrl(axios, videoInfo.vid);
        // 构建并发送消息
        await sendMessage(chatId, videoInfo, playUrl, atob(url));
    } catch (error) {
        config.log('发送图文消息时出错: ' + error.message, 'error');
    }
}

function extractVideoInfo($) {
    try {
        const vid = $('#page-video').attr('v-scope').split("'")[1];
        const thumb = $('#player').attr('data-poster');
        const title = $('h1').text().trim().replace("~","").replace("～","");
        const description = $('.description p').eq(0).text().trim().replace("~","").replace("～","");
        const detail_items = $('.content .detail-item div');
        let detail = '';
        detail_items.each((index, item) => {
            const spans = $(item).find('span');
            if (spans.length >= 2) { // 确保至少有两个 span 元素
                detail += `${spans.eq(0).text().trim()} *${spans.eq(1).text().replace(/\n\s*/g, ' ').trim()}*\n`;
            }
        });
        return { vid, thumb, title, description, detail };
    } catch (error) {
        config.log('提取视频信息时出错: ' + error.message, 'error');
        return null;
    }
}

async function fetchPlayUrl(axios, vid) {
    try {
        const playUrl = `https://njav.tv/zh/ajax/v/${vid}/videos`;
        const response = await axios.get(playUrl);
        return response.data.data.watch[0].url;
    } catch (error) {
        config.log('获取播放链接时出错: ' + error.message, 'error');
        return null;
    }
}

async function sendMessage(chatId, videoInfo, playUrl, targetUrl) {
    try {
        const keyboard = {
            inline_keyboard: [
                [{ text: '播放', url: playUrl }, { text: '跳转链接', url: 'https://netflav.tv/video?id=' + targetUrl }],
            ]
        };

        await config.bot.sendPhoto(chatId, videoInfo.thumb, {
            caption: `*${videoInfo.title}*\n${videoInfo.description}\n\n${videoInfo.detail}`,
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(keyboard)
        });
    } catch (error) {
        config.log('发送消息时出错: ' + error.message, 'error');
    }
}

async function search(search_word, page_number) {
    let base_url = `https://njav.tv/zh/search?keyword=`;
    let results = [];
    let totalPages = 1;
    try {
        const encodedSearchWord = encodeURIComponent(search_word);
        const url = `${base_url}${encodedSearchWord}&page=${page_number}`;

        const response = await includes.axios.get(url);
        if (response.status !== 200) {
            includes.log(`请求失败，状态码：${response.status}`,'error');
        }
        const $ = cheerio.load(response.data);
        let index = 1;
        const list_rows = $('.box-item');
        list_rows.each(function() {
            const title = config.StringToString($(this).find('.detail a').text());
            const href = 'https://t.me/' + cc[cc.environment].appName + '?start=' + btoa($(this).find('.detail a').attr('href'));
            // const pic = $(this).find('img').attr('data-src');
            const line = `${index}. ${title} - [观看](${href})\n`;
            index += 1;
            results.push(line)
        });

        totalPages = parseInt($('.title .text-muted').text().replace(" 个视频",""));

        return {results, totalPages};
    } catch (error) {
        includes.log(`搜索过程中发生错误：${error}`, 'error');
        return '';
    }
}

module.exports = {
    setConfig,
    sendDetail,
    search
}
