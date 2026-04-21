const $ = require("../../config/includes");
const cheerio = require('cheerio');
const { URL } = require('url');
const https = require('https');

// 配置常量
const CONFIG = {
    HEADERS: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3"
    },
    TIMEOUT: 20000, // 20秒超时
    RETRY_TIMES: 3, // 最多重试3次
    RETRY_DELAY: 1000, // 重试间隔1秒
    TARGET_URL: "https://www.xinye.eu.org/" // 目标网页URL
};

// 创建自定义HTTPS代理（处理可能的SSL问题）
const httpsAgent = new https.Agent({
    rejectUnauthorized: false, // 仅用于特定环境，生产环境建议启用验证
    secureProtocol: 'TLSv1_2_method'
});

/**
 * 带重试机制的通用网页请求函数
 * @param {string} url - 要请求的URL
 * @param {number} retries - 剩余重试次数
 * @returns {Promise<{soup: CheerioStatic, finalUrl: string} | null>}
 */
async function fetchPage(url, retries = CONFIG.RETRY_TIMES) {
    try {
        const response = await $.axios.get(url, {
            headers: CONFIG.HEADERS,
            timeout: CONFIG.TIMEOUT,
            maxRedirects: 5,
            httpsAgent,
            validateStatus: (status) => status >= 200 && status < 300
        });

        const soup = cheerio.load(response.data);
        return {
            soup,
            finalUrl: response.request.res.responseUrl
        };
    } catch (error) {
        if (retries > 0 && (error.code === 'ECONNABORTED' || error.message.includes('timeout'))) {
            console.log(`[WARN] 请求超时，将在${CONFIG.RETRY_DELAY}ms后重试（剩余${retries - 1}次）: ${url}`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
            return fetchPage(url, retries - 1);
        }

        console.error(`[ERROR] 请求失败 (${url}): ${error.message}`);
        return null;
    }
}

/**
 * 获取指定页面中的隐藏内容（id='hidden-content'）
 * @param {string} url - 要获取内容的页面URL
 * @returns {Promise<string | null>}
 */
async function getHiddenContent(url) {
    const result = await fetchPage(url);
    if (!result) return null;

    const { soup } = result;
    const hiddenDiv = soup('#hidden-content');

    return hiddenDiv.length ? hiddenDiv.text().trim() : null;
}

/**
 * 处理页面并返回格式化的内容
 * @returns {Promise<{success: boolean, message: string, error?: string}>}
 */
async function getFormattedContent() {
    try {
        console.log(`开始处理页面: ${CONFIG.TARGET_URL}`);
        const result = await fetchPage(CONFIG.TARGET_URL);
        if (!result) {
            return {
                success: false,
                message: "无法获取页面内容"
            };
        }

        const { soup, finalUrl } = result;
        const baseUrl = finalUrl;

        // 查找文章元素
        const article = soup('article').first();
        if (!article.length) {
            return {
                success: false,
                message: "页面中未找到<article>元素"
            };
        }

        // 提取文章链接
        const articleLink = article.find('a');
        if (!articleLink.length || !articleLink.attr('href')) {
            return {
                success: false,
                message: "未找到文章链接"
            };
        }

        const articleUrl = new URL(articleLink.attr('href'), baseUrl).href;
        console.log(`找到文章链接: ${articleUrl}`);

        // 获取隐藏内容
        const hiddenText = await getHiddenContent(articleUrl);
        if (!hiddenText) {
            return {
                success: false,
                message: "未找到隐藏内容"
            };
        }

        // 处理内容格式
        const v2Part = hiddenText.split("🔥Clash")[0].replace(/https:\/\//g, 'https://ghfast.top/https://');
        const clashPart = '🔥Clash' + (hiddenText.split("🔥Clash")[1] || '').replace(/https:\/\//g, 'https://ghfast.top/https://');

        const v2Split = v2Part.split('👉');
        const clashSplit = clashPart.split('👉');

        // 构建并返回格式化消息
        const message = `
🚨 检测到新内容更新！
➖➖➖➖➖➖➖
📄 原文地址: <a href="${articleUrl}">点击查看</a>
📦 完整内容:
${v2Split[0] || ''}
<pre>${v2Split[1] || ''}</pre>
${clashSplit[0] || ''}
<pre>${clashSplit[1] || ''}</pre>
        `.trim();

        return {
            success: true,
            message: message
        };
    } catch (error) {
        console.error("[ERROR] 内容处理失败:", error);
        return {
            success: false,
            message: "处理内容时发生错误",
            error: error.message
        };
    }
}

module.exports = {
    getFormattedContent,
    CONFIG
};
