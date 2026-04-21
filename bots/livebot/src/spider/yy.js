const $ = require('../config/includes');

const host = 'https://www.yy.com';
const getStationStatus = async (mid) => {
    try {
        let targetUrl = 'https://www.yy.com/' + mid;
        const resp = await $.axios.get(targetUrl);
        const res = resp.data;
        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb = '';
        let liveUrl = '';
        let roomid = mid;

        roomid = res.match(/uid: "(\d+)",/)[1];

        const resp2 = await $.axios.get(`https://www.yy.com/api/liveInfoDetail/${mid}/${mid}/${roomid}`);
        const resp2Data = resp2.data;
        if (resp2Data.data != '') {
            room_status = 1;
            username = resp2Data.data.name;
            title = resp2Data.data.desc;
            avatar_thumb = resp2Data.data.thumb2;

            const biz = resp2Data.data.biz;
            avatar_thumb = avatar_thumb + "#" + biz;

        } else {
            $.log('yy 无法找到' + mid + '房间信息', 'error');
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
        return 'www.yy.com';
    },
    getMidCount(){
        return 3;
    }
};
