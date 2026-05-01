const express = require('express');
const axiosClient = require('../utils/axiosClient');
const { get, set } = require('../utils/cacheData');

const router = express.Router();

const routerInfo = {
    name: "kuaishou",
    title: "快手解析",
    subtitle: "视频解析",
    category: "工具"
};

const cacheKey = "kuaishouData";
let updateTime = new Date().toISOString();

async function resolveUrl(url) {
    const res = await axiosClient({
        url,
        maxRedirects: 5,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
        }
    });
    return res.request.res?.responseUrl || res.config.url || url;
}

function parseHtml(html) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr("content") || $("title").text();
    const cover = $('meta[property="og:image"]').attr("content") || "";
    const videoUrl = $('meta[property="og:video"]').attr("content") || $('meta[property="og:video:url"]').attr("content") || "";

    return { title, cover, videoUrl };
}

router.get('/parse', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ code: 400, message: "缺少 url 参数" });
    }

    const key = `${cacheKey}_${encodeURIComponent(url)}`;

    try {
        let data = await get(key);

        if (!data) {
            console.log("[kuaishou] input:", url);

            const realUrl = await resolveUrl(url);
            console.log("[kuaishou] realUrl:", realUrl);

            const htmlRes = await axiosClient({
                url: realUrl,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
                }
            });

            const html = htmlRes.data;
            const parsedData = parseHtml(html);

            data = {
                source: "node-kuaishou-api",
                input: url,
                realUrl,
                ...parsedData
            };

            updateTime = new Date().toISOString();
            await set(key, data, 300);

            return res.json({ code: 200, message: "从远程获取成功", ...routerInfo, updateTime, data });
        }

        res.json({ code: 200, message: "从缓存获取成功", ...routerInfo, updateTime, data });
    } catch (err) {
        console.error("[kuaishou error]", err.message);
        res.status(500).json({ code: 500, message: "解析失败", error: err.message });
    }
});

module.exports = router;
module.exports.info = routerInfo;