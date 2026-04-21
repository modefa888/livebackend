const $ = require('../config/includes');

const host = 'https://www.huya.com';
const getStationStatus = async (mid) => {
    try {
        let targetUrl = host + '/' + mid;
        const resp = await $.axios.get(targetUrl);
        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb = '';
        let liveUrl = '';
        let roomid = mid;

        var html = resp.data.replace(/\s+/g, '');
        // 使用正则表达式匹配 stream 对象
        const match = html.match(/stream:(.*?)};/);
        const stream = match[1];
        const data = JSON.parse(stream)['data'][0];
        const gameLiveInfo = data['gameLiveInfo'];
        const gameStreamInfoList = data['gameStreamInfoList'];
        // $.log(data)
        title = gameLiveInfo['introduction'];
        username = gameLiveInfo['nick'];
        startTime = gameLiveInfo['startTime'];
        gameFullName = gameLiveInfo['gameFullName'];
        avatar_thumb = gameLiveInfo['screenshot'] + '#' + startTime + '#' + gameFullName;
        if (gameStreamInfoList.length <= 0) {
            // $.log("未开播")
            room_status = 0;
            avatar_thumb = '';
        } else {
            // $.log("开播")
            room_status = 1;
        }
        liveUrl = 'https://www.huya.com/' + mid;
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
        return 'www.huya.com';
    },
    getMidCount(){
        return 3;
    }
};
