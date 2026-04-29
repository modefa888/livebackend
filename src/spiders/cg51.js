const express = require('express');
const cheerio = require('cheerio');
const axiosClient = require('../utils/axiosClient');
const { get, set } = require('../utils/cacheData');

const router = express.Router();

const routerInfo = {
    name: "51cg",
    title: "51吃瓜",
    subtitle: "每日榜",
    category: "吃瓜🍉"
};
// "wpac(今日吃瓜) mrdg(每日吃瓜) rdsj(热门吃瓜) bkdg(必看大瓜) whhl(网红黑料) xsxy(学生学校) whmx(明星黑料)"

const cgHost = "https://51cg1.com";
const cacheKey = "51cgData";
let updateTime = new Date().toISOString();

async function fetchHtml(url) {
    const res = await axiosClient({
        url,
        useProxy: true,
        headers: { Referer: cgHost }
    });
    return res.data;
}

function getData(html, imgHost) {
    if (!html) return [];

    try {
        const $ = cheerio.load(html);
        const list = [];

        $("article").each((_, el) => {
            const title = $(el).find(".post-card-title").text().trim();
            const href = $(el).find("a").attr("href");
            const date = $(el).find(".post-card-info span").text().trim();

            let pic = null;
            const match = /loadBannerDirect\('([^']+)'/.exec($(el).text());
            if (match?.[1]) {
                pic = imgHost + match[1];
            }

            if (!title || !date || !href) return;

            list.push({
                title,
                desc: title,
                date,
                pic,
                hot: 0,
                url: href.replace(cgHost, ""),
                mobileUrl: pic,
                href: cgHost + href.replace(cgHost, "")
            });
        });

        return list;
    } catch {
        console.warn("[51cg][PARSE_ERROR]");
        return [];
    }
}

router.get('/', async (req, res) => {
    const imgHost = `http://${req.headers.host}/spider-api/cg51/img?url=`;

    try {
        let data = await get(cacheKey);
        const from = data ? "cache" : "server";

        if (!data) {
            const html = await fetchHtml(cgHost);
            data = getData(html, imgHost);
            updateTime = new Date().toISOString();
            await set(cacheKey, data);
        }

        res.json({
            code: 200,
            message: "获取成功",
            ...routerInfo,
            from,
            total: data.length,
            updateTime,
            data
        });
    } catch (error) {
        console.warn("[51cg][REQUEST_ERROR]", error.message);
        res.status(403).json({ code: 403, message: "目标站点访问受限（请检查代理）" });
    }
});

router.get('/category/:param1/:param2', async (req, res) => {
    const { param1, param2 } = req.params;
    const imgHost = `http://${req.headers.host}/spider-api/cg51/img?url=`;
    const url = `${cgHost}/category/${param1}/${param2}`;
    const key = `${cacheKey}_${param1}_${param2}`;

    try {
        let data = await get(key);
        const from = data ? "cache" : "server";

        if (!data) {
            const html = await fetchHtml(url);
            data = getData(html, imgHost);
            updateTime = new Date().toISOString();
            await set(key, data);
        }

        res.json({
            code: 200,
            message: "获取成功",
            ...routerInfo,
            from,
            total: data.length,
            updateTime,
            data
        });
    } catch (error) {
        console.warn("[51cg][REQUEST_ERROR]", error.message);
        res.status(403).json({ code: 403, message: "目标站点访问受限（请检查代理）" });
    }
});

router.get('/search/:wd/:page', async (req, res) => {
    const { wd, pg } = req.params;
    const imgHost = `http://${req.headers.host}/spider-api/cg51/img?url=`;
    const url = `${cgHost}/search/${wd}/${pg}/`;
    const key = `${cacheKey}_${wd}_${pg}`;

    try {
        let data = await get(key);
        const from = data ? "cache" : "server";

        if (!data) {
            const html = await fetchHtml(url);
            data = getData(html, imgHost);
            updateTime = new Date().toISOString();
            await set(key, data);
        }

        res.json({
            code: 200,
            message: "获取成功",
            ...routerInfo,
            from,
            total: data.length,
            updateTime,
            data
        });
    } catch (error) {
        console.warn("[51cg][REQUEST_ERROR]", error.message);
        res.status(403).json({ code: 403, message: "目标站点访问受限（请检查代理）" });
    }
});

router.get('/uid/:uid', async (req, res) => {
    const { uid } = req.params;
    const imgHost = `http://${req.headers.host}/spider-api/cg51/img?url=`;
    const url = `${cgHost}/archives/${uid}`;
    const key = `${cacheKey}_${uid}`;

    try {
        let data = await get(key);

        if (!data) {
            const html = await fetchHtml(url);
            const $ = cheerio.load(html);

            const ImageList = [];
            $(".post-content img").each((_, el) => {
                const img = $(el).attr("data-xkrkllgl");
                if (img) ImageList.push(imgHost + img);
            });

            const urls = [];
            const reg = /"url":"(.+?)"/g;
            let m;
            while ((m = reg.exec(html))) {
                urls.push(m[1].replace(/\\/g, ""));
            }

            data = {
                title: $(".post-title").text().trim(),
                ImageList,
                date: $("time").eq(0).text().replace(/\s+/g, ""),
                url: urls.length ? urls : [""]
            };

            await set(key, data);
            return res.json({ code: 200, message: "从远程获取成功（代理）", data });
        }

        res.json({ code: 200, message: "从缓存获取成功", data });
    } catch (error) {
        console.warn("[51cg][DETAIL_ERROR]", error.message);
        res.status(403).json({ code: 403, message: "目标站点访问受限（请检查代理）" });
    }
});

router.get('/img', async (req, res) => {
    try {
        const { loadBackgroundImage } = require('../utils/51cgjm');
        const base64 = await loadBackgroundImage(req.query.url);
        res.type("image/jpeg");
        res.send(Buffer.from(base64.split(",")[1], "base64"));
    } catch (error) {
        console.warn("[51cg][IMG_ERROR]", error.message);
        res.status(403).send("Error");
    }
});

module.exports = router;
module.exports.info = routerInfo;