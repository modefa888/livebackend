// log-utils.js
const fs = require('fs');
const path = require('path');
const bunyan = require('bunyan');
const RotatingFileStream = require('bunyan-rotating-file-stream');

// 定义log文件夹路径
const logDir = path.resolve(__dirname, '../../log');

// 检查log文件夹是否存在，如果不存在则创建它
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 缓存旋转文件流实例
const rotatingFileStreams = {};

// 获取旋转文件流实例
function getRotatingFileStream(name, type) {
    const key = `${name}-${type}`;
    if (!rotatingFileStreams[key]) {
        rotatingFileStreams[key] = new RotatingFileStream({
            path: path.join(logDir, `${name}-${type}-%Y-%m-%d.log`),
            period: '1d',  // 每天轮转
            totalFiles: 30,  // 最多保留30天的日志文件
            rotateExisting: true,  // 如果文件已经存在，则轮转它
            threshold: '10m',  // 每10分钟检查一次是否需要轮转
            totalSize: '20m',  // 每个日志文件最大20MB
            gzip: true  // 对轮转的日志文件进行压缩
        });
    }
    return rotatingFileStreams[key];
}

// 创建一个bunyan日志记录器
function Logger(name) {
    return bunyan.createLogger({
        name: name,
        streams: [
            {
                level: 'info',
                stream: process.stdout  // 日志输出到控制台
            },
            {
                level: 'info',
                stream: getRotatingFileStream(name, 'info')  // 普通日志输出到旋转文件流
            },
            {
                level: 'error',
                stream: getRotatingFileStream(name, 'error')  // 错误日志输出到旋转文件流
            }
        ]
    });
}

module.exports = {
    Logger
};
