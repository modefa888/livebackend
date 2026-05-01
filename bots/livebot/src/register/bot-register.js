// =============================================================================================
// 模块导入
// =============================================================================================
const ytb = require('../spiderOther/youtubeAPI');
const douyinUtil = require("../utils/douyin-utils");
const bilibiliUtil = require("../utils/bilibili-utils");
const kuaishouUtil = require("../utils/kuaishou-utils");

// 自定义 stripIndent 函数
function stripIndent(str) {
    if (!str) return '';
    const lines = str.split('\n');
    const indentation = lines
        .filter(line => line.trim() !== '')
        .reduce((min, line) => {
            const match = line.match(/^\s+/);
            const indent = match ? match[0].length : 0;
            return min === null ? indent : Math.min(min, indent);
        }, null);

    if (indentation === null) return str;

    return lines
        .map(line => line.slice(indentation))
        .join('\n');
}

// =============================================================================================
// 全局变量声明
// =============================================================================================
let $ = null;
let dbm = null;
let apiHandlers = {};
let siteList = [];
let password;
let config;

// =============================================================================================
// 初始化与配置模块
// =============================================================================================
async function initialize(includes, databaseManager, api, configs) {
    // 基础初始化
    dbm = databaseManager;
    $ = includes;
    apiHandlers = api;
    siteList = Object.keys(apiHandlers);
    password = configs.password;
    config = configs;

    // 加载用户数据
    users = await dbm.getUser();

    // 加载速率限制配置
    try {
        rateLimit = parseInt(await dbm.getSettings('rateLimit')['value']);
    } catch (e) {
        rateLimit = configs.rateLimit;
    }

    // 注册事件监听
    registerEventListeners();

    // 发送启动通知
    await sendStartupNotification();

    $.log("公共模块加载完毕。。。");
}

function registerEventListeners() {
    // 用户更新事件
    $.emitter.on('updateUsers', async () => {
        users = await dbm.getUser();
        $.log('Reloaded Users.');
    });

    // 设置更新事件
    $.emitter.on('updateSettings', async () => {
        try {
            rateLimit = parseInt(await dbm.getSettings('rateLimit')['value']);
        } catch (e) {
            rateLimit = 1;
        }
        $.log('Reloaded Settings.');
    });
}

async function sendStartupNotification() {
    const messageService = $.services.message;
    const permissionService = $.services.permission;

    // 获取管理员列表
    const admins = await permissionService.getAdmins();

    if (admins.length > 0) {
        for (const admin of admins) {
            try {
                await messageService.sendText(admin.userId, '📢 🤖启动(重启)成功！');
            } catch (error) {
                $.log(`通知管理员 ${admin.userId} 失败: ${error.message}`, 'warn');
            }
        }
    }
}

// =============================================================================================
// 权限管理模块
// =============================================================================================
function checkPermission(handler) {
    return async (msg, match) => {
        const userId = msg.from.id;
        const chatId = msg.chat.id;

        // 检查用户权限
        const permissionService = $.services.permission;
        const messageService = $.services.message;

        // 检查用户是否存在
        const exists = await permissionService.userExists(userId);

        if (!exists) {
            // 新用户，处理加入请求
            await permissionService.handleNewUser(msg, messageService);
            if (msg.text === '/start') {
                await messageService.sendText(chatId, '使用方法在github上，给我点✴了吗');
            } else {
                await messageService.sendTemplate(chatId, 'noPermission');
            }
            return;
        }

        // 检查权限
        const hasPermission = await permissionService.checkPermission(userId, 1);
        if (!hasPermission) {
            await messageService.sendTemplate(chatId, 'noPermission');
            return;
        }

        // 检查频率限制
        const rateLimitResult = messageService.checkRateLimit(userId);
        if (!rateLimitResult.allowed) {
            await messageService.sendTemplate(chatId, 'rateLimit');
            return;
        }

        // 执行原始处理函数
        await handler(msg, match);
    };
}

// =============================================================================================
// 命令处理模块
// =============================================================================================
function registerCommands() {
    // 验证码/密码验证
    $.bot.onText(/^\/pwd (.+)/, async (msg, match) => {
        await handlePasswordCommand(msg, match);
    });

    // 启动命令
    $.bot.onText(/^\/start$/, checkPermission(async (msg) => {
        const messageService = $.services.message;
        const username = $.parseTgUserNickname(msg.from);
        await messageService.sendTemplate(msg.chat.id, 'welcome', username);
    }));

    // 帮助菜单
    $.bot.onText(/^\/help$/, checkPermission(async (msg) => {
        const messageService = $.services.message;
        const helpText = stripIndent(`
            ⚙️ 功能菜单 | Command Center

            🚀 /start — 激活机器人，开启智能助手之旅  
            ➕ /add <直播间地址> — 添加主播至您的实时监控列表  
            🎬 /demo — 示例演示，快速掌握添加方式  
            🗑️ /del — 删除指定主播（弹出式选择界面）  
            📡 /online — 查看当前正在直播的主播   
            📋 /list — 查看个人监控列表  
            📦 /get — 导出你所有订阅的主播信息  
            🔑 /login — 获取系统登录链接  

            💡 **智能解析系统 | Smart Parser** 
            支持多平台短视频解析与下载：  
            - 🎵 抖音（Douyin）  
            - 📺 哔哩哔哩（Bilibili）  

            只需发送分享链接，系统将自动识别并生成 **高清无水印下载地址**。  
            让创作与收藏更高效、更纯净。 
        `);
        await messageService.sendText(msg.chat.id, helpText);
    }));

    // 添加监控网站的demo
    $.bot.onText(/^\/demo$/, checkPermission(async (msg) => {
        const messageService = $.services.message;
        const demoText = stripIndent(`
            /add https://www.huya.com/281014
            /add https://www.douyu.com/1127
            /add https://live.douyin.com/252784349259
            /add https://live.bilibili.com/23680601
            /add https://play.afreecatv.com/wannabe33
            /add https://chaturbate.com/galantini
            /add https://www.pandalive.co.kr/live/play/yusol585
        `);
        await messageService.sendText(msg.chat.id, demoText);
    }));

    // 登录命令
    $.bot.onText(/^\/login$/, checkPermission(async msg => {
        const userId = msg.from.id;
        const username = $.parseTgUserNickname(msg.from);
        const chatId = msg.chat.id;
        const messageService = $.services.message;

        try {
            // 调用后端 API 获取登录 token
            $.log(`用户 ${username} (${userId}) 请求登录链接`);

            // 从 config 中获取环境配置
            const currentEnv = config.environment;
            const envConfig = config[currentEnv];

            const apiHost = envConfig.apiHost || 'http://localhost';
            const backendPort = envConfig.backendPort || '3002';
            const frontendPort = envConfig.frontendPort || '3003';

            const apiUrl = `${apiHost}:${backendPort}/api/auth/login/telegram`;

            const response = await $.axios.post(apiUrl, {
                userId,
                username
            });

            if (response.data && response.data.token) {
                const token = response.data.token;
                // 生成包含 token 的登录链接
                const frontendHost = apiHost.replace('localhost', '127.0.0.1');
                const loginUrl = frontendPort === '80'
                    ? `${frontendHost}/login?token=${token}`
                    : `${frontendHost}:${frontendPort}/login?token=${token}`;

                // 使用内联键盘按钮显示登录链接
                const keyboard = [
                    [
                        { text: "🔑 点击登录系统", url: loginUrl }
                    ]
                ];

                await messageService.sendWithKeyboard(chatId, stripIndent(`
🔑 登录链接已生成

点击下方按钮即可自动登录系统。

⚠️ 注意：此链接仅对您有效，请妥善保管，不要分享给他人。
`), keyboard);
            } else {
                $.log('生成登录链接失败：API 返回无效数据');
                await messageService.sendText(chatId, "生成登录链接失败，请重试。");
            }
        } catch (error) {
            $.log(`生成登录链接失败: ${error.message}`, 'error');
            await messageService.sendText(chatId, "生成登录链接失败，请重试。");
        }
    }));

    // 熊猫直播在线主播
    $.bot.onText(/^\/jk$/, checkPermission(async (msg) => {
        await handlePandaLiveCommand(msg);
    }));

    // 小红直播
    $.bot.onText(/^\/redlive$/, checkPermission(async (msg) => {
        await handleRedLiveCommand(msg);
    }));

    // 查看在线主播
    $.bot.onText(/^\/online(?:\s*(.*))?$/, checkPermission(async (msg, match) => {
        await handleOnlineCommand(msg, match);
    }));

    // 查看主播列表，预删除功能
    $.bot.onText(/^\/del$/, checkPermission(async msg => {
        await handleDelCommand(msg);
    }));

    // 删除主播（通过ID）
    $.bot.onText(/^\/del (.+)/, checkPermission((msg, match) => {
        handleDelByIdCommand(msg, match);
    }));

    // 查看主播列表
    $.bot.onText(/^\/list(?:\s+.*)?$/, checkPermission(async (msg, match) => {
        await handleListCommand(msg, match);
    }));

    // 添加一个主播
    $.bot.onText(/^\/add (.+)$/, checkPermission(async (msg, match) => {
        await handleAddCommand(msg, match);
    }));

    // 抖音帮助菜单
    $.bot.onText(/^\/hdy$/, checkPermission(msg => {
        $.bot.sendMessage(msg.chat.id, stripIndent(`
            命令列表：
            
            /addy \`<直播间ID>\` - 添加新主播至监控列表。
            /addfd \`<直播间ID>\` - 添加福袋至监控列表。
            /dy - 查看抖音在线主播。
        `), $.defTgMsgForm);
    }));

    // 添加一个抖音主播
    $.bot.onText(/^\/addy (.+)$/, checkPermission(async (msg, match) => {
        await handleAddDouyinCommand(msg, match);
    }));

    // 添加福袋
    $.bot.onText(/^\/addfd (.+)$/, checkPermission(async (msg, match) => {
        await handleAddLuckyBagCommand(msg, match);
    }));

    // 频道以及群组添加主播
    $.bot.onText(/^\/addc (.+) (.+)$/, checkPermission(async (msg, match) => {
        await handleAddToChannelCommand(msg, match);
    }));

    // 获取用户的喜欢列表
    $.bot.onText(/^\/get$/, checkPermission(async msg => {
        await handleGetCommand(msg);
    }));

    // 一键设置用户喜欢列表
    $.bot.onText(/^\/adds (.+)/, checkPermission(async (msg, match) => {
        await handleAddsCommand(msg, match);
    }));

    // 福袋列表
    $.bot.onText(/^\/fudai$/, checkPermission(async (msg) => {
        await handleLuckyBagListCommand(msg);
    }));
}

// =============================================================================================
// 命令处理实现
// =============================================================================================
async function handlePasswordCommand(msg, match) {
    const pwd = match[1].toString().trim();
    const userId = msg.from.id;
    const username = $.parseTgUserNickname(msg.from);
    const permissionService = $.services.permission;
    const messageService = $.services.message;

    // 验证普通用户密码
    if (pwd === password) {
        const currentUser = await permissionService.getUserById(userId);
        if (!currentUser) {
            const addFlag = await dbm.addUser(userId, userId, 1, username);
            if (addFlag) {
                await messageService.sendText(msg.chat.id, `🎉 恭喜${username} 用户，您已升级啦！`);
            } else {
                await messageService.sendText(msg.chat.id, `${username} 用户，抱歉升级失败，请联系管理员！`);
            }
        } else {
            await messageService.sendText(msg.chat.id, '您已经是白名单用户了。');
        }
    }
    // 验证管理员密码
    else if (pwd === config.adminToken) {
        const currentUser = await permissionService.getUserById(userId);
        if (!currentUser || currentUser.permissionLevel < 2) {
            const addFlag = await dbm.addUser(userId, userId, 2, username);
            if (addFlag) {
                await messageService.sendText(msg.chat.id, `🎉 恭喜${username} 用户，您已成为超级管理员啦！`);
                // 添加初始数据库数据
                const initDataResult = await dbm.addInitData(config, msg.chat.id);
                if (initDataResult) {
                    await messageService.sendText(msg.chat.id, `🎉 恭喜${username} 用户，初始化数据成功！`);
                } else {
                    await messageService.sendText(msg.chat.id, `${username} 用户，初始化数据失败！`);
                }
            } else {
                await messageService.sendText(msg.chat.id, `${username} 用户，加入管理员失败！`);
            }
        } else {
            await messageService.sendText(msg.chat.id, '您已经是超级管理员了。');
        }
    } else {
        await messageService.sendText(msg.chat.id, '你还想找捷径，门给你堵死！');
    }
}

async function handlePandaLiveCommand(msg) {
    const messageService = $.services.message;

    let arr = $.pandaliveList;
    if (!arr.length) {
        await messageService.sendText(msg.chat.id, '暂无主播哦。');
        return;
    }

    arr = arr.map((item, index) => {
        return index === 0
            ? item.username.split('|')[1].replace('主播列表手动', '')
            : "❤️  " + item.username;
    });

    arr.push('取消');
    let keyboard = $.formatTgKeyboard(arr);
    await messageService.sendText(msg.chat.id,
        `已为您搜索到${arr.length - 1}个pandalive。\n请在弹出的键盘中选择需要查看的主播。`,
        { reply_markup: { keyboard: keyboard } }
    );
}

async function handleRedLiveCommand(msg) {
    const messageService = $.services.message;

    let arr = $.redliveList;
    if (!arr.length) {
        await messageService.sendText(msg.chat.id, '暂无平台哦！稍后试试。');
        return;
    }

    arr = arr.map(item => `📺️  ${item.title}`);
    arr.push('取消');
    let keyboard = $.formatTgKeyboard(arr);
    await messageService.sendText(msg.chat.id,
        `已为您搜索到${arr.length - 1}个redlive。\n请在弹出的键盘中选择需要查看的平台。`,
        { reply_markup: { keyboard: keyboard } }
    );
}

async function handleOnlineCommand(msg, match) {
    const typ = match[1] || 0;
    let watchArr = await dbm.getWatchByChatid(msg.chat.id);
    let arr = [];

    if (!typ) {
        arr = watchArr.filter(vtb => vtb.liveStatus === "1");
    } else {
        arr = watchArr.filter(vtb => vtb.liveStatus === "1" && vtb.site === "live.douyin.com");
    }

    if (!arr.length) {
        $.bot.sendMessage(msg.chat.id, '当前没有在线主播。', $.defTgMsgForm);
        return;
    }

    arr = arr.map(vtb => {
        let baseName = vtb.site === 'www.pandalive.co.kr' ? `${vtb.username}=${vtb.mid}` : vtb.username;
        return "🟢  " + baseName;
    });

    arr.push('取消');
    let keyboard = $.formatTgKeyboard(arr);
    $.bot.sendMessage(msg.chat.id,
        `已为您搜索到${arr.length - 1}个在线主播。\n请在弹出的键盘中选择需要查看的主播。`,
        { reply_markup: { keyboard: keyboard } }
    );
}

async function handleDelCommand(msg) {
    let watches = await dbm.getWatchByChatid(msg.chat.id);
    if (!watches.length) {
        $.bot.sendMessage(msg.chat.id, '您的监控列表为空。', $.defTgMsgForm);
        return;
    }
    let plainWatchArr = watches.map(item => '❌  ' + item.username);
    plainWatchArr.push('取消');
    let keyboard = $.formatTgKeyboard(plainWatchArr);

    $.bot.sendMessage(msg.chat.id, '请在弹出的键盘中选择需要删除的主播。', {
        reply_markup: { keyboard: keyboard }
    });
}

function handleDelByIdCommand(msg, match) {
    let mid = match[1].toString().trim();
    if (!$.isInt(mid)) {
        $.bot.sendMessage(msg.chat.id, '请输入正确的ID。', $.defTgMsgForm);
        return;
    }

    if (!dbm.existsWatch(msg.chat.id, mid)) {
        $.bot.sendMessage(msg.chat.id, '该主播不在您的监控列表中。', $.defTgMsgForm);
        return;
    }

    let vtb = dbm.getVtbByMid(mid);
    dbm.delWatch(msg.chat.id, mid);
    $.bot.sendMessage(msg.chat.id, `已删除主播 \`${vtb.username}\`。`, $.defTgMsgForm);
}

async function handleListCommand(msg, match) {
    const typ = match[1] || 0;
    let watchArr = await dbm.getWatchByChatid(msg.chat.id);
    const websites = watchArr.map(item => item.site);

    // 创建site字典
    let siteList = {};
    for (let site of websites) {
        siteList[site] = (siteList[site] || 0) + 1;
    }

    const keyboard = [];
    for (let website in siteList) {
        if (Object.prototype.hasOwnProperty.call(siteList, website)) {
            keyboard.push([{
                text: `${config.siteKeyValue[website]} -- ${siteList[website]}`,
                callback_data: 'list_' + website
            }]);
        }
    }

    const replyMarkup = { inline_keyboard: keyboard };
    let message = '您的监控列表：\n\n';

    if (watchArr.length > 0) {
        $.bot.sendMessage(msg.chat.id, message, { reply_markup: replyMarkup });
    } else {
        $.bot.sendMessage(msg.chat.id, '你还没有关注任何主播哦！');
    }
}

async function handleAddCommand(msg, match) {
    // 检查监视数量限制
    const viewCount = await dbm.getWatchByCount(msg.chat.id);
    if (viewCount['count'] >= 100) {
        const permissionService = $.services.permission;
        const messageService = $.services.message;
        const isAdmin = await permissionService.isAdmin(msg.chat.id);
        if (!isAdmin) {
            await messageService.sendText(msg.chat.id, '客官，臣妾给不了啦！', $.defTgMsgForm);
            return;
        }
    }

    let param = match[1].toString().trim();
    let isSite = $.isURL(param);

    if (!isSite) {
        $.bot.sendMessage(msg.chat.id, '请输入正确的网址。', $.defTgMsgForm);
        return;
    }

    _addWatchByMid(msg, param);
}

async function handleAddDouyinCommand(msg, match) {
    let param = match[1].toString().trim();
    let isSite = $.isURL(param);

    if (isSite) {
        $.bot.sendMessage(msg.chat.id, '请输入正确的主播id号。', $.defTgMsgForm);
        return;
    }

    let url = 'https://live.douyin.com/' + param;
    _addWatchByMid(msg, url);
}

async function handleAddLuckyBagCommand(msg, match) {
    let param = match[1].toString().trim();
    let isSite = $.isURL(param);

    if (!isSite) {
        $.bot.sendMessage(msg.chat.id, '请输入正确的主播房间地址(获取方式直接发送分享地址获取)。', $.defTgMsgForm);
        return;
    }

    const roomID = param.split('/')[3];
    let url = 'https://fd.live.douyin.com/fudai_' + roomID;
    _addWatchByMid(msg, url);
}

async function handleAddToChannelCommand(msg, match) {
    // 必须超级管理员才可以操作
    const permissionService = $.services.permission;
    const messageService = $.services.message;
    const isAdmin = await permissionService.isAdmin(msg.chat.id);
    if (!isAdmin) {
        await messageService.sendText(msg.chat.id, '客官，臣妾给不了啦！', $.defTgMsgForm);
        return;
    }

    let param = match[1].toString().trim();
    let isSite = $.isURL(param);

    if (!isSite) {
        $.bot.sendMessage(msg.chat.id, '请输入正确的网址。频道', $.defTgMsgForm);
        return;
    }

    let channleID = parseInt(match[2]);
    if (channleID > 0) {
        $.bot.sendMessage(msg.chat.id, '对不起当前不是群或频道id');
        return;
    }

    _addWatchByMid(msg, param, channleID);
}

async function handleGetCommand(msg) {
    let watches = await dbm.getWatchByChatid(msg.chat.id);
    if (!watches.length) {
        $.bot.sendMessage(msg.chat.id, '您的监控列表为空。', $.defTgMsgForm);
        return;
    }

    // 生成完整的链接数组
    let plainWatchArr = watches.map(item => {
        let baseUrl = item.site !== 'www.pandalive.co.kr' ? item.site : (item.site + '/live/play');
        return `https://${baseUrl}/${item.mid}`;
    });

    // 每条消息最多包含10个链接（可根据需要调整）
    const batchSize = 50;
    const totalBatches = Math.ceil(plainWatchArr.length / batchSize);

    // 分批次发送消息
    for (let i = 0; i < totalBatches; i++) {
        // 计算当前批次的起始和结束索引
        const startIndex = i * batchSize;
        const endIndex = Math.min(startIndex + batchSize, plainWatchArr.length);
        const currentBatch = plainWatchArr.slice(startIndex, endIndex);

        // 拼接当前批次的消息内容
        let batchMessage = currentBatch.join('#');
        // 添加批次序号提示（如"第1/3部分"）
        let message = `获取你喜欢的主播列表（第${i + 1}/${totalBatches}部分）：\n\`${batchMessage}\``;

        // 发送当前批次消息（等待发送完成再处理下一批，保证顺序）
        await $.bot.sendMessage(msg.chat.id, message, $.defTgMsgForm);

        // 每批消息之间添加短暂延迟，避免触发频率限制
        if (i < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}

async function handleAddsCommand(msg, match) {
    let param = match[1].toString().trim();
    let plainWatchArr = param.split("#");
    let count = 0;

    for (let item of plainWatchArr) {
        let flag = await _addWatchByMid(msg, item);
        if (flag) {
            count++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    $.bot.sendMessage(msg.chat.id, `添加*${count}*个主播！`, $.defTgMsgForm);
}

async function handleLuckyBagListCommand(msg) {
    let watchArr = await dbm.getWatchByChatid(msg.chat.id);
    let arr = watchArr.filter(vtb => vtb.liveStatus !== "0" && vtb.site === 'fd.live.douyin.com');

    if (!arr.length) {
        $.bot.sendMessage(msg.chat.id, '当前没有🧧！', $.defTgMsgForm);
        return;
    }

    arr = arr.map(vtb => `🧧  ${vtb.username}`);
    arr.push('取消');
    let keyboard = $.formatTgKeyboard(arr);

    $.bot.sendMessage(msg.chat.id,
        `已为您搜索到${arr.length - 1}个🧧。\n请在弹出的键盘中选择需要查看的🧧。`,
        { reply_markup: { keyboard: keyboard } }
    );
}

// =============================================================================================
// 消息处理模块
// =============================================================================================
function registerMessageHandlers() {
    $.bot.on('text', async msg => {
        // 存储消息
        storeMessage(msg);
        await handleIncomingText(msg);
    });

    // 监听其他类型的消息
    $.bot.on('photo', async msg => {
        storeMessage(msg);
    });

    $.bot.on('video', async msg => {
        storeMessage(msg);
    });

    $.bot.on('audio', async msg => {
        storeMessage(msg);
    });

    $.bot.on('document', async msg => {
        storeMessage(msg);
    });

    $.bot.on('sticker', async msg => {
        storeMessage(msg);
    });

    $.bot.on('animation', async msg => {
        storeMessage(msg);
    });

    $.bot.on('voice', async msg => {
        storeMessage(msg);
    });

    $.bot.on('contact', async msg => {
        storeMessage(msg);
    });

    $.bot.on('location', async msg => {
        storeMessage(msg);
    });

    $.bot.on('venue', async msg => {
        storeMessage(msg);
    });

    $.bot.on('poll', async msg => {
        storeMessage(msg);
    });

    $.bot.on('dice', async msg => {
        storeMessage(msg);
    });
}

// 存储消息到内存
function storeMessage(msg) {
    // 只存储最近100条消息
    if ($.recentMessages.length >= 100) {
        $.recentMessages.shift();
    }

    // 存储消息
    $.recentMessages.push({
        message_id: msg.message_id,
        from: msg.from,
        chat: msg.chat,
        date: msg.date,
        text: msg.text,
        caption: msg.caption,
        photo: msg.photo,
        video: msg.video,
        audio: msg.audio,
        document: msg.document,
        sticker: msg.sticker,
        animation: msg.animation,
        voice: msg.voice,
        contact: msg.contact,
        location: msg.location,
        venue: msg.venue,
        poll: msg.poll,
        dice: msg.dice
    });
}

async function handleIncomingText(msg) {
    const msgText = msg.text.toString();

    // 处理抖音链接
    if (douyinUtil.extractDouyinUrl(msgText) !== 0) {
        await handleDouyinUrl(msg, msgText);
        return;
    }

    // 处理快手链接
    if (kuaishouUtil.extractKuaishouUrl(msgText) !== 0) {
        await handleKuaishouUrl(msg, msgText);
        return;
    }

    // 处理bilibili链接
    if (bilibiliUtil.extractBiliBiliUrl(msgText) !== 0) {
        await handleBilibiliUrl(msg, msgText);
        return;
    }

    // 处理删除主播命令
    if (msgText.startsWith('❌  ')) {
        await handleDeleteByUsername(msg, msgText);
        return;
    }

    // 处理取消操作
    if (msgText === '取消') {
        $.bot.sendMessage(msg.chat.id, '取消当前操作。', $.defTgMsgForm);
        return;
    }

    // 处理在线主播查看
    if (msgText.startsWith('🟢  ')) {
        await handleViewLiveStreamer(msg, msgText);
        return;
    }

    // 处理福袋查看
    if (msgText.startsWith('🧧  ')) {
        await handleViewLuckyBag(msg, msgText);
        return;
    }

    // 处理熊猫主播查看
    if (msgText.startsWith('❤️  ')) {
        await handleViewPandaLiveStreamer(msg, msgText);
        return;
    }

    // 处理小红直播平台查看
    if (msgText.startsWith('📺️  ')) {
        await handleViewRedLivePlatform(msg, msgText);
        return;
    }

    // 处理19+内容查看
    if (msgText.startsWith('🔞️  ')) {
        await handleViewAdultContent(msg, msgText);
        return;
    }

    // 处理批量删除
    if (msgText.startsWith('❌❤  ')) {
        await handleBulkDelete(msg, msgText);
        return;
    }

    // 处理机器人加入群或频道
    if (msgText.startsWith('/start@')) {
        await handleBotJoin(msg);
        return;
    }

    // 处理特定网站链接
    if (isSupportedWebsite(msgText) && !isYoutubeUrl(msgText)) {
        await handleSupportedWebsiteLink(msg, msgText);
        return;
    }

    // 检查是否是链接但不支持
    const isUrl = msgText.startsWith('http://') || msgText.startsWith('https://');
    if (isUrl && !isYoutubeUrl(msgText)) {
        const site = msgText.split("/")[2];
        $.bot.sendMessage(msg.chat.id,
            `❌ 抱歉，当前不支持该网站：\`${site}\`\n\n请使用支持的直播平台链接！`,
            $.defTgMsgForm
        );
        return;
    }

    // 处理YouTube链接
    if (isYoutubeUrl(msgText)) {
        ytb.sendDetail(msg.chat.id, msgText);
        return;
    }

    // 向管理员转发所有消息
    await forwardToAdmins(msg);
}

function isSupportedWebsite(url) {
    const site = url.split("/")[2];
    return siteList.includes(site);
}

function isYoutubeUrl(url) {
    return url.split("/")[2] === 'www.youtube.com';
}

async function handleDouyinUrl(msg, msgText) {
    const shareUrl = douyinUtil.extractDouyinUrl(msgText);
    const resultShare = await douyinUtil.getShareUser(shareUrl);

    if (resultShare.webRid !== null) {
        const roomID = resultShare.webRid;
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: "添加直播间", callback_data: `addLive_https://live.douyin.com/${roomID}_${msg.chat.id}` },
                    { text: "添加福袋", callback_data: `addLucky_${roomID}_${msg.chat.id}` },
                ]
            ]
        };

        $.bot.sendMessage(msg.chat.id,
            `抖音解析完成《 \`${resultShare.title}\` 》\n 网页地址：\`https://live.douyin.com/${roomID}\``,
            { ...$.defTgMsgForm, reply_markup: inlineKeyboard }
        );
    } else {
        $.bot.sendMessage(msg.chat.id, '抖音解析完成!', {
            ...$.defTgMsgForm,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "获取视频", callback_data: `getVideo_${shareUrl.replace('_', '999')}_${msg.chat.id}` },
                        { text: "获取动图", url: "https://dy.yizhifa.cyou" },
                    ]
                ]
            }
        });
    }
}

async function handleKuaishouUrl(msg, msgText) {
    const shareUrl = kuaishouUtil.extractKuaishouUrl(msgText);
    if (!shareUrl) {
        return $.bot.sendMessage(msg.chat.id, '未找到有效的快手链接', $.defTgMsgForm);
    }

    const record = {
        share_url: shareUrl,
        parse_url: null,
        parse_status: 0,
        parse_message: '',
        content_type: null,
        video_url: null,
        image_count: 0,
        image_urls: null,
        title: null,
        chat_id: msg.chat.id,
        send_status: 0,
        send_message: '',
        message_ids: null,
        group_send_results: null
    };

    try {
        $.bot.sendMessage(msg.chat.id, '⏳ 快手解析中...', $.defTgMsgForm);

        const result = await kuaishouUtil.parseKuaishouUrl(shareUrl);
        record.parse_url = shareUrl;

        if (!result || result.code !== 200) {
            record.parse_status = 2;
            record.parse_message = `解析失败: ${result?.msg || '未知错误'}`;
            record.send_status = 2;
            record.send_message = record.parse_message;
            await $.bot.sendMessage(msg.chat.id, `❌ 解析失败: ${result?.msg || '未知错误'}`, $.defTgMsgForm);
            return;
        }

        const { data } = result;
        record.parse_status = 1;
        record.parse_message = '解析成功';
        record.title = data.title || '快手内容';

        const messageIds = [];

        if (data.url) {
            record.content_type = 'video';
            record.video_url = data.url;
            const durationStr = data.durationFormat ? `⏱ ${data.durationFormat}` : '';
            const msgContent = `🎬 快手解析完成\n\n📺 作者: ${data.author || '未知'}\n📝 标题: ${data.title || '无'}\n\n👁️ 阅读: ${data.views?.toLocaleString() || 0} | 👍 点赞: ${data.likes?.toLocaleString() || 0} | 💬 评论: ${data.comments?.toLocaleString() || 0}\n\n${durationStr}`;

            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        { text: "📹 查看视频", url: data.url }
                    ]
                ]
            };

            if (data.url) {
                try {
                    const sentMessage = await $.bot.sendVideo(msg.chat.id, data.url, {
                        ...$.defTgMsgForm,
                        caption: msgContent,
                        reply_markup: inlineKeyboard
                    });
                    messageIds.push(sentMessage.message_id);
                    record.send_status = 1;
                    record.send_message = '视频发送成功';
                } catch (videoError) {
                    console.error('[kuaishou] Send video failed, try photo:', videoError.message);
                    if (data.cover) {
                        const sentPhoto = await $.bot.sendPhoto(msg.chat.id, data.cover, {
                            ...$.defTgMsgForm,
                            caption: msgContent,
                            reply_markup: inlineKeyboard
                        });
                        messageIds.push(sentPhoto.message_id);
                        record.send_status = 1;
                        record.send_message = '视频无法发送，已发送封面';
                    } else {
                        const sentMsg = await $.bot.sendMessage(msg.chat.id, msgContent, { ...$.defTgMsgForm, reply_markup: inlineKeyboard });
                        messageIds.push(sentMsg.message_id);
                        record.send_status = 1;
                        record.send_message = '视频无法发送，已发送文字';
                    }
                }
            } else if (data.cover) {
                const sentPhoto = await $.bot.sendPhoto(msg.chat.id, data.cover, {
                    ...$.defTgMsgForm,
                    caption: msgContent,
                    reply_markup: inlineKeyboard
                });
                messageIds.push(sentPhoto.message_id);
                record.send_status = 1;
                record.send_message = '视频地址为空，已发送封面';
            } else {
                const sentMsg = await $.bot.sendMessage(msg.chat.id, msgContent, { ...$.defTgMsgForm, reply_markup: inlineKeyboard });
                messageIds.push(sentMsg.message_id);
                record.send_status = 1;
                record.send_message = '视频和封面都为空，已发送文字';
            }
        } else if (result.image && result.image.length > 0) {
            record.content_type = 'image';
            record.image_count = result.image.length;
            record.image_urls = JSON.stringify(result.image);
            
            const imageCount = data.count || result.image.length || 0;
            const allImages = result.image;
            const batchSize = 10;
            const totalBatches = Math.ceil(allImages.length / batchSize);
            let hasError = false;

            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const startNum = batchIndex * batchSize + 1;
                const endNum = Math.min((batchIndex + 1) * batchSize, allImages.length);
                const imageUrls = allImages.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);

                const batchInfo = `📊 第 ${batchIndex + 1}/${totalBatches} 组 (${startNum}-${endNum}/${imageCount})`;
                const msgContent = `🖼️ 快手图集解析完成\n\n📺 作者: ${data.author || '未知'}\n📝 标题: ${data.title || '无'}\n\n${batchInfo}\n\n👁️ 阅读: ${data.views?.toLocaleString() || 0} | 👍 点赞: ${data.likes?.toLocaleString() || 0}`;

                try {
                    const mediaGroup = imageUrls.map((imgUrl, index) => ({
                        type: 'photo',
                        media: imgUrl,
                        caption: index === 0 ? msgContent : undefined
                    }));

                    const sentMessages = await $.bot.sendMediaGroup(msg.chat.id, mediaGroup, $.defTgMsgForm);
                    messageIds.push(...sentMessages.map(m => m.message_id));
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (mediaError) {
                    console.error('[kuaishou] SendMediaGroup error, try single:', mediaError.message);
                    hasError = true;
                    if (batchIndex === 0) {
                        const sentMsg = await $.bot.sendMessage(msg.chat.id, msgContent, $.defTgMsgForm);
                        messageIds.push(sentMsg.message_id);
                    }
                    for (const imgUrl of imageUrls) {
                        try {
                            const sentPhoto = await $.bot.sendPhoto(msg.chat.id, imgUrl, $.defTgMsgForm);
                            messageIds.push(sentPhoto.message_id);
                            await new Promise(resolve => setTimeout(resolve, 500));
                        } catch (imgError) {
                            console.error('[kuaishou] Send image error:', imgError.message);
                        }
                    }
                }
            }

            record.send_status = hasError ? 2 : 1;
            record.send_message = hasError ? '部分图片发送失败' : `已完成发送，共 ${imageCount} 张图片`;

            if (result.music?.musicBgm) {
                const musicKeyboard = {
                    inline_keyboard: [
                        [
                            { text: "🎵 查看背景音乐", url: result.music.musicBgm }
                        ]
                    ]
                };
                const sentMsg = await $.bot.sendMessage(msg.chat.id, `🎵 背景音乐: ${result.music.musicName || '未知'}`, { ...$.defTgMsgForm, reply_markup: musicKeyboard });
                messageIds.push(sentMsg.message_id);
            }
        } else {
            record.parse_status = 2;
            record.parse_message = '未找到视频或图集数据';
            record.send_status = 2;
            record.send_message = record.parse_message;
            await $.bot.sendMessage(msg.chat.id, '❌ 未找到视频或图集数据', $.defTgMsgForm);
        }

        record.message_ids = JSON.stringify(messageIds);
    } catch (error) {
        console.error('[kuaishou] Handle error:', error.message);
        record.parse_status = 2;
        record.parse_message = error.message;
        record.send_status = 2;
        record.send_message = error.message;
        await $.bot.sendMessage(msg.chat.id, `❌ 解析出错: ${error.message}`, $.defTgMsgForm);
    } finally {
        await saveParseRecord(record);
    }
}

async function handleBilibiliUrl(msg, msgText) {
    const shareUrl = bilibiliUtil.extractBiliBiliUrl(msgText);
    if (!shareUrl) {
        return $.bot.sendMessage(msg.chat.id, '未找到有效的B站链接', $.defTgMsgForm);
    }

    const record = {
        share_url: shareUrl,
        parse_url: null,
        parse_status: 0,
        parse_message: '',
        content_type: null,
        video_url: null,
        image_count: 0,
        image_urls: null,
        title: null,
        chat_id: msg.chat.id,
        send_status: 0,
        send_message: '',
        message_ids: null,
        group_send_results: null
    };

    try {
        const resultShare = await bilibiliUtil.fetchBiliBiliInfo(shareUrl);
        record.parse_url = shareUrl;

        if (resultShare.code === 200 && resultShare.data && resultShare.data.length > 0) {
            // 解析成功且有视频数据
            const videoData = resultShare.data[0];
            const videoUrl = videoData.video_url;
            const title = resultShare.title || 'B站视频';
            const userName = resultShare.user?.name || '未知UP主';

            record.parse_status = 1;
            record.parse_message = '解析成功';
            record.content_type = 'video';
            record.video_url = videoUrl;
            record.title = resultShare.title || 'B站视频';

            // 构建视频说明文字（添加跳转链接）
            let caption = `📌 B站视频解析成功\n`;
            caption += `标题：\`${title}\`\n`;
            caption += `UP主：\`${userName}\`\n`;
            caption += `时长：\`${videoData.durationFormat || '未知'}\`\n`;
            caption += `支持画质：\`${videoData.accept.join(', ')}\`\n`;
            // 添加可点击的视频地址链接（Markdown格式）
            caption += `视频地址：[点击观看](${videoUrl})`;

            try {
                // 合并发送：视频 + 封面 + 说明（一条消息）
                const sentMessage = await $.bot.sendVideo(msg.chat.id, videoUrl, {
                    caption: caption,
                    parse_mode: 'Markdown',
                    thumb: resultShare.imgurl || undefined,
                    caption_entities: []
                });
                record.message_ids = JSON.stringify([sentMessage.message_id]);
                record.send_status = 1;
                record.send_message = '视频发送成功';

                // 发送到B站解析群组
                const groupResults = await sendToGroups('video', videoUrl, null, caption, resultShare.title, 'biliJxGroups');
                if (groupResults.length > 0) {
                    record.group_send_results = JSON.stringify(groupResults);
                }

            } catch (videoError) {
                $.log(`发送视频失败: ${videoError.message}`, 'error');
                record.send_status = 2;
                record.send_message = `发送失败: ${videoError.message}`;

                // 降级方案：分开发送封面和说明
                const messageIds = [];
                if (resultShare.imgurl) {
                    const sentPhoto = await $.bot.sendPhoto(msg.chat.id, resultShare.imgurl, {
                        caption: caption,
                        parse_mode: 'Markdown'
                    });
                    messageIds.push(sentPhoto.message_id);
                } else {
                    const sentMsg = await $.bot.sendMessage(msg.chat.id, caption, {
                        ...$.defTgMsgForm,
                        parse_mode: 'Markdown'
                    });
                    messageIds.push(sentMsg.message_id);
                }
                // 提供观看链接（冗余保障）
                const linkMsg = await $.bot.sendMessage(msg.chat.id,
                    `视频无法直接发送，可通过链接观看：${videoUrl}`,
                    $.defTgMsgForm
                );
                messageIds.push(linkMsg.message_id);
                record.message_ids = JSON.stringify(messageIds);
            }
        } else {
            // 解析成功但无视频数据
            record.parse_status = 2;
            record.parse_message = resultShare.msg || '未获取到视频数据';
            record.send_status = 2;
            record.send_message = record.parse_message;

            await $.bot.sendMessage(msg.chat.id,
                `解析结果：${resultShare.msg || '未获取到视频数据'}\n` +
                `${resultShare.text?.msg || ''}`,
                $.defTgMsgForm
            );
        }
    } catch (error) {
        $.log(`处理B站链接失败: ${error.message}`, 'error');
        record.parse_status = 2;
        record.parse_message = error.message;
        record.send_status = 2;
        record.send_message = error.message;
    } finally {
        await saveParseRecord(record);
    }
}

async function handleDeleteByUsername(msg, msgText) {
    let username = msgText.slice(3).trim();
    let vtb = await dbm.getVtbByUsername(username);

    if (!vtb) {
        $.bot.sendMessage(msg.chat.id, `不存在主播 \`${username}\``, $.defTgMsgForm);
        return;
    }

    const existsWatch = await dbm.existsWatch(msg.chat.id, vtb.mid);
    if (!existsWatch) {
        $.bot.sendMessage(msg.chat.id, '该主播不在您的监控列表中。', $.defTgMsgForm);
        return;
    }

    await dbm.delWatch(msg.chat.id, vtb.mid);
    $.bot.sendMessage(msg.chat.id, `已删除主播 \`${vtb.username}\`。`, $.defTgMsgForm);
}

async function handleViewLiveStreamer(msg, msgText) {
    let username = msgText.slice(3).trim().split('=')[0];
    let watchArr = await dbm.getWatchByChatid(msg.chat.id);
    let vtbList = watchArr.filter(vtb => vtb.username === username);

    if (!vtbList.length) {
        $.bot.sendMessage(msg.chat.id, `不存在主播 \`${username}\``, $.defTgMsgForm);
        return;
    }

    WatchByMidChats(msg, vtbList[0]);
}

async function handleViewLuckyBag(msg, msgText) {
    let username = msgText.slice(3).trim().split('=')[0];
    let watchArr = await dbm.getWatchByChatid(msg.chat.id);
    let vtbList = watchArr.filter(vtb => vtb.username === username && vtb.site === 'fd.live.douyin.com');

    if (!vtbList.length) {
        await $.bot.sendMessage(msg.chat.id, `当前🧧不存在！\`${username}\``, $.defTgMsgForm);
        return;
    }

    WatchByMidChats(msg, vtbList[0]);
}

async function handleViewPandaLiveStreamer(msg, msgText) {
    let username = msgText.slice(3).trim();
    let pandaliveList = $.pandaliveList.filter(item => item.username === username);

    if (!pandaliveList.length) {
        $.bot.sendMessage(msg.chat.id, `不存在主播 \`${username}\``, $.defTgMsgForm);
        return;
    }

    WatchByPandaLive(msg, pandaliveList[0]);
}

async function handleViewRedLivePlatform(msg, msgText) {
    let title = msgText.slice(3).trim();
    let redliveList = $.redliveList.filter(item => item.title === title);

    if (!redliveList.length) {
        $.bot.sendMessage(msg.chat.id, `不存在平台 \`${title}\``, $.defTgMsgForm);
        return;
    }

    WatchByRedLiveList(msg, redliveList[0]);
}

async function handleViewAdultContent(msg, msgText) {
    let context = msgText.slice(3).trim();
    let title = context.split(' => ')[0];
    let address = context.split(' => ')[1];

    try {
        const zhubo = $.redliveJson[address];
        let redliveList = zhubo.filter(item => item.title === title);

        if (!redliveList.length) {
            $.bot.sendMessage(msg.chat.id, `不存在平台 \`${title}\``, $.defTgMsgForm);
            return;
        }

        WatchByRedLive(msg, redliveList[0]);
    } catch (err) {
        $.bot.sendMessage(msg.chat.id, `不存在平台 \`${title}\``, $.defTgMsgForm);
    }
}

async function handleBulkDelete(msg, msgText) {
    let username = msgText.slice(4).trim();
    let vtb = await dbm.getVtbByUsername(username.split("#")[0]);

    if (!vtb) {
        $.bot.sendMessage(msg.chat.id, `不存在主播 \`${username}\``, $.defTgMsgForm);
        return;
    }

    const existsWatch = await dbm.existsWatch(username.split("#")[1], vtb.mid);
    if (!existsWatch) {
        $.bot.sendMessage(msg.chat.id, '该主播不在您的监控列表中。', $.defTgMsgForm);
        return;
    }

    await dbm.delWatch(username.split("#")[1], vtb.mid);
    $.bot.sendMessage(msg.chat.id, `已删除主播 \`${vtb.username}\`。`, $.defTgMsgForm);
}

async function handleBotJoin(msg) {
    const userId = msg.from.id;
    const hasPermission = await dbm.hasPermission(userId, 2);

    if (!hasPermission) {
        return;
    }

    // 机器人加入群或频道
    const groupID = msg.chat.id;
    const groupTitle = msg.chat.title;
    const groupType = msg.chat.type;

    const fromID = msg.from.id;
    const fromName = msg.from.first_name || msg.from.last_name || "";

    // 加入user表
    if (groupID !== "" && groupTitle !== "") {
        const isAddUser = await dbm.addUser(groupID, fromID, 1, groupTitle, groupType);
        if (isAddUser) {
            $.bot.sendMessage(fromID,
                `恭喜 ${fromName}, 已添加机器人到${groupTitle}中, ID: ${groupID}。`,
                $.defTgMsgForm
            );
        } else {
            $.bot.sendMessage(fromID,
                `你好 ${fromName}, 添加机器人到${groupTitle}中, ID: ${groupID} 失败。😭`,
                $.defTgMsgForm
            );
        }
    }
}

async function handleSupportedWebsiteLink(msg, msgText) {
    const site = msgText.split("/")[2];
    const api = apiHandlers[site];
    const mid = msgText.split("/")[api.getMidCount()];

    try {
        const data = await api.getStationStatus(mid);
        if (data.code) {
            const { title, roomid, username, room_status, liveUrl, avatar_thumb, targetUrl } = data;
            $.bot.sendMessage(msg.chat.id,
                `🎉查看主播 \`${username}\`\n👉️[源站](${targetUrl})\n👉▶️[直接播放](${liveUrl})`,
                $.defTgMsgForm
            );
            // 添加主播
            _addWatchByMid(msg, msgText);
        } else {
            $.log(`用户：${msg.chat.id} 查询${site} =>${mid} 失败！url => ${msgText}` + data.msg, 'error');
            $.bot.sendMessage(msg.chat.id, $.template.networkError, $.defTgMsgForm);
        }
    } catch (error) {
        $.log(`处理网站链接错误: ${error.message}`, 'error');
        $.bot.sendMessage(msg.chat.id, $.template.networkError, $.defTgMsgForm);
    }
}

async function forwardToAdmins(msg) {
    const permissionService = $.services.permission;
    const messageService = $.services.message;

    // 获取管理员列表
    const adminlist = await permissionService.getAdmins();

    adminlist.forEach(user => {
        const userId = user.userId;
        // 移除管理员消息会给自己发
        if (userId !== msg.chat.id) {
            const username = $.parseTgUserNickname(msg.from);
            let sendMsg = `有一个小朋友发送了消息。\n他(她)是：${username}\nID： ${msg.chat.id} \n ${msg.text} \n发送时间: ${$.convertUnixTimestampToDate(msg.date)}\n <code>/send ${msg.chat.id} 回复的内容</code>`;
            messageService.sendText(userId, sendMsg, { parse_mode: 'HTML' });
        }
    });
}

// =============================================================================================
// 回调处理模块
// =============================================================================================
function registerCallbackHandlers() {
    $.bot.on('callback_query', async (query) => {
        await handleCallbackQuery(query);
    });
}

async function handleCallbackQuery(query) {
    // 添加直播间
    if (query.data.startsWith('addLive_')) {
        const [prefix, shareUrl, chatId] = query.data.split('_');
        const msg = { chat: { id: chatId } };
        _addWatchByMid(msg, shareUrl);
    }

    // 添加福袋
    if (query.data.startsWith('addLucky_')) {
        const [prefix, roomID, chatId] = query.data.split('_');
        const msg = { chat: { id: chatId } };
        let url = `https://fd.live.douyin.com/fudai_${roomID}`;
        _addWatchByMid(msg, url);
    }

    // 获取视频
    if (query.data.startsWith('getVideo_')) {
        await handleGetVideoCallback(query);
    }

    // 确认回调已处理
    try {
        await $.bot.answerCallbackQuery(query.id);
    } catch (e) {
        $.log(`回调确认错误: ${e.message}`, 'error');
    }
}

async function saveParseRecord(record) {
    try {
        // 使用 livebot 自己的 dbm 而不是导入 config/db
        if (!dbm || !dbm.execute) {
            $.log('数据库模块未初始化，跳过保存解析记录', 'warn');
            return;
        }
        await dbm.execute(
            `INSERT INTO video_parse_records 
             (share_url, parse_url, parse_status, parse_message, content_type, 
              video_url, image_count, image_urls, title, chat_id, send_status, send_message, message_ids, group_send_results)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                record.share_url,
                record.parse_url,
                record.parse_status,
                record.parse_message,
                record.content_type,
                record.video_url,
                record.image_count || 0,
                record.image_urls,
                record.title,
                record.chat_id,
                record.send_status || 0,
                record.send_message,
                record.message_ids,
                record.group_send_results
            ]
        );
    } catch (error) {
        $.log(`保存解析记录失败: ${error.message}`, 'error');
    }
}

async function sendToGroups(contentType, videoUrl, imageUrls, caption, title, groupsConfigKey = 'dyJxGroups') {
    const results = [];

    try {
        const groupsConfig = config[groupsConfigKey];
        if (!groupsConfig || !groupsConfig.includes('_')) {
            return results;
        }

        const parts = groupsConfig.split('_');
        if (parts.length < 2 || parts[0] !== '1') {
            return results;
        }

        const groupsStr = parts[1].replace('[', '').replace(']', '');
        const groupIds = groupsStr.split(',').map(id => id.trim()).filter(id => id && !isNaN(Number(id)));

        if (groupIds.length === 0) {
            return results;
        }

        $.log(`开始发送到 ${groupIds.length} 个群组...`);

        for (const groupId of groupIds) {
            const groupResult = {
                group_id: Number(groupId),
                group_username: null,
                message_ids: [],
                success: true,
                error_message: ''
            };

            try {
                if (contentType === 'image' && imageUrls && imageUrls.length > 0) {
                    const batchSize = 10;
                    const totalBatches = Math.ceil(imageUrls.length / batchSize);

                    for (let batch = 0; batch < totalBatches; batch++) {
                        const startIndex = batch * batchSize;
                        const endIndex = Math.min(startIndex + batchSize, imageUrls.length);
                        const currentBatchImages = imageUrls.slice(startIndex, endIndex);

                        const mediaGroup = currentBatchImages.map((imageUrl, index) => {
                            const isFirstItem = batch === 0 && index === 0;
                            return {
                                type: 'photo',
                                media: imageUrl,
                                caption: isFirstItem ? (title || '来自抖音的图片组') : ''
                            };
                        });

                        const sentMessages = await $.bot.sendMediaGroup(Number(groupId), mediaGroup);
                        groupResult.message_ids.push(...sentMessages.map(m => m.message_id));

                        if (batch < totalBatches - 1) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }

                    const textMessage = await $.bot.sendMessage(Number(groupId), `已完成发送，共 ${imageUrls.length} 张图片`);
                    groupResult.message_ids.push(textMessage.message_id);
                } else if (contentType === 'video' && videoUrl) {
                    try {
                        const sentMessage = await $.bot.sendVideo(Number(groupId), videoUrl, {
                            caption: caption,
                            parse_mode: 'Markdown',
                            supportsStreaming: true
                        });
                        groupResult.message_ids.push(sentMessage.message_id);
                    } catch (sendError) {
                        $.log(`发送视频到群组 ${groupId} 失败：${sendError.message}`, 'error');
                        const errorMsg = `${caption}\n视频播放地址: [直接播放](${videoUrl})`;
                        const sentMessage = await $.bot.sendMessage(Number(groupId), errorMsg, {
                            parse_mode: 'Markdown'
                        });
                        groupResult.message_ids.push(sentMessage.message_id);
                        groupResult.success = false;
                        groupResult.error_message = sendError.message;
                    }
                }

                try {
                    const chat = await $.bot.getChat(Number(groupId));
                    if (chat.username) {
                        groupResult.group_username = chat.username;
                        $.log(`获取到群组 ${groupId} 的用户名: @${chat.username}`);
                    } else {
                        $.log(`群组 ${groupId} 没有公开用户名或机器人权限不足`, 'warn');
                    }
                } catch (chatError) {
                    $.log(`获取群组 ${groupId} 信息失败：${chatError.message}`, 'warn');
                }

                $.log(`成功发送到群组 ${groupId}`);
            } catch (error) {
                $.log(`发送到群组 ${groupId} 失败：${error.message}`, 'error');
                groupResult.success = false;
                groupResult.error_message = error.message;
            }

            results.push(groupResult);

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
        $.log(`发送到群组失败：${error.message}`, 'error');
    }

    return results;
}

async function handleGetVideoCallback(query) {
    const parts = query.data.split('_');
    if (parts.length < 3) {
        $.log('数据格式错误，缺少必要参数', 'error');
        return;
    }

    const [prefix, shareUrl, chatId] = parts;
    if (!chatId || isNaN(Number(chatId))) {
        console.error('无效的 chatId:', chatId);
        return;
    }

    const msg = { chat: { id: chatId } };
    const record = {
        share_url: shareUrl,
        parse_url: null,
        parse_status: 0,
        parse_message: '',
        content_type: null,
        video_url: null,
        image_count: 0,
        image_urls: null,
        title: null,
        chat_id: Number(chatId),
        send_status: 0,
        send_message: '',
        message_ids: null
    };

    try {
        const dyurl = `${config.dyJxApi}?msg=${shareUrl.replace('999', '_')}`;
        record.parse_url = dyurl;

        const response = await $.axios.get(dyurl);
        if (response.status !== 200) {
            throw new Error('API请求失败');
        }

        const respData = response.data;
        record.parse_message = respData.msg;

        if (respData.msg !== "解析成功！💬️") {
            throw new Error('接口解析失败');
        }

        record.parse_status = 1;
        record.title = respData.title;

        const hasImages = Array.isArray(respData.images) && respData.images.length > 0;

        if (hasImages) {
            record.content_type = 'image';
            record.image_count = respData.images.length;
            record.image_urls = JSON.stringify(respData.images);

            const totalImages = respData.images.length;
            const batchSize = 10;
            const totalBatches = Math.ceil(totalImages / batchSize);
            const messageIds = [];

            for (let batch = 0; batch < totalBatches; batch++) {
                const startIndex = batch * batchSize;
                const endIndex = Math.min(startIndex + batchSize, totalImages);
                const currentBatchImages = respData.images.slice(startIndex, endIndex);

                const mediaGroup = currentBatchImages.map((imageUrl, index) => {
                    const isFirstItem = batch === 0 && index === 0;
                    return {
                        type: 'photo',
                        media: imageUrl,
                        caption: isFirstItem ? (respData.title || '来自抖音的图片组') : ''
                    };
                });

                const sentMessages = await $.bot.sendMediaGroup(msg.chat.id, mediaGroup);
                messageIds.push(...sentMessages.map(m => m.message_id));

                if (batch < totalBatches - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            const textMessage = await $.bot.sendMessage(msg.chat.id, `已完成发送，共 ${totalImages} 张图片`);
            messageIds.push(textMessage.message_id);

            record.message_ids = JSON.stringify(messageIds);
            record.send_status = 1;
            record.send_message = `已完成发送，共 ${totalImages} 张图片`;

            const groupResults = await sendToGroups('image', null, respData.images, null, respData.title);
            if (groupResults.length > 0) {
                record.group_send_results = JSON.stringify(groupResults);
            }

        } else {
            const videoUrl = respData.play_video || respData.video;
            if (!videoUrl) {
                throw new Error('未找到视频URL');
            }
            $.log('发送视频...');

            record.content_type = 'video';
            record.video_url = videoUrl;

            const caption = respData.title || '来自抖音的视频';
            try {
                const sentMessage = await $.bot.sendVideo(msg.chat.id, videoUrl, {
                    caption: caption,
                    supportsStreaming: true
                });
                record.message_ids = JSON.stringify([sentMessage.message_id]);
                record.send_status = 1;
                record.send_message = '视频发送成功';
                $.log('视频发送成功');

                const groupResults = await sendToGroups('video', videoUrl, null, caption, respData.title);
                if (groupResults.length > 0) {
                    record.group_send_results = JSON.stringify(groupResults);
                }
            } catch (sendError) {
                $.log(`发送视频失败：${sendError.message}`, 'error');
                const errorMsg = `${caption}\n视频播放地址: [直接播放](${videoUrl})`;
                const sentMessage = await $.bot.sendMessage(msg.chat.id, errorMsg);
                record.message_ids = JSON.stringify([sentMessage.message_id]);
                record.send_status = 2;
                record.send_message = `发送失败: ${sendError.message}`;
                $.log('视频发送失败');
            }
        }
    } catch (error) {
        $.log(`发生错误：${error.message}`, 'error');
        record.parse_message = error.message;
        record.send_status = 2;
        record.send_message = error.message;

        if (chatId && !isNaN(Number(chatId))) {
            await $.bot.sendMessage(msg.chat.id, '获取发现未知状况');
        } else {
            $.log('chatId 无效，无法发送消息', 'error');
        }
    } finally {
        await saveParseRecord(record);
    }
}

// =============================================================================================
// 主播管理模块
// =============================================================================================
async function _addWatchByMid(msg, url, channelId = 1) {
    // 获取site来源站
    const site = url.split('/')[2];
    // 目标消息ID
    let targetID = channelId > 0 ? msg.chat.id : channelId;

    // 判断是否为可监控网站
    if (!siteList.includes(site)) {
        $.bot.sendMessage(msg.chat.id, '暂不支持当前网站！', $.defTgMsgForm);
        return 0;
    }

    // 房间号
    let mid = getMidFromUrl(url, site);
    if (mid === 0) {
        $.bot.sendMessage(msg.chat.id, '检查网址是否正确！', $.defTgMsgForm);
        return 0;
    }

    // 查看是否保存过
    const existsWatch = await dbm.existsWatch(targetID, mid);
    if (existsWatch) {
        $.bot.sendMessage(msg.chat.id, `[${mid}](${url}) 该主播已在您的监控列表中。`, $.defTgMsgForm);
        return 0;
    }

    // 查看是否在主播库中
    const vtb = await dbm.getVtbByMid(mid);
    if (vtb) {
        $.log('库里存在，进行。。。。');
        const addWatch = await dbm.addWatch(targetID, mid);
        if (addWatch) {
            await sendAddSuccessMessage(targetID, vtb.username, vtb.mid, vtb.targetUrl);
        } else {
            $.log(`用户：${msg.chat.id}, 添加${vtb.username} =${vtb.mid}失败`, 'error');
            $.bot.sendMessage(msg.chat.id, '添加失败，请联系管理员', $.defTgMsgForm);
        }
        return 0;
    }

    // 不在主播库中，新添加
    const apiHandler = apiHandlers[site];
    if (apiHandler) {
        handleStationStatus(msg, mid, site, apiHandler, url);
    } else {
        $.bot.sendMessage(msg.chat.id, '🚫不支持当前网站。', $.defTgMsgForm);
        return 0;
    }
    return 1;
}

function getMidFromUrl(url, site) {
    const apiHandler = apiHandlers[site];
    const mid = url.split('/')[apiHandler.getMidCount()];
    return mid && mid.includes('?') ? mid.split("?")[0] : mid;
}

async function handleStationStatus(msg, mid, site, api, targetUrl) {
    try {
        const data = await api.getStationStatus(mid);
        if (data.code) {
            const { title, roomid, username, room_status, liveUrl, avatar_thumb } = data;
            if (await dbm.addVtbToWatch(msg.chat.id, mid, roomid, username, room_status, title, site, avatar_thumb, liveUrl, targetUrl)) {
                const addWatch = await dbm.addWatch(msg.chat.id, mid);
                if (addWatch) {
                    await sendAddSuccessMessage(msg.chat.id, username, mid, targetUrl);
                } else {
                    $.bot.sendMessage(msg.chat.id, `添加主播 \`${username}\` 失败！请重试！`, $.defTgMsgForm);
                }
            } else {
                $.bot.sendMessage(msg.chat.id, `添加主播 \`${username}\` 失败！请重试！`, $.defTgMsgForm);
            }
        } else {
            $.log(`用户：${msg.chat.id} 添加${site} =>${mid} 失败！` + data.msg, 'error');
            $.bot.sendMessage(msg.chat.id, $.template.networkError, $.defTgMsgForm);
        }
    } catch (err) {
        $.log(`用户：${msg.chat.id} 添加${site} =>${mid} 失败！` + err.message, 'error');
        $.bot.sendMessage(msg.chat.id, $.template.networkError, $.defTgMsgForm);
    }
}

async function sendAddSuccessMessage(chatId, username, mid, targetUrl) {
    const permissionLevel = await dbm.getUserPermissionLevel(chatId);
    if (permissionLevel === 2) {
        const keyboard = createKeyboard(mid, targetUrl.replace('fd.', '').replace('fudai_', ''));
        await sendMessageWithKeyboard(chatId, `🎉已添加主播 ${username}`, keyboard);
    } else {
        $.bot.sendMessage(chatId, `🎉已添加主播${username}`, $.defTgMsgForm);
    }
}

async function sendMessageWithKeyboard(chatId, text, keyboard) {
    return $.bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: JSON.stringify(keyboard)
    });
}

function createKeyboard(mid, targetUrl) {
    return {
        inline_keyboard: [
            [{ text: '取消关注', callback_data: `unfollow_${mid}` },
            { text: '跳转链接', url: targetUrl }],
            [{ text: '学习', callback_data: `douyin_${mid}_study` },
            { text: '游戏', callback_data: `douyin_${mid}_game` }],
            [{ text: '舞蹈', callback_data: `douyin_${mid}_dance` },
            { text: '颜值', callback_data: `douyin_${mid}_looks` }],
            [{ text: '超级福袋', callback_data: `douyin_${mid}_lucky` },
            { text: '普通福袋', callback_data: `douyin_${mid}_luckys` }],
            [{ text: '19+', callback_data: `douyin_${mid}_av` }]
        ]
    };
}

// =============================================================================================
// 主播查看模块
// =============================================================================================
async function WatchByMidChats(msg, vtb) {
    // 记录日志，告知正在查看的用户名和直播平台
    $.log(`${msg.chat.id} 查看 ${vtb.username} 在 ${vtb.site} 的直播`);

    // 直播状态的标题
    let head = `\`${vtb.username}\` ${vtb.liveStatus ? '正在直播' : '直播已结束'}`;
    // 聊天ID，即用户的ID
    let watch = msg.chat.id;
    // 消息体，用于存储直播信息
    let body = '';
    // 直播源站的基础URL
    let baseUrl = '';

    // 如果直播正在进行
    if (vtb.liveStatus) {
        // 如果有直播标题，则添加到消息体中
        if (vtb.title !== '') {
            body += `\n\n主题👉${vtb.title}\n`;
        }

        // 设置直播源站的基础URL
        baseUrl = vtb.site !== 'www.pandalive.co.kr' ? vtb.site : `${vtb.site}/live/play`;
        baseUrl = vtb.site !== 'live.kuaishou.com' ? baseUrl : `${vtb.site}/u`;

        // 如果直播平台是Pandalive，则处理特定的信息
        if (vtb.site === 'www.pandalive.co.kr') {
            let pandaList = $.pandaliveList.filter(item => item.mid === vtb.mid);
            if (pandaList.length) {
                vtb.url = pandaList[0].url;
            }
            body += `开播时间👉 ${vtb.pic.split('#')[1]}(韩国时间早一小时)\n`;
        }

        // 如果有播放源，则添加到消息体中
        if (vtb.url !== '' && vtb.url.split('/')[2] !== vtb.site) {
            body += `源站👉[前往](https://${baseUrl}/${vtb.roomid})\n`;
            body += `直接播放👉▶️[播放](${vtb.url})\n`;
        } else {
            body += `源站👉[前往](${vtb.url})\n`;
        }

        // 如果有直播截图，则发送图片消息，否则发送普通消息
        if (vtb.pic !== '') {
            // 构建取消关注按钮的回调查询数据
            let unfollowCallbackData = `unfollow_${vtb.mid}`;
            let targetUrl = `https://${baseUrl}/${vtb.roomid}`;

            // 定义内联键盘
            let keyboard = {
                inline_keyboard: [
                    [
                        { text: '取消关注', callback_data: unfollowCallbackData },
                        { text: '删除消息', callback_data: 'delete_message' },
                        { text: '跳转链接', url: targetUrl }
                    ]
                ]
            };
            try {
                // 发送图片消息
                await $.bot.sendPhoto(watch, vtb.pic, {
                    caption: head + body,
                    parse_mode: 'Markdown',
                    reply_markup: JSON.stringify(keyboard)
                });
            } catch (err) {
                // 记录错误日志，并向用户发送默认消息
                $.log(`发送主播消息出错(主播已下播，未更新) =》${err.message}`, 'error');
                await $.bot.sendMessage(watch, '当前主播下播了,查看是否被封', {
                    ...$.defTgMsgForm,  // 保留原有消息格式配置
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: '取消关注', callback_data: `unfollow_${vtb.mid}` },
                            { text: '跳转链接', url: targetUrl }]
                        ]
                    })
                });
            }
        } else {
            // 发送普通消息
            await $.bot.sendMessage(watch, head + body, $.defTgMsgForm);
        }
    } else {
        // 发送只有标题的消息
        await $.bot.sendMessage(watch, head, $.defTgMsgForm);
    }
}

async function WatchByPandaLive(msg, vtb) {
    $.log('Let\'s view ' + vtb.username);
    vtb.username = vtb.username.split('[')[0];
    let head = '`' + vtb.username + '`直播中';
    let watch = msg.chat.id;
    if (vtb.url) {
        head += '\n\n 源站👉[' + vtb.username + '](https://www.pandalive.co.kr/live/play/' + vtb.mid + ') 需要19+账号\n\n';
        head += '直接播放👉▶️[' + vtb.username + '](' + vtb.url + ')\n';
    }
    if (vtb.pic !== '') {
        // 发送图片消息
        await $.bot.sendPhoto(watch, vtb.pic, {
            caption: head,
            parse_mode: 'Markdown'
        });
    } else {
        await $.bot.sendMessage(watch, head, $.defTgMsgForm);
    }
}

async function WatchByRedLiveList(msg, pingtai) {
    $.log('Let\'s view ' + pingtai.title);

    try {
        const resp = await $.axios.get(`http://api.vipmisss.com:81/xcdsw/${pingtai.address}`)
        const { zhubo } = resp.data;

        let arr = zhubo;
        if (!arr.length) {
            $.bot.sendMessage(msg.chat.id, '暂无主播哦。', $.defTgMsgForm);
            return;
        }

        const site = pingtai.address.replace('.txt', '').replace('json', '');
        $.redliveJson[site] = arr;

        arr = arr.map((item, index) => {
            return `🔞️  ${item.title} => ${site}`;
        });

        arr.push('取消');
        let keyboard = $.formatTgKeyboard(arr);
        $.bot.sendMessage(msg.chat.id,
            `已为您搜索到${arr.length - 1}个主播。\n请在弹出的键盘中选择需要查看的主播。`,
            { reply_markup: { keyboard: keyboard } }
        );
    } catch (err) {
        $.bot.sendMessage(msg.chat.id, '暂无主播哦。', $.defTgMsgForm);
    }
}

async function WatchByRedLive(msg, vtb) {
    console.log('Let\'s view ' + vtb.title);
    let head = `<b>${vtb.title}</b>`;
    let watch = msg.chat.id;

    // 检查地址并构建播放链接
    if (vtb.address.includes('http')) {
        head += `直接播放👉▶️<a href="${vtb.address}">${vtb.title}</a>`;
    } else {
        head += `直接播放👉▶️<tg-spoiler>${vtb.address}</tg-spoiler>`;
    }

    // 检查是否有图片链接
    if (vtb.img !== '') {
        let pic = vtb.img;
        // 确保图片链接是 .jpg 格式，如果不是，则添加 .jpg 后缀
        if (!vtb.img.includes('.jpg')) {
            pic += '.jpg';
        }

        try {
            // 发送图片消息
            await $.bot.sendPhoto(watch, pic, {
                caption: head,
                parse_mode: 'HTML'
            });
        } catch (err) {
            // 如果发送图片消息失败，记录错误信息并发送纯文本消息
            $.log("发送图片消息报错 => " + err.message, 'error');
            try {
                await $.bot.sendMessage(watch, head, { parse_mode: 'HTML' });
            } catch (msgErr) {
                $.log("发送纯文本消息报错 => " + msgErr.message, 'error');
            }
        }
    } else {
        // 如果没有图片链接，直接发送文本消息
        try {
            await $.bot.sendMessage(watch, head, { parse_mode: 'HTML' });
        } catch (msgErr) {
            $.log("发送纯文本消息报错 => " + msgErr.message, 'error');
        }
    }
}

// =============================================================================================
// 主程序入口
// =============================================================================================
module.exports = async (includes, databaseManager, api, config) => {
    await initialize(includes, databaseManager, api, config);
    registerCommands();
    registerMessageHandlers();
    registerCallbackHandlers();
};
