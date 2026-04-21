const includes = require('../config/includes');
const cheerio = require('cheerio');

const host = 'https://y61seu.17shipin.vip';

const getStationStatus = async (mid) => {
    try {
        let targetUrl = `${host}/category/%E4%BB%8A%E6%97%A5%E5%A4%A7%E7%93%9C/`;
        const response = await includes.axios.get(targetUrl);
        const $ = cheerio.load(response.data);

        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb;
        let liveUrl = '';
        let roomid = '17cg';

        const articleList = $('article');
        const article = articleList[1];
        const href = $(article).find('a').attr('href');
        title = $(article).find('h2').text();
        // username =  $(article).find('.post-card-info div').text();
        username =  '17cg';
        const script = $(article).find('script').text().replace('\n', '').replace('  ', '');
        const regex = /loadBannerDirect\('(.*?)'\)/;
        const image = script.match(regex)[1].split("',")[0];
        avatar_thumb = host + image;
        targetUrl = href;
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
