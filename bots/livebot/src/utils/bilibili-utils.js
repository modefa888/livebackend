const axios = require('axios');

/**
 * 从字符串中提取B站URL（支持短链与完整链接）
 * @param {string} inputStr - 包含B站URL的输入字符串
 * @returns {string|0} 提取到的B站URL或0（未找到时）
 */
function extractBiliBiliUrl(inputStr) {
    // 支持 b23.tv 短链和 bilibili.com 的完整链接
    const pattern = /(https:\/\/(?:b23\.tv|www\.bilibili\.com)\/[^\s]+)/;
    const match = inputStr.match(pattern);
    return match ? match[0] : 0;
}

/**
 * 解析B站短链接，获取真实跳转地址
 * @param {string} shortUrl - B站短链接（如 b23.tv）
 * @returns {Promise<string>} 真实的B站视频地址
 */
async function resolveBiliShortUrl(shortUrl) {
    try {
        const response = await axios.get(shortUrl, {
            maxRedirects: 0, // 不自动跳转
            validateStatus: status => status >= 300 && status < 400 // 只处理重定向
        });

        const location = response.headers.location;
        if (!location) throw new Error('未找到重定向地址');
        return location.startsWith('http') ? location : `https:${location}`;
    } catch (error) {
        console.error('短链接解析失败:', error.message);
        throw error;
    }
}

/**
 * 调用解析接口获取B站视频信息
 * @param {string} biliUrl - B站视频URL（可为短链或完整地址）
 * @returns {Promise<object>} 解析后的视频信息
 */
async function fetchBiliBiliInfo(biliUrl) {
    if (!biliUrl) {
        throw new Error('请提供有效的B站视频URL');
    }

    try {
        // 如果是短链，先解析重定向地址
        if (biliUrl.includes('b23.tv')) {
            console.log('检测到短链接，正在解析真实地址...');
            biliUrl = await resolveBiliShortUrl(biliUrl);
            console.log('解析成功: ' + biliUrl.split('?')[0]);
            // console.log('解析成功，真实地址:', biliUrl);
        }

        // 构造请求URL（编码参数防止特殊字符问题）
        const apiUrl = `https://api.mir6.com/api/bzjiexi?url=${encodeURIComponent(biliUrl)}&type=json`;

        // 发送请求
        const response = await axios.get(apiUrl, {
            timeout: 10000,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (response.status !== 200) {
            throw new Error(`接口请求失败，状态码: ${response.status}`);
        }

        return response.data;
    } catch (error) {
        console.error('B站视频解析失败:', error.message);
        throw error;
    }
}

module.exports = {
    extractBiliBiliUrl,
    fetchBiliBiliInfo
};
