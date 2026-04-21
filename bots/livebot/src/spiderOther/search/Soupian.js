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

const search = async (search_word, page_number = 1) => {
  let base_url = 'https://soupian.pro/movie/';
  let results = [];
  let totalPages = 1;
  try {
    const encodedSearchWord = encodeURIComponent(search_word);
    const url = `${base_url}${encodedSearchWord}?page=${page_number}`;

    const response = await includes.axios.get(url, { headers });
    if (response.status !== 200) {
      includes.log(`请求失败，状态码：${response.status}`,'error');
    }
    const $ = cheerio.load(response.data);
    let index = 1;
    const list_rows = $('div.list-row-text');
    list_rows.each(function() {
        let title = $(this).find('.list-row-playicon a').attr('title');
        let href = $(this).find('.list-row-playicon a').attr('href').split('?')[0];
        const line = `${index}. ${title} - [观看](${href})\n`;
        index += 1;
        results.push(line)
    });
    // 获取所有 <a> 元素
    const allLinks = $('#page a');
    // 获取倒数第二个 <a> 元素
    const secondLastLink = allLinks.eq(allLinks.length - 2);
    totalPages = secondLastLink.text();
    return {results, totalPages};
  } catch (error) {
    includes.log(`搜索过程中发生错误：${error}`, 'error');
    return '';
  }
}

module.exports = {
  search,
};
