const includes = require('../config/includes');
const cheerio = require('cheerio');

const host = 'https://www.dycg66.com';

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

        const articleList = $('.Xc_home_article-si');
        const article = articleList[0];
        const href = $(article).find('.information a').attr('href');
        title = $(article).find('.information a').attr('title');

        username = $(article).find('.last').text().trim().replace(/\s/g, '').replace(/\n/g, '');;

        const image = $(article).find('img').attr('data-src');
        avatar_thumb = 'https://daily-api-amber.vercel.app/51cg/img?url=' + 'https://pic.shyyikj.cn' + image;
        targetUrl = host + href;
        room_status = href;
        let code = 1;
        if (image.includes('.gif')){
            code = 0;
        }

        // 获取真实播放源
        const sourceHtml = await includes.axios.get(targetUrl);
        const source = cheerio.load(sourceHtml.data);
        const htmlContent = source.html().replace(/&amp;/g,"&").replace(/&quot;/g,'"');
        const regex2 = /"video":{"url":"(.*?)"/g;

        let urlStr = '';
        let match;
        while ((match = regex2.exec(htmlContent)) !== null) {
            const url = match[1].replace(/\\\//g, '/');
            urlStr += url + "#";
        }
        // 去除末尾的'#'
        liveUrl = urlStr.slice(0, -1);

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
    getMidCount(){
        return 4;
    }
};
