const includes = require('../config/includes');
const cheerio = require('cheerio');
const https = require('https'); // ⬅️ 新增：引入 https 模块

const host = 'https://1tnb8s.huanqiu37.cc';

// 创建忽略证书验证的 https agent
const httpsAgent = new https.Agent({
    rejectUnauthorized: false, // ⬅️ 关键：忽略 SSL 证书错误
});

// 通用 headers（模拟浏览器）
const defaultHeaders = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': 'zh-CN,zh;q=0.9',
    'priority': 'u=0, i',
    'referer': `${host}/video`,
    'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
};

const getStationStatus = async (mid = 'latest') => {
    try {
        let targetUrl = `${host}/video/category/${mid}`;

        // 第一次请求：获取视频列表
        const response = await includes.axios.get(targetUrl, {
            headers: defaultHeaders,
            httpsAgent: httpsAgent, // ⬅️ 加入 Agent
        });

        const $ = cheerio.load(response.data);

        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb;
        let liveUrl = '';
        let roomid = mid;

        const articleList = $('article');

        if (articleList.length === 0) {
            throw new Error('页面结构可能变化，未找到视频元素');
        }

        const article = articleList[5]; // 获取第6个视频
        const href = host + $(article).find("a").attr('href');
        title = $(article).find("h4").text().trim();
        username = '91porny';
        targetUrl = href;
        room_status = href;

        // 第二次请求：获取视频详情页
        const sourceHtml = await includes.axios.get(targetUrl, {
            headers: defaultHeaders,
            httpsAgent: httpsAgent, // ⬅️ 加入 Agent
        });

        const source = cheerio.load(sourceHtml.data);

        avatar_thumb = source("#video-play").attr("poster");

        const html = sourceHtml.data;

        const avdtMatch = html.match(/window\.\$avdt\s*=\s*({.*?})\s*<\/script>/s);

        if (!avdtMatch || !avdtMatch[1]) {
            throw new Error('未找到播放地址数据（window.$avdt）');
        }

        let avdt;
        try {
            avdt = JSON.parse(avdtMatch[1].replace(/\\\//g, '/')); // 解码斜杠 \/ -> /
        } catch (e) {
            throw new Error('解析 window.$avdt JSON 失败');
        }

        // 构造播放地址
        const hlsPath = avdt.hls;
        const cdns = avdt.cdns;

        if (!hlsPath || !cdns || !cdns.length) {
            throw new Error('播放地址数据不完整');
        }

        // 使用第一个 CDN 构造最终播放地址
        liveUrl = `https://${cdns[0]}${hlsPath}`;

        const code = 1;
        return { code, title, username, roomid, avatar_thumb, room_status, liveUrl, targetUrl };

    } catch (error) {
        const msg = `请求失败: ${error.message}`;
        const code = 0;
        return { msg, code, room_status: 0 };
    }
};

module.exports = {
    getHost() {
        return host;
    },
    getStationStatus,
    getModuleName() {
        return host.split('/')[2];
    },
    getMidCount() {
        return 3;
    }
};
