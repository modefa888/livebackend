const $ = require('../config/includes');
var request = require('request');

const host = 'https://live.douyin.com';

const headers = {
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="127", "Not)A;Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    // 'Cookie': 'ttwid=1%7CdW9fgRP2_tnH8xIMeqrT1UYXXw6sT7zgA2CPgF1VHM4%7C1751471111%7C1f7d4c19282e7cf75034198b6dc4314aeb1d6b789ca8280d2e03dfcbffca4649; __ac_nonce=068654ebc00698332a859'
};


// 1. 封装 request 为 Promise
const requestPromise = (options) => {
    return new Promise((resolve, reject) => {
        request(options, (error, response, body) => {
            if (error) reject(error);
            else resolve({ response, body });
        });
    });
};

// 2. 重构 getStationStatus 为 async 函数
const getStationStatus = async (mid) => {
    try {

        const options = {
            url: `https://live.douyin.com/${mid}`,
            headers: headers
        };
        const { response, body } = await requestPromise(options);
        const result = processResponse(body, mid); // 将原有callback逻辑提取为函数
        return result;
    } catch (error) {
        const msg = `请求失败: ${error}`;
        const code = 0;
        room_status = 0;
        return { msg, code, room_status };
    }
};

// 3. 提取回调逻辑到独立函数
function processResponse(body, mid) {
    // 这里放入你原来的 callback 函数内部处理逻辑

    let res = body.replace(/\\\"/g, '"');

    let room_status = 0;
    let title = '';
    let username = '';
    let avatar_thumb = '';
    let liveUrl = '';
    let roomid = mid;

    // 获取主播直播状态
    const regex = /"roomInfo":{"room":{"id_str":"\d+","status":(\d+),"status_str":"\d+","title":"([^"]+)"/;
    const res_room_info = res.match(regex);
    if (res_room_info) {
        room_status = res_room_info[1];
        title = res_room_info[2];
        room_status = room_status === '4' ? 0 : 1; // 主播不在线或在线
    }

    // 获取主播基本信息
    const regex2 = /"anchor":({.*?}})/;
    const res_anchor_info = res.match(regex2);
    if (res_anchor_info) {
        const anchor_json = res_anchor_info[1];
        username = anchor_json.match(/"nickname":"([^"]+)"/)[1];
        if (room_status === 1) {
            avatar_thumb = anchor_json.match(/"url_list":\["([^"]+)"/)[1].replace('100x100', '200x200');
            // 获取直播源
            const regex3 = /"hls_pull_url_map":({.*?})/;
            const res_hls_info = res.match(regex3);
            if (res_hls_info) {
                const res_stream_m3u8s = JSON.parse(res_hls_info[1]);
                liveUrl = res_stream_m3u8s.FULL_HD1 || '';
            } else {
                liveUrl = '';
                $.log('无法找到' + mid + '直播源', 'error');
            }
        }
    }

    const code = 1;
    let targetUrl = 'https://live.douyin.com/' + mid;
    const result = { code, title, username, roomid, avatar_thumb, room_status, liveUrl, targetUrl };
    return result; //返回最终数据
}


module.exports = {
    getHost() {
        return host;
    },
    getStationStatus,
    getModuleName() {
        return 'live.douyin.com';
    },
    getMidCount() {
        return 3;
    }
};
