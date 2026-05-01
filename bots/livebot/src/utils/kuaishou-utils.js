const axios = require('axios');

function extractKuaishouUrl(inputStr) {
    const pattern = /https:\/\/v\.kuaishou\.com\/[\w-]+[^\s]*/;
    const match = inputStr.match(pattern);
    return match ? match[0] : 0;
}

async function parseKuaishouUrl(url) {
    const apiUrl = `https://api.suyanw.cn/api/kuaishou.php?url=${encodeURIComponent(url)}`;
    try {
        const response = await axios.get(apiUrl, { timeout: 15000 });
        return response.data;
    } catch (error) {
        console.error('[kuaishou-utils] Parse error:', error.message);
        return null;
    }
}

module.exports = {
    extractKuaishouUrl,
    parseKuaishouUrl
};