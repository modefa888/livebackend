const includes = require('../config/includes');

const host = 'https://www.youtube.com/';

const getStationStatus = async (mid) => {
    try {
        let targetUrl = `${host}/${mid}/videos`;
        const response = await includes.axios.get(targetUrl);

        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb;
        let liveUrl = '';
        let roomid = mid;

        const data = response.data.match(/"richItemRenderer":{(.*?)}},{"richItemRenderer":{"conte/)[1];
        const endData = '{' + data + '}'
        const contentData = JSON.parse(endData);

        liveUrl = host + '/watch?v=' + contentData.content.videoRenderer.videoId;
        title = contentData.content.videoRenderer.title.runs[0].text;
        avatar_thumb = contentData.content.videoRenderer.thumbnail.thumbnails[3].url;
        room_status = liveUrl;

        const regex1 = /<title>(.*?)<\/title>/;
        username = response.data.match(regex1)[1];
        let code = 1;
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
