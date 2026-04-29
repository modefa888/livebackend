const express = require('express');
const cheerio = require('cheerio');
const axiosClient = require('../utils/axiosClient');
const { get, set } = require('../utils/cacheData');

const router = express.Router();

const routerInfo = {
    name: "xvideos",
    title: "xvideos影视",
    subtitle: "每日榜",
    category: "影视"
};

const cacheKey = "xvideosData";
const Host = "https://www.xvideos.com";
let updateTime = new Date().toISOString();

const getData = (html) => {
    if (!html) return null;

    try {
        const listData = [];
        const $ = cheerio.load(html);

        $('.frame-block').each((_, element) => {
            const title = $(element).find('.title').text().trim();
            const img = $(element).find('.thumb img').attr('data-src');
            const hrefPath = $(element).find('.thumb a').attr('href');
            const time = $(element).find('.duration').first().text().trim();

            if (!hrefPath) return;

            const href = Host + hrefPath;

            listData.push({
                aid: hrefPath.split('/')[1] + '@' + hrefPath.split('/')[2],
                title,
                img,
                href,
                time,
                video_url: null,
            });
        });

        return {
            count: $('.last-page').first().text() || listData.length,
            data: listData
        };
    } catch (err) {
        console.error('[xvideos] HTML 解析失败:', err.message);
        return null;
    }
};

router.get('/uid/:uid', async (req, res) => {
    const { uid } = req.params;
    const url = Host + `/${uid.replace('@', '/')}`;
    const key = `${cacheKey}_${uid}`;

    try {
        let data = await get(key);

        if (!data) {
            console.log('[xvideos] 播放页远程获取 =>', url);

            const resData = await axiosClient({
                url,
                useProxy: true
            });

            const match = resData.data.match(/contentUrl":\s*"(.+?)"/);
            if (!match) {
                return res.status(500).json({ code: 500, message: "页面结构已变更，未解析到播放地址" });
            }

            const ogImgMatch = resData.data.match(/<meta property="og:image" content="(.+?)"/);
            const titleMatch = resData.data.match(/<meta property="og:title" content="(.+?)"/);
            
            const img = ogImgMatch ? ogImgMatch[1] : '';
            const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : '';
            const m3u8 = match[1];

            data = { m3u8, img, title, url };
            await set(key, data);

            return res.json({ code: 200, message: "从远程获取成功", data });
        }

        res.json({ code: 200, message: "从缓存获取成功", data });
    } catch (err) {
        console.error('[xvideos] 播放地址获取失败:', err.message);
        res.status(606).json({ code: 606, message: "目标站点不可达或被拦截（代理 / 网络异常）" });
    }
});

router.get('/search/:wd/:page', async (req, res) => {
    const { wd, page } = req.params;
    const url = `${Host}/?k=${encodeURIComponent(wd)}&p=${page}`;
    const cacheKeyUrl = `${cacheKey}_${url}`;

    try {
        let data = await get(cacheKeyUrl);
        const from = data ? "cache" : "server";

        if (!data) {
            console.log('[xvideos] 搜索远程获取 =>', url);

            const resData = await axiosClient({
                url,
                useProxy: true
            });

            data = getData(resData.data);
            updateTime = new Date().toISOString();

            if (!data) {
                return res.json({
                    code: 500,
                    ...routerInfo,
                    message: "页面解析失败，可能站点结构已更新"
                });
            }

            await set(cacheKeyUrl, data);
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
        console.error('[xvideos] 搜索失败:', err.message);
        res.status(500).json({ code: 500, message: "目标站点访问失败（代理异常或网络不可用）" });
    }
});

module.exports = router;
module.exports.info = routerInfo;