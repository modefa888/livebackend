const $ = require('../config/includes');

const host = 'https://live.kuaishou.com';
const getStationStatus = async (mid) => {
    try {
        let targetUrl = host +'/u/' + mid;
        const resp = await $.axios.get(targetUrl);
        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb = '';
        let liveUrl = '';
        let roomid = mid;

        const regex = /"liveroom":(.*?),"emoji"/;
        let room_info = resp.data.match(regex);
        room_info = room_info[1].replace(/\\u002F/g, '/');
        username = room_info.match(/"author":{"id":"(.*?)","name":"(.*?)"/)[2];
        avatar_thumb = room_info.match(/"poster":"(.*?)"/);
        if (avatar_thumb) {
            room_status = 1;
            avatar_thumb = avatar_thumb[1];

            const categoryName = room_info.match(/"categoryName":"(.*?)"/)[1];
            const categoryName1 = room_info.match(/"gameInfo":{"id":"(.*?)","name":"(.*?)"/)[2];
            avatar_thumb = avatar_thumb + "#" + categoryName + " " + categoryName1;

            const liveUrlList = JSON.parse(room_info.match(/"representation":(.*?)}}/)[1]);
            liveUrlList.forEach(stream => {
                liveUrl = stream.url;
            });
        } else {
            avatar_thumb = '';
            $.log('快手 无法找到' + mid + '房间信息', 'error');
        }

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
        return 'live.kuaishou.com';
    },
    getMidCount(){
        return 4;
    }
};
