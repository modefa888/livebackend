const $ = require('../config/includes');

const host = 'https://www.douyu.com';
const getStationStatus = async (mid) => {
    try {
        let targetUrl = 'https://www.douyu.com/' + mid;
        const resp = await $.axios.get('https://www.douyu.com/betard/' + mid);
        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb = '';
        let liveUrl = '';
        let roomid = mid;

        const data = resp.data['room'];
        title = data['room_name'];
        avatar_thumb = data['room_pic'];
        username = data['owner_name'];
        liveUrl = data['room_url'];
        room_status = data['show_status'] == 1 ? 1 : 0;

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
        return 'www.douyu.com';
    },
    getMidCount(){
        return 3;
    }
};

