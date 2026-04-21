const includes = require('../config/includes');
const cheerio = require('cheerio');

const host = 'https://hsck1.25img.com';


const getStationStatus = async (mid) => {
    try {
        let targetUrl = `${host}/?type=ycgc&p=1`;
        const response = await includes.axios.get(targetUrl);
        const $ = cheerio.load(response.data);

        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb;
        let liveUrl = '';
        let roomid = mid;

        const articleList = $('.stui-vodlist__box');
        const article = articleList[1];
        const href = $(article).find('.stui-vodlist__thumb').attr('href');
        title = $(article).find('.stui-vodlist__thumb').attr('title');
        const spanList = $(article).find('.post-card-info').find('span');
        // username = title;
        username = 'hs仓库';
        const script = $(article).find('.stui-vodlist__thumb').attr('style');
        const image = "https" + script.split("https")[1].split(".jpg")[0] + ".jpg";
        avatar_thumb = image;
        targetUrl = host + href;

        room_status = href;
        let code = 1;
        if (image.includes('.gif')){
            code = 0;
        }

        // 获取真实播放源
        const sourceHtml = await includes.axios.get(targetUrl);
        const source = cheerio.load(sourceHtml.data);

        liveUrl = source("#mp4m3u8").attr('src');

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
