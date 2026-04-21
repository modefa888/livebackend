var request = require('request');

const headers = {
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="127", "Not)A;Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'Cookie': 'ttwid=1%7CdW9fgRP2_tnH8xIMeqrT1UYXXw6sT7zgA2CPgF1VHM4%7C1751471111%7C1f7d4c19282e7cf75034198b6dc4314aeb1d6b789ca8280d2e03dfcbffca4649; __ac_nonce=068654ebc00698332a859'
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
const getShareUser = async (shareUrl) => {
    try {
        // console.log('请求开始，URL:', shareUrl);
        const options = {
            url: shareUrl,
            headers: headers
        };
        const { response, body } = await requestPromise(options);
        const result = processResponse(body); // 将原有callback逻辑提取为函数
        return result;
    } catch (error) {
        const msg = `请求失败: ${error}`;
        const code = 0;
        room_status = 0;
        return { msg, code, room_status };
    }
};

// 3. 提取回调逻辑到独立函数
function processResponse(body) {
    // 这里放入你原来的 callback 函数内部处理逻辑

    // 预处理HTML
    const html = body.replace(/\\"/g, '"');

    // ------ 新增解析逻辑 ------
    // 定义需要提取的字段映射表
    const fieldMappings = {
        'shareTitle': 'title',            // 直播间标题
        // 'shareImage': 'cover_img',         // 封面图URL
        'shareDesc': 'desc',               // 描述文案
        // 'ShareAppDesc': 'app_desc',        // APP分享描述
        'shareTimelineTitle': 'timeline_title' // 时间线标题
    };

    // 遍历映射表提取数据
    const result = { code: 1 };
    Object.entries(fieldMappings).forEach(([htmlName, resultKey]) => {
        const regex = new RegExp(`name="${htmlName}"\\s+value="([^"]+)"`);
        const match = html.match(regex);
        if (match) result[resultKey] = match[1];
    });

    // ------ 提取 webRid ------
    const webRidRegex = /"webRid"\s*:\s*"(\d+)"/;
    const webRidMatch = html.match(webRidRegex);
    const webRid = webRidMatch ? webRidMatch[1] : null;
    result.webRid = webRid;

    // ------ 你原有的其他解析逻辑 ------
    // 如果还需要保留之前的直播间状态解析
    const statusRegex = /"status":(\d+)/;
    const statusMatch = html.match(statusRegex);
    result.room_status = statusMatch ? Number(statusMatch[1]) : 0;

    // console.log('解析结果:', result);
    
    return result; //返回最终数据
}


function extractDouyinUrl(inputStr) {
    // 匹配抖音标准短链模式（兼容可能附带的非空字符）
    const pattern = /https:\/\/v\.douyin\.com\/[\w-]+[^\s]*/;
    const match = inputStr.match(pattern);

    // 返回匹配结果或 0
    return match ? match[0] : 0;
}

module.exports = {
    getShareUser,
    extractDouyinUrl
};