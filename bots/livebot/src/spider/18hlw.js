const includes = require('../config/includes');
const cheerio = require('cheerio');

const host = 'https://18hlw.com';

const getStationStatus = async (mid) => {
    try {
        let targetUrl = `${host}/category/${mid}`;
        const response = await includes.axios.get(targetUrl);
        const $ = cheerio.load(response.data);

        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb;
        let liveUrl = '';
        let roomid = mid;

        const articleList = $('.video-item');
        const article = articleList[6];

        
        const href = $(article).find('.cursor-pointer').attr('href');
        title = $(article).find('.title').text().replaceAll('\n', '').replaceAll(' ', '');
        // username = $(article).find('img').attr('alt');
        username = '黑料网';
        const image = $(article).find('img').attr('onload').replace("loadImg(this,'", "").replace("')", "");
        avatar_thumb = 'https://daily-api-amber.vercel.app/51cg/img?url=' + image;
        targetUrl = host + href;
        room_status = href;

        // 获取真实播放源
        const sourceHtml = await includes.axios.get(targetUrl);
        const source = cheerio.load(sourceHtml.data);
        const htmlContent = source.html().replace(/&amp;/g,"&").replace(/&quot;/g,'"');
        const regex2 = /"video":{"url":"(.*?)"/g;

        let urlStr = '';
        let match;
        while ((match = regex2.exec(htmlContent)) !== null) {
            const url = match[1].replace(/\\\//g, '/');
            urlStr += url.split("?")[0] + "#";
        }
        // 去除末尾的'#'
        liveUrl = urlStr.slice(0, -1);

        const code = 1;
        return { code, title, username, roomid, avatar_thumb, room_status, liveUrl, targetUrl };
    } catch (error) {
        const msg = `请求失败: ${error.message}`;
        const code = 0;
        return { msg, code, room_status: 0 };
    }
};

module.exports = {
    getHost(){
        return host;
    },
    getStationStatus,
    getModuleName() {
        return host.split('/')[2];
    },
    getMidCount() {
        return 4;
    }
};
