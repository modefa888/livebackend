const axios = require('axios'); // 确保你已安装 axios
const host = 'https://zh.stripchat.com';

const getStationStatus = async (mid) => {
    try {
        const targetUrl = host + '/' + mid;
        // console.log('访问地址:', targetUrl);

        const headers = {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'zh-CN,zh;q=0.9',
            'cache-control': 'max-age=0',
            'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Linux"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
            // 在这里设置 cookie
            // 'cookie': 'ABTest_ab_50tk_giveaway_new_text_key=A_465; ABTest_ab_always_start_auto_resolution_v2_key=A_465; ABTest_ab_new_ext_country_part3_key=B_465; ABTest_ab_pls_b_v2_key=N_465; ABTest_ab_test_parallel_testing_1_v8_key=A_465; __cf_bm=s80bST_DXTnyr1aIcapd2P2oSxQlJ_yIrPAbUTXl_CM-1760176790-1.0.1.1-PB9o86OMS64Aw6kpJDgttBOwLXyyo7OQDlHO6htdrXnY8VcC02ldv09X8Rf50JwKep9ZfQYFXI0EKAAkh90DV_OF2hrUG2t2SmqLmgA5P6JpivRGgF50s_wKubpQtl8Y; _cfuvid=5FmXaS50M6Y.HqAZVjOFE1xL7Lu7V4JymexdKUZCFAE-1760176790619-0.0.1.1-604800000'
        };

        // 发起 GET 请求
        const resp = await axios.get(targetUrl, { headers });

        // 以下是你的逻辑，解析页面数据
        const responseText = resp.data;
        let room_status = 1;
        let titleDesc = '未开播';
        let title = '';
        let username = mid;
        let avatar_thumb = '';
        let liveUrl = '';
        let roomid = mid;

        const hlsStreamUrlTemplate = responseText.match(/hlsStreamUrlTemplate":"(.*?)",/)[1].replace(/\\u002F/g, '/');
        const streamName = responseText.match(/"streamName":"(.*?)"/)[1];

        if (!streamName) {
            room_status = 0;
        } else {
            const descMatch = responseText.match(/"goalData":(.*?),"groupShowAnnouncement"/);
            if (descMatch[1] !== 'null') {
                const descData = JSON.parse(descMatch[1]);
                const goal = descData['goal'];
                const spent = descData['spent'];
                const progress = (spent / goal) * 100;
                titleDesc = descData['description'] + ` 完成度: ${progress.toFixed(2)}%`;
            } else {
                try {
                    titleDesc = responseText.match(/property="og:description" content="(.*?)"/)[1];
                } catch (e) {
                    titleDesc = '无主题';
                }
            }
        }

        const streamHost = responseText.match(/"streamHost":"(.*?)"/)[1];
        const suffix = "_auto";
        liveUrl = hlsStreamUrlTemplate
            .replace('{streamName}', streamName)
            .replace('{cdnHost}', streamHost)
            .replace('{suffix}', suffix);

        avatar_thumb = responseText.match(/property="og:image" content="(.*?)"/)[1];
        title = titleDesc;

        return {
            code: 1,
            title,
            username,
            roomid,
            avatar_thumb,
            room_status,
            liveUrl,
            targetUrl
        };

    } catch (error) {
        return {
            msg: `请求失败: ${error.message}`,
            code: 0,
            room_status: 0
        };
    }
};

module.exports = {
    getHost() {
        return host;
    },
    getStationStatus,
    getModuleName() {
        return 'zh.stripchat.com';
    },
    getMidCount() {
        return 3;
    }
};
