const $ = require('../config/includes');

const host = 'https://pandalive.co.kr';
const getStationStatus = async (mid) => {
    try {
        let targetUrl = 'https://pandalive.co.kr/live/play/' + mid;
        const response = await $.axios.post('https://api.pandalive.co.kr/v1/member/bj?userId=' + mid + '&info=media fanGrade');
        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb = '';
        let liveUrl = '';
        let roomid = mid;
        try {
            const mediaData = response.data['media'];
            // title
            title = mediaData['title'];
            // 用户昵称
            username = mediaData['userNick'];
            // 直播开始时间
            const startTime = mediaData['startTime'];
            // 直播 live & 录像 rec
            const liveType = mediaData['liveType'] == 'live' ? '直播' : '录像';
            // 类型：粉丝房 fan 免费 free
            const type = mediaData['type'] == 'fan' ? '粉丝房' : '免费房';
            // 主播头像
            avatar_thumb = mediaData['userImg'] + '#' + startTime + '#' + liveType + '#' + type;
            room_status = 1;
        } catch (e) {
            username = response.data['bjInfo']['nick'];
            room_status = 0;
        }

        //获取真实播放地址
        const liveData = await $.axios(`https://5721004.xyz/player/api.php?id=${mid}&t=20240101`);
        if (liveData.data.code == 200){
            liveUrl = liveData.data.url;
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
        return 'www.pandalive.co.kr';
    },
    getMidCount(){
        return 5;
    }
};
