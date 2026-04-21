const includes = require('../config/includes');
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
  let base_url = 'https://www.utobe.tv';
  let results = [];
  try {
    const encodedSearchWord = encodeURIComponent(search_word);
    const url = `${base_url}/vod/search/${encodedSearchWord}----------${page_number}---.html`;
    console.log(url)
    const response = await includes.axios.get(url, { headers });
    if (response.status !== 200) {
      includes.log(`请求失败，状态码：${response.status}`,'error');
    }
    console.log(response.data)

    const $ = cheerio.load(response.data);

    let index = 1;
    $('.module-search-item').each((i, item) => {
      const titleLink = $(item).find('a').eq(0);
      const title = titleLink.attr('title');
      const href = base_url + titleLink.attr('href');
      const imgSrc = $(item).find('img').data('src');
      const gx = $(item).find('.video-serial').text();
      const line = `${index}. ${title} - [图片](${imgSrc}) - ${gx} - [观看](${href})\n`;
      index += 1;
      results.push(line)
    });
    const Page = $('.page-next').eq(1).attr('href');
    let totalPages = 1;
    if(Page){
      totalPages = $('.page-next').eq(1).attr('href').split('/')[3].split('----------')[1].replace('---.html','');
    }

    return {results, totalPages};
  } catch (error) {
    includes.log(`搜索过程中发生错误：${error}`, 'error');

    return '';
  }
}

module.exports = {
  search,
};
