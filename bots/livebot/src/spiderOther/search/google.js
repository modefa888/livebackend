const includes = require('../../config/includes');
const cheerio = require('cheerio'); // 用于解析 HTML

const headers = {
    // 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    // 'Accept-Encoding': 'gzip, deflate, br, zstd',
    // 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    // 'Cache-Control': 'no-cache',
    // 'Cookie': 'clothes=white; PHPSESSID=bd452172f30b4fe18373708f696877f3',
    // 'Pragma': 'no-cache',
    // 'Priority': 'u=0, i',
    // 'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    // 'Sec-Ch-Ua-Mobile': '?0',
    // 'Sec-Ch-Ua-Platform': '"Windows"',
    // 'Sec-Fetch-Dest': 'document',
    // 'Sec-Fetch-Mode': 'navigate',
    // 'Sec-Fetch-Site': 'same-origin',
    // 'Sec-Fetch-User': '?1',
    // 'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
};

const search = async (search_word, page_number) => {
    let base_url = 'https://www.google.com/search?q=';
    let results = [];
    let totalPages = 1;
    try {
        const encodedSearchWord = encodeURIComponent(search_word);
        const url = `${base_url}${encodedSearchWord}&location=Austin,+Texas,+United+States&hl=en&gl=us&google_domain=google.com`;

        const response = await includes.axios.get(url);
        if (response.status !== 200) {
            includes.log(`请求失败，状态码：${response.status}`, 'error');
        }
        // console.log(response.data)
        const $ = cheerio.load(response.data);

        const data = $.html().split('style><div><\/div>')[1].split('<foote')[0];
        const dataHtml = cheerio.load(data);
        let count = 0;
        dataHtml('a').each((index, element) => {
            const href = dataHtml(element).attr('href');
            const title = dataHtml(element).find('h3').text();
            if (title != '' && href.includes('http')) {
                count += 1;
                const target = href.replace("/url?q=","").split("&")[0];
                const line = `${count}. ${title} - [查看](${target})\n`;
                results.push(line)
            }
        });

        return {results, totalPages};
    } catch (error) {
        includes.log(`搜索过程中发生错误：${error}`, 'error');
        return '';
    }
}

module.exports = {
    search,
};
