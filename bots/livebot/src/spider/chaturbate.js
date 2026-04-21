const $ = require('../config/includes');

const host = 'https://chaturbate.com';

const getStationStatus = async (mid) => {
    try {
        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb = '';
        let liveUrl = '';
        let roomid = mid;

        const targetUrl = host + '/' + mid + '/';
        await $.axios(targetUrl)
            .then(responseText => {
                const data = responseText.data.match(/window.initialRoomDossier = "(.*?)"/)[1];
                const dataStr = $.unescapeUnicode(data);
                liveUrl = dataStr.match(/"hls_source": "(.*?)"/)[1];
                if (liveUrl) {
                    room_status = 1;
                } else {
                    room_status = 0;
                }
                let desc = $.unescapeUnicode(dataStr.match(/"room_title": "(.*?)"/)[1]);
                avatar_thumb = 'https://thumb.live.mmcdn.com/riw/' + mid + '.jpg'
                title = desc;
                username = mid;
            });

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
        return 'chaturbate.com';
    },
    getMidCount(){
        return 3;
    }
};
