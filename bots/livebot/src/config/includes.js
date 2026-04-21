const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const EventEmitter = require('events');
const {Logger} = require("../utils/log-utils");
const fs = require('fs');

// 配置参数
let config = {};
let axiosInstance = null;
let botInstance = null;
let loggerInstance = null;

// ******************
// 基础方法
// ******************
const includes = {
    // 初始化传入config
    initConfig(configs) {
        config = configs;
        // 初始化 axios
        axiosInstance = axios.create({
            timeout: config.timeout || 30000
        });
        // 设置代理（如果配置了）
        const proxyConfig = config[config.environment]?.proxy;
        if (proxyConfig) {
            try {
                const url = new URL(proxyConfig);
                axiosInstance.defaults.proxy = {
                    host: url.hostname,
                    port: parseInt(url.port || (url.protocol === 'https:' ? 443 : 80))
                };
            } catch (e) {
                console.log('代理配置解析失败');
            }
        }
        // 初始化 Telegram bot
        botInstance = new TelegramBot(config[config.environment]?.token, {
            polling: false
        });
    },
    // 获取 axios 实例的 getter
    get axios() {
        if (!axiosInstance) {
            axiosInstance = axios.create({ timeout: 30000 });
        }
        return axiosInstance;
    },
    // 获取 bot 实例的 getter
    get bot() {
        if (!botInstance) {
            botInstance = new TelegramBot();
        }
        return botInstance;
    },
    isInt(value) {
        return !isNaN(value) && (function (x) {
            return (x | 0) === x;
        })(parseFloat(value))
    },
    sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    },
    parseTgUserNickname(user) {
        return ((user.first_name ? user.first_name : '')
            + ' '
            + (user.last_name ? user.last_name : '')).toString().trim();
    },
    defTgMsgForm: {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
            remove_keyboard: true
        }
    },
    log: function (message, level = 'info') {
        try {
            if (!config || !config[config.environment] || !config[config.environment].appName) {
                console.log(`[${level.toUpperCase()}] ${message}`);
                return;
            }
            if (!loggerInstance) {
                loggerInstance = Logger(config[config.environment].appName);
            }
            if (typeof loggerInstance[level] === 'function') {
                loggerInstance[level](message);
            } else {
                console.log(`[${level.toUpperCase()}] ${message}`);
            }
        } catch (error) {
            console.log(`[LOG_ERROR] ${message}`);
            console.error('日志记录失败:', error);
        }
    },
    // 包装 sendMessage 方法，捕获常见错误并记录发送消息
    sendMessageSafe: async function(chatId, text, options = {}) {
        try {
            // 发送消息
            const result = await this.bot.sendMessage(chatId, text, options);
            
            // 记录发送消息到数据库
            this.recordSendMessage(chatId, text, 'text');
            
            return result;
        } catch (error) {
            // 忽略 "chat not found" 和 "bot was blocked" 等常见错误
            if (error.code === 'ETELEGRAM' && error.response && error.response.body) {
                const errorBody = error.response.body;
                if (errorBody.description && (
                    errorBody.description.includes('chat not found') ||
                    errorBody.description.includes('bot was blocked') ||
                    errorBody.description.includes('user is deactivated') ||
                    errorBody.description.includes('Forbidden')
                )) {
                    // 静默忽略这些错误，只记录日志
                    this.log(`发送消息失败: ${errorBody.description} (chatId: ${chatId})`, 'warn');
                    return null;
                }
            }
            // 其他错误继续抛出
            throw error;
        }
    },
    
    // 记录发送消息到数据库
    recordSendMessage: async function(target, content, type) {
        try {
            // 检查是否有数据库连接
            if (this.dbm && this.dbm.addSendMessage) {
                await this.dbm.addSendMessage({
                    target: target.toString(),
                    content: content,
                    type: type
                });
            }
        } catch (error) {
            // 记录错误但不影响消息发送
            this.log(`记录发送消息失败: ${error.message}`, 'warn');
        }
    },
    
    // 设置数据库管理器
    setDBM: function(dbm) {
        this.dbm = dbm;
    },
    // getWebsiteSource(url) {
    //     return new Promise((resolve, reject) => {
    //         exec(`curl -s ${url}`, (error, stdout, stderr) => {
    //             if (error) {
    //                 reject(error);
    //             } else {
    //                 resolve(stdout);
    //             }
    //         });
    //     });
    // },
    unescapeUnicode(str) {
        return str.replace(/\\u([0-9a-fA-F]{4})/g, function (match, group1) {
            return String.fromCharCode(parseInt(group1, 16));
        });
    },
    template: {
        networkError: '网络错误，请重试。'
    },
    StringToString(text) {
        return text
            .replace(/~/g, "")
            .replace(/～/g, "")
            .replace(/_/g, "")
            .replace(/\*/g, "")
            .replace(/\[/g, "")
            .replace(/\]/g, "");
    },
    formatWatchMessagePartial(arr) {
        const noStreamerMessage = '\n无主播哦！';
        const liveEmoji = '🟢  ';
        const offlineEmoji = '🔴  ';
        const liveStatusPrefix = '  👉▶️  ';
        const freeEmoji = '🆓';
        const houseEmoji = '🏠️';
        const videoEmoji = '📹️ ';
        const adultEmoji = '🔞 ';
        const autoDeleteMessage = ' 本条消息30s后自动删除';
        let str = arr.length === 0 ? noStreamerMessage : '';
        arr.forEach((vtb, index) => {
            if (vtb.liveStatus === '1') {
                str += `${index + 1}:${liveEmoji} [${vtb.username}](${vtb.targetUrl}) ${this.formatDateTime(vtb.updatedAt)}\n`;
                str += `${liveStatusPrefix} [播放](${vtb.url})\n\n`;
            } else {
                str += `${index + 1}:${offlineEmoji} [${vtb.username}](${vtb.targetUrl}) ${this.formatDateTime(vtb.updatedAt)}\n\n`;
            }
        });
        return str + autoDeleteMessage;
    },
    formatDateTime(dateInput) {
        const date = new Date(dateInput);

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    },
    emitter: new EventEmitter(),
    formatTgKeyboard(arr) {
        let keyboard = [];
        let step = 0;
        for (let item of arr) {
            if (step == 0) {
                keyboard.push([item]);
                step = 1;
            } else {
                keyboard[keyboard.length - 1].push(item);
                step = 0;
            }
        }
        return keyboard;
    },
    // 防封ip的一个简单优化，插队排序
    sortVtbsByPriority(vtbs) {
        if (!Array.isArray(vtbs)) {
            return [];
        }
        
        // 使用Map来分类数据，比普通对象更高效
        const categorizedData = new Map();
        vtbs.forEach(item => {
            if (!categorizedData.has(item.site)) {
                categorizedData.set(item.site, []);
            }
            categorizedData.get(item.site).push(item);
        });

        const uniqueSites = Array.from(categorizedData.keys());
        const sortedData = [];
        let index = 0;

        while (sortedData.length < vtbs.length) {
            const site = uniqueSites[index % uniqueSites.length];
            const siteData = categorizedData.get(site);
            if (siteData && siteData.length > 0) {
                sortedData.push(siteData.shift());
            }
            index++;
        }

        return sortedData;
    },
    // 时间戳转时间 - 优化版本
    convertUnixTimestampToDate(unixTimestamp) {
        const tsStr = String(unixTimestamp).substring(0, 10);
        const timestamp = parseInt(tsStr, 10);
        
        if (isNaN(timestamp) || tsStr.length !== 10) {
            return unixTimestamp;
        }
        
        const date = new Date(timestamp * 1000);
        const pad = (num) => String(num).padStart(2, '0');
        
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    },
    isURL(str) {
        const urlPattern = /^(?:(?:https?|ftp):\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
        return urlPattern.test(str);
    },
    getRandomNumber(num) {
        return Math.floor(Math.random() * num) + 1;
    },
    getFileJSONData(filename) {
        try {
            const data = fs.readFileSync(filename, 'utf8');
            const jsonData = JSON.parse(data);
            if (Array.isArray(jsonData) && jsonData.length > 0) {
                return jsonData;
            } else {
                throw new Error('No data available in the file.');
            }
        } catch (error) {
            console.error('Error reading random data from JSON file:', error);
            return null;
        }
    },
    // pandalive一些19+
    pandaliveList: [],
    // 小红猫
    redliveList: [],
    redliveJson: [],
    fudaiDouyinList: {},
    // 保存的video消息
    videoMessages: [],
    // 保存的weimi消息
    weimiMessages: {},
    // 所有命令
    registers: '',
    // cg
    cgList: [],
    // 最近的消息
    recentMessages: []
};

module.exports = includes;
