const includes = require('../config/includes');
const cheerio = require('cheerio');

const host = 'https://rou.video';

const getStationStatus = async (mid) => {
    try {
        let targetUrl = `${host}/${mid}`;
        const response = await includes.axios.get(targetUrl);
        const $ = cheerio.load(response.data);

        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb;
        let liveUrl = '';
        let roomid = mid;

        const articleList = $('div.relative');
        const article = articleList[0];
        const href = $(article).find('a').attr('href');
        title = $(article).find('div.hidden').text();
        // username =  $(article).find('.absolute').text();
        username =  '肉视频';
        const image = $(article).find('img').attr('src');
        avatar_thumb = image;
        targetUrl = host + href;
        const data = await includes.axios.get(host + '/api' + href);
        liveUrl = data.data.video.videoUrl.split("?")[0];
        room_status = href;

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
    getMidCount(){
        return 3;
    }
};
