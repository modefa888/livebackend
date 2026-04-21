const $ = require("../config/includes");
const axios = $.axios;
const cheerio = require('cheerio');


async function Search(wd){
    axios.get('https://www.fangpi.net/s/%E5%A6%82%E6%9E%9C%E7%88%B1%E5%BF%98%E4%BA%86').then(response => {
        const html = cheerio.load(response.data);
        const rows = html('.card-text .row');
        let list = [];
        for (let i = 1; i < rows.length; i++) {
            const title = html(rows.get(i)).find('.text-primary').text().trim();
            const author = html(rows.get(i)).find('.text-success').text().trim();
            const a = html(rows.get(i)).find('.text-primary').attr('href');
            const href = a;
            const mid = a.replace("/music/","");
            list.push({mid, title, author, href})
        }
        return list;
    }).catch(err => {
        return null;
    })
}

async function Detail(mid){
    const response = await axios.get('https://www.fangpi.net/music/' + mid);
    const html = cheerio.load(response.data);
    const pic = html('#aplayer img').attr('src');
    const title = html('#music-title').text().trim();
    const lrc = html('.content-lrc').text();
    const DownloadLrcUrl = 'https://www.fangpi.net/download/lrc/' + mid;
    let playUrl = '';
    const playResp = await axios.get('https://www.fangpi.net/api/play_url?id=' + mid + '&json=1');
    playUrl = playResp.data.data.url;
    return {title, pic, playUrl, lrc, DownloadLrcUrl}
}

module.exports = {
    Search,
    Detail
}


