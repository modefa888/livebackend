const includes = require('../config/includes');
const cheerio = require('cheerio');

const host = 'https://51xsj.cc';


const getStationStatus = async (mid) => {
    try {
        let targetUrl = `${host}`;
        const response = await includes.axios.get(targetUrl);
        const $ = cheerio.load(response.data);

        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb;
        let liveUrl = '';
        let roomid = mid;

        const articleList = $('.item-link');
        const article = articleList[6];
        const href = $(article).attr('href');
        title = $(article).attr('title');
        // username = title;
        username = '天天影视';
        const image = $(article).find('img').attr('src');
        avatar_thumb = image;
        targetUrl = host + href;

        room_status = href;
        let code = 1;
        if (image.includes('.gif')){
            code = 0;
        }

        // 获取真实播放源
        const sourceHtml = await includes.axios.get(targetUrl);
        const source = sourceHtml.data;

        liveUrl = source.match('"url":"(.*?)","url_next"')[1].replace(/\\\//g, '/');

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
        return 3;
    }
};
