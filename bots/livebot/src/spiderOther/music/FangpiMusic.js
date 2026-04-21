const $ = require("../../config/includes");
const axios = $.axios;
const https = require('https');
const cheerio = require('cheerio');

// 自定义HTTPS Agent配置
const httpsAgent = new https.Agent({
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',
    ciphers: [
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384'
    ].join(':'),
    ALPNProtocols: [],
    keepAlive: true,
    keepAliveMsecs: 3000,
    rejectUnauthorized: false // 仅测试用
});

/**
 * 带指数退避重试的请求方法
 */
const requestWithRetry = async (url, options, retries = 3, delay = 1000) => {
    try {
        const method = options.method || 'get';
        return method.toLowerCase() === 'post'
            ? await axios.post(url, options.data, options)
            : await axios.get(url, options);
    } catch (error) {
        if (retries > 0 && [ 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT' ].includes(error.code)) {
            console.log(`连接错误: ${error.message}，将在 ${delay}ms 后重试（剩余次数：${retries - 1}）`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return requestWithRetry(url, options, retries - 1, delay * 2);
        }
        throw error;
    }
};

/**
 * 从HTML内容中解析window.appData
 */
const parseMusicData = (htmlContent) => {
    try {
        const regex = /window\.appData\s*=\s*({[\s\S]*?});/;
        const match = htmlContent.match(regex);

        if (!match || !match[1]) {
            throw new Error('未找到window.appData数据');
        }

        return JSON.parse(match[1]);
    } catch (error) {
        throw new Error(`数据解析失败: ${error.message}`);
    }
};

/**
 * 从搜索结果HTML中解析音乐列表
 */
const parseSearchResults = (htmlContent) => {
    try {
        const $ = cheerio.load(htmlContent);
        const musicList = [];

        // 查找所有音乐行
        $('.row:not(.mb-3)').each((index, element) => {
            const $row = $(element);
            const $link = $row.find('.music-link');

            // 提取音乐ID（从链接中获取）
            const href = $link.attr('href') || '';
            const idMatch = href.match(/\/music\/(\d+)/);
            const id = idMatch ? idMatch[1] : null;

            // 提取标题和歌手
            const title = $row.find('.music-title span').text().trim();
            const author = $row.find('.text-jade').text().trim();

            // 只有当ID存在时才添加到列表
            if (id && title) {
                musicList.push({
                    id,
                    title,
                    author,
                    url: href.startsWith('http') ? href : `https://www.fangpi.net${href}`
                });
            }
        });

        // 提取结果总数
        const totalText = $('.badge-pill.badge-light-orange').text() || '';
        const totalMatch = totalText.match(/共(\d+)条/);
        const total = totalMatch ? parseInt(totalMatch[1], 10) : musicList.length;

        return {
            total,
            list: musicList
        };
    } catch (error) {
        throw new Error(`搜索结果解析失败: ${error.message}`);
    }
};

/**
 * 请求 fangpi.net 音乐详情页
 */
const getFangpiMusic = async (url) => {
    try {
        const response = await requestWithRetry(url, {
            httpsAgent,
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'zh-CN,zh;q=0.9',
                'cache-control': 'max-age=0',
                'cookie': 'Hm_tf_h48pobjluto=1755857956; fp_referer=input%20domain; Hm_lvt_h48pobjluto=1758862346,1759728586,1760056389; Hm_lpvt_h48pobjluto=1760056905',
                'priority': 'u=0, i',
                'referer': 'https://www.fangpi.net/s/%E5%85%B3%E5%B1%B1%E9%85%92',
                'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Linux"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
            },
            timeout: 15000,
            maxRedirects: 5
        });

        return {
            success: true,
            data: response.data,
            status: response.status
        };
    } catch (error) {
        console.error('请求失败:', error.message, '错误代码:', error.code);
        return {
            success: false,
            error: error.message,
            code: error.code || 'UNKNOWN_ERROR',
            status: error.response?.status || null
        };
    }
};

/**
 * 获取音乐真实播放地址
 */
const getPlayUrl = async (playId) => {
    try {
        const url = 'https://www.fangpi.net/api/play-url';

        // 准备表单数据
        const formData = new URLSearchParams();
        formData.append('id', playId);

        const response = await requestWithRetry(url, {
            method: 'post',
            httpsAgent,
            headers: {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'accept-language': 'zh-CN,zh;q=0.9',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'cookie': 'Hm_tf_h48pobjluto=1755857956; fp_referer=input%20domain; Hm_lvt_h48pobjluto=1758862346,1759728586,1760056389; Hm_lpvt_h48pobjluto=1760056905',
                'origin': 'https://www.fangpi.net',
                'priority': 'u=1, i',
                'referer': 'https://www.fangpi.net/music/26730599',
                'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Linux"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
                'x-requested-with': 'XMLHttpRequest'
            },
            data: formData,
            timeout: 15000,
            maxRedirects: 5
        });

        return {
            success: true,
            data: response.data,
            status: response.status
        };
    } catch (error) {
        console.error('获取播放地址失败:', error.message, '错误代码:', error.code);
        return {
            success: false,
            error: error.message,
            code: error.code || 'UNKNOWN_ERROR',
            status: error.response?.status || null
        };
    }
};

/**
 * 搜索音乐
 */
const searchMusic = async (keyword) => {
    console.log(`开始搜索音乐，关键词: ${keyword}`);

    try {
        // 对关键词进行URL编码
        const encodedKeyword = encodeURIComponent(keyword);
        const url = `https://www.fangpi.net/s/${encodedKeyword}`;

        const response = await requestWithRetry(url, {
            httpsAgent,
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'zh-CN,zh;q=0.9',
                'cookie': 'Hm_tf_h48pobjluto=1755857956; fp_referer=input%20domain; Hm_lvt_h48pobjluto=1758862346,1759728586,1760056389; Hm_lpvt_h48pobjluto=1760060144',
                'priority': 'u=0, i',
                'referer': 'https://www.fangpi.net/',
                'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Linux"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
            },
            timeout: 15000,
            maxRedirects: 5
        });

        // 解析搜索结果HTML
        const searchData = parseSearchResults(response.data);

        console.log(`搜索成功，找到 ${searchData.total} 条结果`);

        return {
            success: true,
            status: response.status,
            data: {
                total: searchData.total,
                results: searchData.list
            }
        };
    } catch (error) {
        console.error('搜索失败:', error.message);
        return {
            success: false,
            error: error.message,
            code: error.code || 'UNKNOWN_ERROR'
        };
    }
};

/**
 * 获取并解析音乐详情，包括播放地址
 */
const getDetailMusic = async (musicId) => {
    console.log(`开始获取音乐详情，ID: ${musicId}`);
    const url = `https://www.fangpi.net/music/${musicId}`;

    try {
        // 1. 获取音乐详情页
        const result = await getFangpiMusic(url);
        if (!result.success) {
            throw new Error(`请求失败: ${result.error} (错误代码: ${result.code})`);
        }

        // 2. 解析基础信息
        const musicData = parseMusicData(result.data);

        // 3. 获取播放地址
        const playUrlResult = await getPlayUrl(musicData.play_id);
        if (!playUrlResult.success) {
            throw new Error(`获取播放地址失败: ${playUrlResult.error}`);
        }

        // 4. 整合所有信息
        return {
            success: true,
            data: {
                ...musicData,
                playUrl: playUrlResult.data
            }
        };
    } catch (error) {
        console.error("处理失败:", error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

// 导出所有公共方法
module.exports = {
    searchMusic,
    getDetailMusic,
    getPlayUrl
};
