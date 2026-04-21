const $ = require('../config/includes');

const host = 'https://www.huajiao.com';
const getStationStatus = async (mid) => {
    try {
        let targetUrl = host + '/l/' + mid;
        const resp = await $.axios.get(targetUrl);
        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb = '';
        let liveUrl = '';
        let roomid = mid;

        const regex2 = /var feed = (.*?)};/;
        let feed_info = resp.data.match(regex2);
        feed_info = feed_info[1] + "}";

        if (feed_info) {
            const feedData = JSON.parse(feed_info);
            room_status = 1;
            username = feedData.author.nickname;
            title = feedData.feed.title;
            avatar_thumb = feedData.feed.image + '.png';

            const live_cate = feedData.feed.live_cate;
            const publishtime = feedData.feed.publishtime;
            avatar_thumb = avatar_thumb + "#" + publishtime + "#" + live_cate;

            const sn = feedData.feed.sn;
            const channel = feedData.relay.channel;
            liveUrl = 'https://al2-flv.live.huajiao.com/' + channel + '/' + sn + '.flv';
        } else {
            $.log('花椒 无法找到' + mid + '房间信息', 'error');
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
        return 'www.huajiao.com';
    },
    getMidCount(){
        return 4;
    }
};
