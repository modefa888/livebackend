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

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer': 'https://jable.tv',  // 根据实际情况调整 Referer
    'Accept-Language': 'en-US,en;q=0.9',
    // 可能还需要设置其他请求头，具体依赖于目标网站的反爬策略
};

async function search(search_word, page_number) {
    const encodedSearchWord = encodeURIComponent(search_word);
    const baseUrl = `https://jable.tv/search/${encodedSearchWord}/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${encodedSearchWord}&sort_by=&from=${page_number}`;
    console.log(baseUrl)
    let results = [];
    let totalPages = 1;

    try {
        const url = baseUrl;

        // 在请求中添加 headers
        const response = await config.axios.get(url, { headers });

        if (response.status !== 200) {
            includes.log(`请求失败，状态码：${response.status}`, 'error');
            return { results, totalPages };
        }

        const $ = cheerio.load(response.data);
        let index = 1;

        const listRows = $('.video-img-box');
        listRows.each(function() {
            const title = config.StringToString($(this).find('.detail a').text()).trim();
            const href = 'https://t.me/' + cc[cc.environment].appName + '?start=' + btoa($(this).find('.detail a').attr('href'));
            // const pic = $(this).find('img').attr('data-src');

            if (title && href) {
                const line = `${index}. ${title} - [观看](${href})\n`;
                results.push(line);
                index++;
            }
        });

        const totalText = $('.title-box span').text().replace(" 部影片", "");
        totalPages = parseInt(totalText, 10) || 1;

    } catch (error) {
        includes.log(`Jable 搜索时发生错误：${error.message}`, 'error');
    }

    return { results, totalPages };
}


module.exports = {
    setConfig,
    sendDetail,
    search
}
