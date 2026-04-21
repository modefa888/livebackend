const $ = require('../config/includes');

const host = 'https://live.douyin.com';
const getStationStatus = async (mid) => {
    try {
        const headers = {
            'authority': 'live.douyin.com',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
            'cache-control': 'max-age=0',
            'cookie': 'xgplayer_user_id=999163975797; home_can_add_dy_2_desktop=%220%22; my_rd=2; bd_ticket_guard_client_web_domain=2; passport_csrf_token=bce64ea6fd4797bcdffe39c280f1d4ff; passport_csrf_token_default=bce64ea6fd4797bcdffe39c280f1d4ff; odin_tt=d57889cf3104e53281a7873a45519902a1105f328fb17e12d6ff41a6f196bd78d1ff1558c780fc9bb031e863df72c3a3d26e1c8b28086f83697ce310bd0075776309a22fdcc6e5fedaddaf0781450aae; live_use_vvc=%22false%22; SEARCH_RESULT_LIST_TYPE=%22single%22; bd_ticket_guard_client_data=eyJiZC10aWNrZXQtZ3VhcmQtdmVyc2lvbiI6MiwiYmQtdGlja2V0LWd1YXJkLWl0ZXJhdGlvbi12ZXJzaW9uIjoxLCJiZC10aWNrZXQtZ3VhcmQtcmVlLXB1YmxpYy1rZXkiOiJCREpzV3JwbkZJSnEyKzgzZHVWL2NSZ0NyOG15cDBWeFNsSUhvZlFkeWhZRUFLdVFVYXZCRVhMbllsN2Z0YTZkYXlMdGpYSS9PYWtYTjhmTHBRR0xCUE09IiwiYmQtdGlja2V0LWd1YXJkLXdlYi12ZXJzaW9uIjoxfQ%3D%3D; FORCE_LOGIN=%7B%22videoConsumedRemainSeconds%22%3A180%7D; UIFID_TEMP=3c3e9d4a635845249e00419877a3730e2149197a63ddb1d8525033ea2b3354c2390dff2d91bbff3df0b3e1c7d7aaa00d9aac1ec7b368bbdf9e0d888f49f2f06e23ee20519b9f8a73b5f2c685b38a9522; volume_info=%7B%22isUserMute%22%3Afalse%2C%22isMute%22%3Atrue%2C%22volume%22%3A0.445%7D; stream_player_status_params=%22%7B%5C%22is_auto_play%5C%22%3A0%2C%5C%22is_full_screen%5C%22%3A0%2C%5C%22is_full_webscreen%5C%22%3A0%2C%5C%22is_mute%5C%22%3A1%2C%5C%22is_speed%5C%22%3A1%2C%5C%22is_visible%5C%22%3A0%7D%22; __live_version__=%221.1.2.1123%22; fpk1=U2FsdGVkX18sv+WrnVPhvn7B4XdDJYmLrF4FOR+vf1deWhV1dVo/EVJeiVbSN8POwe4Be7Y57P9Qi6qBvHFTJQ==; fpk2=f1f6b29a6cc1f79a0fea05b885aa33d0; UIFID=3c3e9d4a635845249e00419877a3730e2149197a63ddb1d8525033ea2b3354c2390dff2d91bbff3df0b3e1c7d7aaa00d54d50573f99fb25652262d6835fa134478ff7e7d58f1e014fb42cd3b16b6b492f2bf58ea7737e63407163baecb7dd19603fe2c1771e34df977b649a481315fcc95cd4c896c61b0889456fbe724f13dbb809c36398ba5a98c6d72d4f04c6ae27520a6373051731725139b2f594dc90996; stream_recommend_feed_params=%22%7B%5C%22cookie_enabled%5C%22%3Atrue%2C%5C%22screen_width%5C%22%3A1536%2C%5C%22screen_height%5C%22%3A864%2C%5C%22browser_online%5C%22%3Atrue%2C%5C%22cpu_core_num%5C%22%3A12%2C%5C%22device_memory%5C%22%3A8%2C%5C%22downlink%5C%22%3A10%2C%5C%22effective_type%5C%22%3A%5C%224g%5C%22%2C%5C%22round_trip_time%5C%22%3A50%7D%22; strategyABtestKey=%221718765271.735%22; ttwid=1%7CUxdKWM5UI62ZVyfJgGoSJnRXtty1NRf28Uxh-FaujiU%7C1718784108%7C84621fde0129c0908a680d33f6149329480c742655cb8c9a4f057192ba57ab2e; __ac_nonce=0667591e600227d042754; __ac_signature=_02B4Z6wo00f01S7TAYgAAIDAAFTMoZWPjoku8wUAAC3Em2duV3EAArT3LB3ByJvU7GsawMs1ivUto6bw5PUF0wzaHMOHHx-5Uyts7x6d.sDsNJTEwJVD96SngEUxFRJIv-ywArtmn97DZp2Ccb; has_avx2=null; device_web_cpu_core=12; device_web_memory_size=8; csrf_session_id=5ecea5b74c70f7f02c39ed848ec294f0; webcast_leading_last_show_time=1718981113661; webcast_leading_total_show_times=1; xg_device_score=7.802204888412783; live_can_add_dy_2_desktop=%221%22; msToken=rXmc2u5qVbiXRJ9w3eYDW12unhLATJX2YE6WIyfNMo6lkjF7jZx8mUyRz5WVAIRiNAmjqFoZAf3XXwx7YD5mNbBxc6bWEnxwatq5xXEnZI3W2kOv40e-ebA=; IsDouyinActive=false',
            'referer': 'https://live.douyin.com/721566130345?cover_type=&enter_from_merge=web_live&enter_method=web_card&game_name=&is_recommend=&live_type=game&more_detail=&room_id=7317569386624125734&stream_type=vertical&title_type=&web_live_tab=all',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
        }
        let targetUrl = 'https://live.douyin.com/' + mid.replace('fudai_', '')
        const response = await $.axios.get(targetUrl, {headers});

        let res = response.data.replace(/\\\"/g, '"');

        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb = '';
        let liveUrl = '';
        let roomid = mid;
        let room_id = '';
        // 单独json对象
        let douyinJson = {};
        // 获取主播直播状态
        const regex = /"roomInfo":{"room":{"id_str":"(\d+)","status":(\d+),"status_str":"\d+","title":"([^"]+)"/;
        const res_room_info = res.match(regex);
        if (res_room_info) {
            room_id = res_room_info[0].split('"')[7];
            title = res_room_info[1];
            room_status = 1;
            room_status = room_status === '4' ? 0 : 1; // 主播不在线或在线
        }
        // 获取主播基本信息
        const regex2 = /"anchor":({.*?}})/;
        const res_anchor_info = res.match(regex2);
        if (res_anchor_info) {
            const anchor_json = res_anchor_info[1];
            username = anchor_json.match(/"nickname":"([^"]+)"/)[1];
            if (room_status === 1) avatar_thumb = anchor_json.match(/"url_list":\["([^"]+)"/)[1].replace('100x100', '200x200');
        }

        let pic = '';
        let desc = '';
        let lucky_count = '';
        let candidate_num = '';
        let lucky = '';
        let start_time = '';
        let draw_time = '';
        let time = '';
        let conditionStr = '';

        if (room_status === 1) {
            // 获取直播源
            const regex3 = /"hls_pull_url_map":({.*?})/;
            const res_hls_info = res.match(regex3);
            if (res_hls_info) {
                const res_stream_m3u8s = JSON.parse(res_hls_info[1]);
                liveUrl = res_stream_m3u8s.FULL_HD1 || '';
            } else {
                liveUrl = '';
                // $.log('无法找到' + mid + '直播源','error');
            }

            let config = {
                method: 'get',
                url: 'https://live.douyin.com/webcast/lottery/melon/lottery_info/?aid=6383&app_name=douyin_web&live_id=1&device_platform=web&language=zh-CN&enter_from=page_refresh&cookie_enabled=true&screen_width=1536&screen_height=864&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=125.0.0.0&room_id=' + room_id + '&query_from=1&msToken=FxgJC7hqvPpohSnu3ruP6tURGb-ox5B-7MsraJV0nLuyNuFIM4LGGDbHPuzXm_r7HnlV9ORRVjH_Esc9VrLDFWxKuMYZTAmNuv5rM-7RL1IANAJNq0_Xfbv0nbvINsl3i5mNjT9iDJBICbJOLJKTOqzl8T49ujG9PNB4CNC6dlUv&a_bogus=EXsfh7tEQq5cCdFtmKnky92lwqgANPuyCrT%2FbL1KSxKEOXlYvmPHLxGSjoLdsNVJvuBkhoV7kD0lYddcs2Uz1M9kFmkvSEGS1YOc9U6L0qN6GtT%2FErWxegRzwwBeUmkN-5C3iA7R1sMN2nxR9N5NApCaC5F95bfgbHB5pMbytjAWpz8zLppftnv2nH-zBGxWMWU8tj%3D%3D',
            };
            const fudaiResp = await $.axios.get(config.url);
            try {
                const lottery_info = fudaiResp.data.data.lottery_info;
                const prize_info = lottery_info.prize_info;
                const prize_name = prize_info.name;
                const prize_description = prize_info.prize_description;
                const prize_count = lottery_info.prize_count;
                lucky_count = lottery_info.lucky_count;
                candidate_num = lottery_info.candidate_num;
                const start_time1 = lottery_info.start_time;
                const draw_time1 = lottery_info.draw_time;
                const current_time = lottery_info.current_time;
                desc = prize_description;
                if (prize_description === '') {
                    desc = prize_name + ' ' + prize_count;
                }
                const conditions = lottery_info.conditions;
                conditionStr = '';
                let count = 1;
                conditions.forEach(condition => {
                    const description = condition.description;
                    conditionStr += `${count}.${description}\n`;
                    count += 1;
                });
                if (draw_time1 - current_time > 3) {
                    const minutes = Math.floor((draw_time1 - current_time) / 60);
                    const seconds = Math.floor((draw_time1 - current_time) % 60);
                    time = `${minutes}分 ${seconds}秒`;
                    lucky = ((lucky_count / candidate_num) * 100).toFixed(4) + '%';
                    start_time = $.convertUnixTimestampToDate(start_time1.toString());
                    draw_time = $.convertUnixTimestampToDate(draw_time1.toString());
                    pic = avatar_thumb;

                    title = `*${desc}*  \n🔥中奖名額 => *${lucky_count}* 个\n当前参与人数 *${candidate_num}*\n中奖概率: *${lucky}*\n\n开始时间: *${start_time}* \n结束时间: *${draw_time}*\n\n⌛距离开奖还剩 *${time}*\n\n*${conditionStr}*`;
                } else {
                    room_status = 0;
                }

            } catch (e) {
                room_status = 0;
            }
            if (fudaiResp.data.data === '') {
                room_status = 0;
            }
        }
        // 构建json对象
        douyinJson = {mid, username, pic, desc, lucky_count, candidate_num, lucky, start_time, draw_time, time, conditionStr, targetUrl};

        const code = 1;
        return {code, title, username, roomid, avatar_thumb, room_status, liveUrl, targetUrl, douyinJson};
    } catch (error) {
        const msg = `请求失败: ${error}`;
        const code = 0;
        return {msg, code};
    }
};

module.exports = {
    getHost() {
        return host;
    },
    getStationStatus,
    getModuleName() {
        return 'fd.live.douyin.com';
    },
    getMidCount() {
        return 3;
    }
};
