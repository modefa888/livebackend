const $ = require('../config/includes');

const host = 'https://live.bilibili.com';

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

        const regex = /window.__NEPTUNE_IS_MY_WAIFU__={(.*?)<\/script>/;
        let room_info = resp.data.match(regex);
        if (room_info) {
            room_info =  JSON.parse('{' + room_info[1]);
            title = room_info.roomInfoRes.data.room_info.title;
            username = room_info.roomInfoRes.data.anchor_info.base_info.uname;

            const parent_area_name = room_info.roomInfoRes.data.room_info.parent_area_name;
            const area_name = room_info.roomInfoRes.data.room_info.area_name;

            room_status = room_info.roomInitRes.data.live_status;
            //判断是否在直播
            if (room_status) {
                avatar_thumb = room_info.roomInfoRes.data.room_info.keyframe + "#" + parent_area_name + " " + area_name;
                const streamList = room_info.roomInitRes.data.playurl_info.playurl.stream;
                const liveUrlList = [];
                streamList.forEach(stream => {
                    let base_url = stream.format[0].codec[0].base_url;
                    let host = stream.format[0].codec[0].url_info[0].host;
                    let extra = stream.format[0].codec[0].url_info[0].extra;
                    liveUrlList.push(host + base_url + extra);
                });
                liveUrl = liveUrlList.filter(url => url.includes('m3u8'))[0];
            }
        } else {
            $.log('B站 无法找到' + mid + '房间信息', 'error');
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
        return 'live.bilibili.com';
    },
    getMidCount(){
        return 3;
    }
};
