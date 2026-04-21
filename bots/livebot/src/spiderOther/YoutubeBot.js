const urlParse = require('url-parse');
const nodeGlobalProxy = require("node-global-proxy").default;


// // 代理设置 -- 无法连接则使用代理
const proxy = 'http://127.0.0.1:10808'
if (proxy) {
    let proxyUrlObj = urlParse(proxy, true);
    if (proxyUrlObj.protocol != 'http:') {
        console.log('--proxy 只支持HTTP PROXY');
        process.exit(-1);
    }
    nodeGlobalProxy.setConfig(proxy);
    nodeGlobalProxy.start();
}


const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');




var FormData = require('form-data');
var data = new FormData();
data.append('url', 'https://www.youtube.com/watch?v=rElSKmlVwpE');
data.append('proxy', 'Random');

var config = {
    method: 'post',
    url: 'https://addyoutube.com/result?url=https://www.youtube.com/watch?v=rElSKmlVwpE&proxy=Random',
    data : data
};

const targetUrl = "https://www.youtube.com/watch?v=rElSKmlVwpE"; // 在这里设置目标URL
const host = 'https://addyoutube.com/result';

async function getURL() {
    try {
        // 向host发送一个POST请求，携带目标URL
        const response = await axios(config);

        // 使用cheerio加载HTML响应
        const $ = cheerio.load(response.data);
        console.log($.html())
        // 提取标题
        const title = $('h5').text();

        // 找到表格和行
        const table = $('.table-responsive table');
        const rows = table.find('tr');

        // 开始构建Markdown表格
        let result = `*${title}*\n`;
        result += "| 质量 | 大小 | URL |\n";
        result += "|:---- |:----:| ----:|\n";

        // 遍历行，从第二行开始（跳过表头）
        rows.slice(1).each((index, row) => {
            const cells = $(row).find('td');
            if (cells.length === 3) { // 确保有3个单元格
                const quality = $(cells[0]).text().trim();
                const size = $(cells[1]).text().trim();
                const url = $(cells[2]).find('a').attr('href');
                // 将行添加到Markdown表格
                result += `| ${quality} | ${size} | [查看链接](${url}) |\n`;
            }
        });

        // 保存结果
        saveMessageData(targetUrl, result);
        return result;

    } catch (error) {
        console.error("获取数据时出错:", error);
        return null;
    }
}

function saveMessageData(messageText, markdownTable) {
    // 获取当前时间
    const currentTime = new Date().toISOString();

    // 准备要保存的数据
    const dataToSave = {
        message_text: messageText,
        markdown_table: markdownTable,
        save_time: currentTime
    };

    // 定义保存文件的路径
    const filePath = path.join(__dirname, 'message_data.json');

    // 以新行的形式将数据追加到JSON文件
    fs.appendFile(filePath, JSON.stringify(dataToSave) + '\n', (err) => {
        if (err) {
            console.error("保存数据时出错:", err);
        } else {
            console.log("数据保存成功。");
        }
    });
}

// 调用函数执行
getURL();
