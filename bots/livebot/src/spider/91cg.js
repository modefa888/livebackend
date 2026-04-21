const includes = require('../config/includes');
const cheerio = require('cheerio');

const host = 'https://www.91cg1.com';


const getStationStatus = async (mid = 'zxcghl') => {
    try {
        let targetUrl = `${host}/category/${mid}`;
        // 发送带浏览器头的请求
        const response = await includes.axios.get(targetUrl);

        const $ = cheerio.load(response.data);

        let room_status = 0;
        let title = '';
        let username = '';
        let avatar_thumb;
        let liveUrl = '';
        let roomid = mid;
        // 获取列表
        let index = 4;
        const articleList = $('article');
        let article = articleList[index];

        while ($(article).find('h2').text() == '' ) {
            index++;
            article = articleList[index];
        }
    
        // 解析对象内容
        const href = $(article).find('a').attr('href');
        title = $(article).find('h2').text();
        // const spanList = $(article).find('.post-card-info').find('span');
        // username = spanList.eq(0).text() + spanList.eq(1).text() + spanList.eq(2).text();
        username = '51cg';
        const script = $(article).find('script').text().replace('\n', '').replace('  ', '');
        const regex = /loadBannerDirect\('(.*?)'\)/;
        const image = script.match(regex)[1].split("',")[0];
        avatar_thumb = 'https://daily-api-amber.vercel.app/51cg/img?url=' + image;
        targetUrl = host + href;

        room_status = href;
        let code = 1;
        if (image.includes('.gif')){
            code = 0;
        }

        // 获取真实播放源
        const sourceHtml = await includes.axios.get(targetUrl);
        const source = cheerio.load(sourceHtml.data);
        const htmlContent = source.html().replace(/&amp;/g,"&").replace(/&quot;/g,'"');
        const regex2 = /"video":{"url":"(.*?)"/g;

        let urlStr = '';
        let match;
        while ((match = regex2.exec(htmlContent)) !== null) {
            const url = match[1].replace(/\\\//g, '/');
            urlStr += url.split("?")[0] + "#";
        }
        // 去除末尾的'#'
        liveUrl = urlStr.slice(0, -1);

        return { code, title, username, roomid, avatar_thumb, room_status, liveUrl, targetUrl };
    } catch (error) {
        const msg = `请求失败: ${error.message}`;
        const code = 0;
        return { msg, code, room_status: 0 };
    }
};

const getList = async (turl) => {
    try {
        let targetUrl = '';
        const response = await includes.axios.get(turl);
        const $ = cheerio.load(response.data);
        let mid = 'wpcz';
        let liveStatus = 0;
        let title = '';
        let username = '';
        let pic;
        let url = '';
        let roomid = mid;
        let site = host.split('/')[2];
        let dataList = [];
        const articleList = $('article');
        articleList.each((index, item) => {
            const href = $(item).find('a').attr('href');
            title = $(item).find('h2').text();
            const spanList = $(item).find('.post-card-info').find('span');
            // username = spanList.eq(0).text() + spanList.eq(1).text() + spanList.eq(2).text();
            username = '91cg';
            const script = $(item).find('script').text().replace('\n', '').replace('  ', '');
            const regex = /loadBannerDirect\('(.*?)'\)/;
            const image = script.match(regex)[1].split("',")[0];
            pic = 'https://daily-api-amber.vercel.app/51cg/img?url=' + image;
            targetUrl = host + href;
            liveStatus = href;
            if (!image.includes('.gif')){
                dataList.push({title, username, mid, roomid, site, pic, liveStatus, url, targetUrl });
            }
        });
        const code = 1;
        return {code, dataList};
    } catch (error) {
        const msg = `请求失败: ${error.message}`;
        const code = 0;
        return { msg, code, room_status: 0 };
    }
};

const getM3u8 = async (url) => {
    try {
        // 获取真实播放源
        const sourceHtml = await includes.axios.get(url);
        const source = cheerio.load(sourceHtml.data);
        const htmlContent = source.html().replace(/&amp;/g,"&").replace(/&quot;/g,'"');
        const regex2 = /"video":{"url":"(.*?)"/g;

        let urlStr = '';
        let match;
        while ((match = regex2.exec(htmlContent)) !== null) {
            const url = match[1].replace(/\\\//g, '/');
            urlStr += url.split("?")[0] + "#";
        }
        // 去除末尾的'#'
        return urlStr.slice(0, -1);
    } catch (error) {
        const msg = `请求失败: ${error.message}`;
        includes.log("获取m3u8 =》 " + msg);
        return null;
    }
};


module.exports = {
    getHost(){
        return host;
    },
    getStationStatus,
    getModuleName() {
        return host.split('/')[2];
    },
    getMidCount(){
        return 4;
    },
    getList,
    getM3u8
};
