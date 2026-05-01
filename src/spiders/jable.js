const express = require('express');
const cheerio = require('cheerio');
const axiosClient = require('../utils/axiosClient');
const { get, set } = require('../utils/cacheData');

const router = express.Router();

const routerInfo = {
    name: "jabletv",
    title: "jabletv影视",
    subtitle: "每日榜",
    category: "影视"
};

const cacheKey = "jabletvData";
const Host = "https://jable.tv";
let updateTime = new Date().toISOString();

const getData = (html) => {
    if (!html) return { data: [] };

    try {
        const $ = cheerio.load(html);
        const list = [];

        $(".video-img-box").each((_, el) => {
            const title = $(el).find(".title").text().trim();
            const href = $(el).find(".title a").attr("href");
            const time = $(el).find(".label").text().trim();
            const img = $(el).find("img").attr("data-src");

            if (!title || !href) return;

            list.push({
                aid: href.split('/')[4],
                title,
                img,
                href: href,
                time,
                video_url: null
            });
        });

        return { data: list };
    } catch (err) {
        console.error("[jabletv][PARSE_ERROR]", err.message);
        return { data: [] };
    }
};

function parseCategories(html) {
    const $ = cheerio.load(html);
    const list = [];

    $("#list_categories_video_categories_list .video-img-box").each((index, el) => {
        const name = $(el).find("h4").text().trim();
        const totalText = $(el).find(".label").text().trim();
        const href = $(el).find("a").attr("href") || "";
        const cover = $(el).find("img").attr("src") || "";

        const slugMatch = href.match(/\/categories\/([^\/]+)\//);
        const slug = slugMatch ? slugMatch[1] : "";

        const totalVideos = parseInt(totalText.replace(/[^\d]/g, ""), 10) || 0;

        list.push({
            id: index + 1,
            name,
            categoryId: slug,
            totalVideos,
            totalText,
            href,
            cover
        });
    });

    return {
        title: $("h2").text().trim(),
        total: list.length,
        data: list
    };
}

router.get('/categories', async (req, res) => {

    const url = `${Host}/categories/?mode=async&function=get_block&block_id=list_categories_video_categories_list&sort_by=total_videos&_=1777459584326`;
    const key = `${cacheKey}_${url}`;

    console.log(`[jabletv][SEARCH] /categories`);

    try {
        let data = await get(key);
        const from = data ? "cache" : "server";

        if (!data) {
            console.log("[jabletv][SEARCH] 缓存未命中，开始请求（代理优先）");

            const resData = await axiosClient({
                url,
                method: "GET",
                useProxy: true,
                headers: {
                    Referer: Host,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
                }
            });

            data = parseCategories(resData.data);
            updateTime = new Date().toISOString();
            await set(key, data);
        }

        res.json({
            code: 200,
            message: "获取成功",
            ...routerInfo,
            from,
            total: data.data.length,
            updateTime,
            data: data.data
        });
    } catch (err) {
        console.error("[jabletv][SEARCH_ERROR]", err.message);
        res.status(502).json({ code: 502, message: "目标站点访问失败（请检查代理）" });
    }
});

router.get('/category/:category/:page', async (req, res) => {
    const { category, page } = req.params;

    const url = `${Host}/categories/${category}/?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&from=${page}&_=1777459036529`;
    const key = `${cacheKey}_${url}`;

    console.log(`[jabletv][SEARCH] ${category} page=${page}`);

    try {
        let data = await get(key);
        const from = data ? "cache" : "server";

        if (!data) {
            console.log("[jabletv][SEARCH] 缓存未命中，开始请求（代理优先）");

            const resData = await axiosClient({
                url,
                method: "GET",
                useProxy: true,
                headers: {
                    Referer: Host,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
                }
            });

            data = getData(resData.data);
            updateTime = new Date().toISOString();
            await set(key, data);
        }

        res.json({
            code: 200,
            message: "获取成功",
            ...routerInfo,
            from,
            total: data.data.length,
            updateTime,
            data
        });
    } catch (err) {
        console.error("[jabletv][SEARCH_ERROR]", err.message);
        res.status(502).json({ code: 502, message: "目标站点访问失败（请检查代理）" });
    }
});

router.get('/uid/:uid', async (req, res) => {
    const { uid } = req.params;
    const url = Host + `/videos/${uid}/`;
    const key = `${cacheKey}_${uid}`;

    try {
        let data = await get(key);

        if (!data) {
            console.log('[jabletv] 播放页远程获取 =>', url);

            const resData = await axiosClient({
                url,
                useProxy: true
            });

            const match = resData.data.match(
                /var\s+hlsUrl\s*=\s*['"]([^'"]+\.m3u8)['"]/
            );

            if (!match) {
                return res.status(500).json({ code: 500, message: "未解析到 m3u8 播放地址" });
            }

            const $ = cheerio.load(resData.data);

            const title = $(".header-left h4")
                .first()
                .text()
                .trim();

            const publishTime = $(".header-left h6 span.mr-3")
                .first()
                .text()
                .trim();

            const cover = $('meta[property="og:image"]').attr('content') || '';

            data = {
                m3u8: match[1],
                title,
                publishTime,
                cover,
                url
            };

            await set(key, data);
            return res.json({ code: 200, message: "从远程获取成功", data });
        }

        res.json({ code: 200, message: "从缓存获取成功", data });
    } catch (err) {
        console.error('[jabletv] 播放地址获取失败:', err.message);
        res.status(606).json({ code: 606, message: "目标站点不可达或被拦截" });
    }
});

router.get('/search/:wd/:page', async (req, res) => {
    const { wd, page } = req.params;

    if (!/^[\u4e00-\u9fa5]{2,}$/.test(wd)) {
        return res.status(400).json({ code: 400, message: "wd 参数必须包含至少两个中文字符" });
    }

    const url = `${Host}/search/${wd}/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${wd}&sort_by=&from=${page}&_=1769756466263`;
    const key = `${cacheKey}_${url}`;

    console.log(`[jabletv][SEARCH] ${wd} page=${page}`);

    try {
        let data = await get(key);
        const from = data ? "cache" : "server";

        if (!data) {
            console.log("[jabletv][SEARCH] 缓存未命中，开始请求（代理优先）");

            const resData = await axiosClient({
                url,
                method: "GET",
                useProxy: true,
                headers: {
                    Referer: Host,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
                }
            });

            data = getData(resData.data);
            updateTime = new Date().toISOString();
            await set(key, data);
        }

        res.json({
            code: 200,
            message: "获取成功",
            ...routerInfo,
            from,
            total: data.data.length,
            updateTime,
            data
        });
    } catch (err) {
        console.error("[jabletv][SEARCH_ERROR]", err.message);
        res.status(502).json({ code: 502, message: "目标站点访问失败（请检查代理）" });
    }
});

module.exports = router;
module.exports.info = routerInfo;