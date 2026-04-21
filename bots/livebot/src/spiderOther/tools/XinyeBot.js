const $ = require("../../config/includes");
const axios = $.axios;
const cheerio = require('cheerio');

const token = ""; // 请在这里填写你的Telegram bot token
const chat_id = ""; // 请在这里填写你的chat ID

// 异步函数：获取并解析首页
async function index(){
    try {
        const resp = await axios.get('https://www.xinye.eu.org/');
        const soup = cheerio.load(resp.data);
        const data = soup('article a'); // 使用正确的选择器
        const href = data.attr('href');
        const title = data.text().trim();
        return { title, href };
    } catch (error) {
        $.log('获取首页时出错:' + error.message , 'error');
        throw error; // 抛出错误，以便在调用该函数时可以捕获
    }
}

// 异步函数：获取隐藏内容并处理
async function get_jidian(url){
    try {
        const resp = await axios.get(url);
        const soup = cheerio.load(resp.data);
        const result = soup('#hidden-content').text().replace(/\n\n/g, '');
        let v2 = result.split("Clash")[0].replace('https://', 'https://ghfast.top/https://');
        let clash = '🔥Clash' + result.split("🔥Clash")[1].replace('https://', 'https://ghfast.top/https://');
        return `${v2.split(" https://ghfast")[0]}<tg-spoiler>${"https://ghfast" + v2.split(" https://ghfast")[1].split(".txt")[0] + ".txt"}</tg-spoiler>
${clash.split(" https://ghfast")[0]}<tg-spoiler>${"https://ghfast" + clash.split(" https://ghfast")[1]}</tg-spoiler>`;
    } catch (error) {
        $.log('获取隐藏内容时出错:' + error.message , 'error');
        throw error; // 抛出错误，以便在调用该函数时可以捕获
    }
}

// 异步函数：通过Telegram发送消息
async function send(message){
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = {
        'chat_id': chat_id,
        'text': message,
        'parse_mode': 'HTML' // 使用 'HTML' 解析模式
    };
    try {
        const response = await axios.post(url, payload);
        return response.data;
    } catch (error) {
        $.log('发送消息时出错:' + error.message , 'error');
        throw error; // 抛出错误，以便在调用该函数时可以捕获
    }
}

// 主函数：协调整个流程
async function main(){
    try {
        const { title, href } = await index();
        if (title && href) {
            // 获取隐藏内容
            const jidian = await get_jidian(href);

            // 将标题和内容包装为Telegram支持的HTML格式
            const htmlResult = `
                <b>${title.split('丨')[0]}</b>
                ${jidian}
            `;

            // 返回HTML格式的结果
            return htmlResult;
        } else {
            $.log('标题或链接缺失');
        }
    } catch (error) {
        $.log('主函数执行时出错:' + error.message , 'error');
    }
}

// 导出模块
module.exports = {
    main,
};

