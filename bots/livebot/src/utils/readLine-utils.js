const fs = require('fs').promises;
const path = require('path');
const util = require('util');

let showCount = 0;
let body = '当前命令如下:\n';

// 定义一个异步函数来递归地搜索文件夹
async function searchFiles($, dir, pattern) {
    try {
        // 读取文件夹内容
        const files = await fs.readdir(dir);

        // 遍历文件夹中的每个文件或子文件夹
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stats = await fs.stat(filePath);

            if (stats.isDirectory()) {
                // 如果是文件夹，递归搜索
                await searchFiles($, filePath, pattern);
            } else if (path.extname(filePath) === '.js') {
                // 如果是.js文件，读取并搜索匹配的行
                const content = await fs.readFile(filePath, 'utf8');
                // 使用正则表达式搜索匹配的行
                const lines = content.split('\n');
                let previousLine = ''; // 上一行数据
                lines.forEach((line, index) => {
                    if (pattern.test(line)) {
                        if (previousLine) {
                            const key = line.split("/")[2].replace("$","");
                            // console.log(`Match found in ${filePath}: Line${index + 1}: ${key}`);
                            const value = previousLine.replace("// ","");
                            // console.log(key + ':' + value);
                            body += `/${key}${value}\n`;
                        }
                        showCount += 1;
                    }
                    previousLine = line; // 更新上一行数据
                });
            }
        }
    } catch (err) {
        $.log(`Error occurred:${err.message}`, 'error');
    }
}

// 定义要搜索的正则表达式模式
const pattern = /^\s*\$\.bot\.onText\(/;

// 指定要搜索的文件夹路径
const dirPath = './src/register/';

module.exports = async function ($) {
    // 调用函数开始搜索
    await searchFiles($, dirPath, pattern);

    $.registers = body;
    $.log(`当前项目有${showCount}个命令。。。`);
};
