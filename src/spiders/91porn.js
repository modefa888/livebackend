const express = require('express');
const cheerio = require('cheerio');
const axiosClient = require('../utils/axiosClient');
const { get, set } = require('../utils/cacheData');

const router = express.Router();

const routerInfo = {
    name: "91",
    title: "91影视",
    subtitle: "每日榜",
    category: "视频"
};

const cacheKey = "91Data";
const Host = "https://91porny.com";
let updateTime = new Date().toISOString();

async function fetchHtml(url) {
    const res = await axiosClient({
        url,
        useProxy: true,
        headers: { Referer: Host }
    });
    return res.data;
}

function parseVideoList(html) {
    if (!html) return { count: 0, data: [] };

    try {
        const $ = cheerio.load(html);
        const list = [];

        $(".colVideoList").each((_, el) => {
            const $el = $(el);
            const title = $el.find(".title").text().trim();
            const hrefPath = $el.find(".title").attr("href");
            
            if (!title || !hrefPath) return;

            const href = Host + hrefPath;
            if (!href.includes(`${Host}/video/`)) return;

            const style = $el.find(".img").attr("style") || "";
            const img = style.replace("background-image: url('", "").replace("')", "");
            const desc = $el.find(".text-truncate").text().replace(/\s+/g, " ").trim();
            const time = $el.find(".layer").text().trim();

            list.push({
                aid: href.split("/")[5],
                title,
                img,
                href,
                desc,
                time,
                video_url: null
            });
        });

        return {
            count: $(".container-title").text().trim(),
            data: list
        };
    } catch (err) {
        console.warn("[91][PARSE_ERROR]", err.message);
        return { count: 0, data: [] };
    }
}

function parseCategories(html) {
    const categories = [];
    const $ = cheerio.load(html);

    $(".cateContainer ul li").each((_, el) => {
        const $li = $(el);
        const clickAttr = $li.attr("click");
        const hasRedirect = clickAttr && clickAttr.trim() === "redirect";
        const href = $li.attr("data-href");
        const textContent = $li.text().trim();

        if (hasRedirect && href && textContent) {
            const match = href.match(/\/video\/category\/([^\/]+)/);
            categories.push({
                name: textContent,
                categoryId: match ? match[1] : href
            });
        }
    });

    return categories;
}

function parseVideoDetail(html, url) {
    const m3u8Match = html.match(/data-src="(.+?)">/);
    const ogImgMatch = html.match(/<meta property="og:image:secure_url" content="(.+?)"/);
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);

    if (!m3u8Match || !ogImgMatch || !titleMatch) {
        return null;
    }

    return {
        m3u8: m3u8Match[1].replace("&amp;m=", "&m="),
        img: ogImgMatch[1],
        title: titleMatch[1].replace(/\s+/g, " ").trim(),
        url
    };
}

async function handleListRequest(req, res, url, cacheKeyUrl) {
    try {
        let data = await get(cacheKeyUrl);
        const from = data ? "cache" : "server";

        if (!data) {
            const html = await fetchHtml(url);
            data = parseVideoList(html);
            updateTime = new Date().toISOString();
            await set(cacheKeyUrl, data);
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
    } catch (error) {
        console.warn("[91][REQUEST_ERROR]", error.message);
        res.status(403).json({ code: 403, message: "目标站点访问失败（代理 / 网络异常）" });
    }
}

router.get('/', (req, res) => {
    const url = Host;
    const cacheKeyUrl = `${cacheKey}_index`;
    handleListRequest(req, res, url, cacheKeyUrl);
});

router.get('/search/:wd/:page', (req, res) => {
    const { wd, page } = req.params;
    const url = `${Host}/search?keywords=${wd}&page=${page}`;
    const cacheKeyUrl = `${cacheKey}_search_${wd}_${page}`;
    handleListRequest(req, res, url, cacheKeyUrl);
});

router.get('/category/:category/:page', (req, res) => {
    const { category, page } = req.params;
    const url = `${Host}/video/category/${category}/${page}`;
    const cacheKeyUrl = `${cacheKey}_category_${category}_${page}`;
    handleListRequest(req, res, url, cacheKeyUrl);
});

router.get('/categories', async (req, res) => {
    const cacheKeyCategories = `${cacheKey}_categories`;

    try {
        let data = await get(cacheKeyCategories);

        if (!data) {
            const html = await fetchHtml(`${Host}/video`);
            data = parseCategories(html);
            updateTime = new Date().toISOString();
            await set(cacheKeyCategories, data, 3600);
        }

        res.json({
            code: 200,
            message: "获取成功",
            ...routerInfo,
            from: data.length ? "server" : "cache",
            total: data.length,
            updateTime,
            data
        });
    } catch (error) {
        console.warn("[91][CATEGORIES_ERROR]", error.message);
        res.status(403).json({ code: 403, message: "目标站点访问失败（代理 / 网络异常）" });
    }
});

router.get('/uid/:uid', async (req, res) => {
    const { uid } = req.params;
    const url = `${Host}/video/view/${uid}`;
    const key = `${cacheKey}_uid_${uid}`;

    try {
        let data = await get(key);

        if (!data) {
            const html = await fetchHtml(url);
            data = parseVideoDetail(html, url);

            if (!data) {
                return res.status(500).json({ code: 500, message: "播放地址/封面图/标题解析失败（页面结构变更）" });
            }

            await set(key, data);
            return res.json({ code: 200, message: "从远程获取成功（代理自动兜底）", data });
        }

        res.json({ code: 200, message: "从缓存获取成功", data });
    } catch (error) {
        console.warn("[91][VIDEO_ERROR]", error.message);
        res.status(606).json({ code: 606, message: "目标站点不可达（代理异常或网络受限）" });
    }
});

module.exports = router;
module.exports.info = routerInfo;