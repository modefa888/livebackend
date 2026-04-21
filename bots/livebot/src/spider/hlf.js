const includes = require('../config/includes');
const cheerio = require('cheerio');

const host = 'https://911blw.com';

const getStationStatus = async (mid = 'jrgb') => {
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

        const articleList = $('article');
        const article = articleList[5];
        const href = $(article).find('a').attr('href');
        title = $(article).find('h2').text();
        const spanList = $(article).find('.post-card-info').find('span');
        // username = spanList.eq(0).text() + spanList.eq(1).text() + spanList.eq(2).text();
        username = '911爆料网';
        const script = $(article).find('script').text().replace('\n', '').replace('  ', '');
        const regex = /loadBannerDirect\('(.*?)'\)/;
        const image = script.match(regex)[1].split("',")[0];
        avatar_thumb = 'https://daily-api-amber.vercel.app/51cg/img?url=' + image;
        liveUrl = host + href;
        room_status = href;
        targetUrl = liveUrl;
        let code = 1;
        if (image.includes('.gif')){
            code = 0;
        }

        // 获取真实播放源
        const sourceHtml = await includes.axios.get(liveUrl);
        const source = cheerio.load(sourceHtml.data);
        const htmlContent = source.html().replace(/&amp;/g,"&").replace(/&quot;/g,'"');
        const regex2 = /"url":"(.*?)"/g;

        let urlStr = '';
        let match;
        while ((match = regex2.exec(htmlContent)) !== null) {
            const url = match[1].replace(/\\\//g, '/');
            urlStr += url.split("?")[0] + "#";
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
