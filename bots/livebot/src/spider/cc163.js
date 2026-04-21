const $ = require('../config/includes');

const host = 'https://cc.163.com';

const getStationStatus = async (mid) => {
    try {
        let targetUrl = `${host}/${mid}`;
        const response = await $.axios.get(targetUrl);
        const res = response.data;
        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb = '';
        let liveUrl = '';
        let roomid = mid;

        const regex = /"roomInfoInitData":({.*?}),"__N_SSP"/s;
        const match = res.match(regex);
        if (match) {
            const room_info = JSON.parse(match[1].replace('}}}','}}'));
            title = room_info.live.title;
            if (room_info.live.swf) {
                username = room_info.live.micfirst.nickname;
                room_status = 1;
                avatar_thumb = room_info.live.quickplay.cover2;
                liveUrl = room_info.live.quickplay.sharefile;
            } else {
                username = room_info.micfirst.nickname;
                avatar_thumb = room_info.micfirst.purl;
            }
        } else {
            $.log('无法找到' + mid + '房间信息','error');
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
        return 'cc.163.com';
    },
    getMidCount(){
        return 3;
    }
};
