// =============================================================================================
// 超级管理员模块 - 核心依赖与初始化
// =============================================================================================
const { restartApp } = require("../utils/restart-utils");
const path = require('path');
const { getSystemInfo } = require("../utils/system-utils");
const { getScheduleTime } = require("../utils/crontab-utils");

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

// 第三方服务集成
const cg = require("../spider/51cg");
const yt = require("../spiderOther/youtubeAPI");

// 模块导出 - 主入口
module.exports = ($, dbm, config, api) => {
    // =============================================================================================
    // 通用工具函数
    // =============================================================================================
    
    /**
     * 发送消息的通用方法（含格式验证与错误处理）
     * @param {number} chatId - 目标聊天ID
     * @param {string} text - 消息内容
     * @param {object} options - 额外参数（如reply_markup、parse_mode等）
     * @returns {Promise} 消息发送Promise
     */
    const sendMessage = async (chatId, text, options = {}) => {
        try {
            // 处理消息长度限制（Telegram单条消息最大4096字符）
            if (text.length > 4096) {
                text = text.substring(0, 4093) + '...';
            }

            // 检查是否使用Markdown格式，如果是则进行额外验证
            const parseMode = options.parse_mode || ($.defTgMsgForm ? $.defTgMsgForm.parse_mode : null);
            if (parseMode && ['Markdown', 'MarkdownV2'].includes(parseMode)) {
                // 检查链接格式是否完整
                const linkRegex = /\[([^\]]*)\]\(([^)]*)\)/g;
                const linkMatches = text.match(linkRegex);
                if (linkMatches) {
                    linkMatches.forEach(link => {
                        if (!link.endsWith(')') || !link.includes('](')) {
                            $.log(`发现不完整的链接格式: ${link}`, 'warn');
                            // 转义不完整的链接格式
                            text = text.replace(link, link);
                        }
                    });
                }
            }

            return await $.bot.sendMessage(chatId, text, {
                ...($.defTgMsgForm || {}),
                ...options
            });
        } catch (error) {
            // 失败时尝试不带格式重新发送
            if (error.message.includes('can\'t parse entities')) {
                $.log(`Markdown格式错误，尝试纯文本发送: ${error.message}`, 'warn');
                return await $.bot.sendMessage(chatId, text, {
                    ...($.defTgMsgForm || {}),
                    ...options,
                    parse_mode: null // 禁用格式解析
                });
            }
            $.log(`消息发送失败: ${error.message}`, 'error');
            throw error; // 允许上层处理
        }
    };

    /**
     * 权限检查中间件（超级管理员专用）
     * @param {Function} handler - 权限通过后的处理函数
     * @returns {Function} 包装后的处理函数
     */
    const checkPermissionAdmin = (handler) => {
        return async (msg, match) => {
            const userId = msg.from.id;
            try {
                const hasPermission = await dbm.hasPermission(userId, 2);
                if (!hasPermission) {
                    return sendMessage(msg.chat.id, '🔒您没有权限执行此操作。');
                }
                await handler(msg, match); // 确保异步处理正确
            } catch (error) {
                $.log(`权限检查或命令执行失败: ${error.message}`, 'error');
                sendMessage(msg.chat.id, '操作执行失败，请稍后重试');
            }
        };
    };

    // =============================================================================================
    // 核心功能模块 - 命令处理
    // =============================================================================================

    // ---------------------------------------------------------------------------------------------
    // 1. 帮助命令与基础信息
    // ---------------------------------------------------------------------------------------------

    // 管理员帮助信息
    const helpMessage = stripIndent(`
        /repwd <password> - 修改用户验证码
        /adduser <userId> <permissionLevel> - 添加新用户并设置权限
        /addusers <userList> - 批量添加用户（格式: userId_#权限_#昵称_#类型##...）
        /deluser <userId> - 删除用户
        /moduser <userId> <newPermissionLevel> - 修改用户权限
        /user <userId> - 查看用户信息
        /listusers - 查看所有用户列表
        /getuserlist <userId> - 查看用户订阅列表
        /delchannle <userId> - 删除指定用户的频道订阅
        /view - 查看监控执行统计
        /hopt - 查看支持的监控视频站
    `).trim();

    // 系统设置帮助信息
    const settingsHelpMessage = stripIndent(`
        /sendnotification <text> - 向所有用户发送通知
    `).trim();

    // 帮助命令处理
    $.bot.onText(/^\/huser$/, checkPermissionAdmin((msg) => {
        sendMessage(msg.chat.id, helpMessage);
    }));

    $.bot.onText(/^\/hset$/, checkPermissionAdmin((msg) => {
        sendMessage(msg.chat.id, settingsHelpMessage);
    }));

    // ---------------------------------------------------------------------------------------------
    // 2. 用户管理命令
    // ---------------------------------------------------------------------------------------------

    // 修改用户验证码
    $.bot.onText(/^\/repwd (.+)/, checkPermissionAdmin((msg, match) => {
        const newPassword = match[1].trim();
        if (newPassword.length < 6 || newPassword.length > 18) {
            return sendMessage(msg.chat.id, '密码长度必须在6到18个字符之间。');
        }
        sendMessage(msg.chat.id, `成功修改验证码为 \`${newPassword}\``);
    }));

    // 添加单个用户
    $.bot.onText(/^\/adduser (-?\d+) (\d+)/, checkPermissionAdmin(async (msg, match) => {
        const userId = parseInt(match[1]);
        const permissionLevel = parseInt(match[2]);
        await dbm.addUser(userId, msg.chat.id, permissionLevel);
        sendMessage(msg.chat.id, `用户 ${userId} 已添加，权限级别为 ${permissionLevel}`);
    }));

    // 批量添加用户
    $.bot.onText(/^\/addusers (.+)/, checkPermissionAdmin(async (msg, match) => {
        const userListStr = match[1].trim();
        const userList = userListStr.split("##");
        const addedUsers = [];

        for (const user of userList) {
            const [userId, permission, userName, userType] = user.split("_#");
            if (userId && permission) {
                await dbm.addUser(userId, msg.chat.id, permission, userName || '', userType || '');
                addedUsers.push(`${userId}(${permission})`);
            }
        }

        sendMessage(msg.chat.id, `已添加用户: ${addedUsers.join(", ")}`);
    }));

    // 删除用户
    $.bot.onText(/^\/deluser (-?\d+)/, checkPermissionAdmin(async (msg, match) => {
        const userId = parseInt(match[1]);
        const success = await dbm.deleteUser(userId);
        sendMessage(msg.chat.id, success
            ? `用户 ${userId} 已删除`
            : `用户 ${userId} 删除失败！`
        );
    }));

    // 修改用户权限
    $.bot.onText(/^\/moduser (-?\d+) (\d+)/, checkPermissionAdmin(async (msg, match) => {
        const userId = parseInt(match[1]);
        const newPermission = parseInt(match[2]);
        const success = await dbm.updateUserPermissionLevel(userId, newPermission);
        sendMessage(msg.chat.id, success
            ? `用户 ${userId} 的权限已修改为 ${newPermission}`
            : `用户 ${userId} 的权限修改失败！`
        );
    }));

    // 查看单个用户信息
    $.bot.onText(/^\/user (-?\d+)/, checkPermissionAdmin(async (msg, match) => {
        const userId = parseInt(match[1]);
        const user = await dbm.getUser(userId);
        sendMessage(msg.chat.id, user
            ? `用户ID: ${user.userId}\n权限级别: ${user.permissionLevel}`
            : `用户 ${userId} 不存在`
        );
    }));

    // 查看所有用户列表
    $.bot.onText(/^\/listusers$/, checkPermissionAdmin(async (msg) => {
        const users = await dbm.getUser();
        if (!users.length) {
            return sendMessage(msg.chat.id, '暂无用户数据');
        }

        let userList = '用户列表:\n';
        const configUserList = [];

        // 使用forEach的index参数添加序号（从1开始）
        users.forEach((user, index) => {
            const username = user.username || '未知';
            // 新增序号：${index + 1}.
            userList += `${index + 1}. ID: ${user.userId}, 昵称: ${username}, 权限: ${user.permissionLevel}, 类型: ${user.type || '普通'}\n`;
            configUserList.push(`${user.userId}_#${user.permissionLevel}_#${username}_#${user.type}`);
        });

        // 发送用户列表并自动销毁
        const sentMsg = await sendMessage(msg.chat.id, userList + '\n配置格式:\n' + configUserList.join("##"));
        setTimeout(() => $.bot.deleteMessage(msg.chat.id, sentMsg.message_id), 30 * 1000);
    }));

    // ---------------------------------------------------------------------------------------------
    // 4. 系统状态与维护
    // ---------------------------------------------------------------------------------------------

    // 查看系统信息
    $.bot.onText(/^\/system$/, checkPermissionAdmin(async (msg) => {
        const { text, markdownV2 } = await getSystemInfo();
        // Telegram 推送（带转义字符）
        $.bot.sendMessage(msg.chat.id, markdownV2, { parse_mode: 'MarkdownV2' });
    }));

    // 查看监控统计
    $.bot.onText(/^\/view$/, checkPermissionAdmin(async (msg) => {
        const count = await dbm.getSettings('count');
        const viewStr = count?.value || '0#0#0';
        const [total, viewTime, viewCount] = viewStr.split('#').map(Number);
        const efficiency = viewTime && viewCount
            ? Math.round(config.interval * viewCount / viewTime * 100)
            : 0;

        sendMessage(msg.chat.id, stripIndent(`
            截止目前监控执行了: *${total}* 次！
            上次运行时间: *${viewTime}* 秒
            监控间隔: *${config.interval}* 秒
            监控数量: *${viewCount}* 个
            效率: *${efficiency}*%
        `).trim());
    }));

    // 重启应用
    $.bot.onText(/^\/restart$/, checkPermissionAdmin(async (msg) => {
        const appName = "livecgbot";
        await sendMessage(msg.chat.id, `项目 *${appName}* 重启中...`);
        restartApp();
    }));

    // 获取数据库文件
    $.bot.onText(/^\/getDB$/, checkPermissionAdmin(async (msg) => {
        try {
            const filepath = path.resolve(__dirname, '../../' + config.dbName);
            await $.bot.sendDocument(msg.chat.id, filepath, {
                caption: `数据库备份: ${$.convertUnixTimestampToDate(Date.now())}`
            });
        } catch (error) {
            $.log(`发送数据库文件失败: ${error.message}`, 'error');
            sendMessage(msg.chat.id, '数据库文件发送失败');
        }
    }));

    // ---------------------------------------------------------------------------------------------
    // 5. 站点与内容管理
    // ---------------------------------------------------------------------------------------------

    // 查看支持的视频站
    $.bot.onText(/^\/hopt$/, checkPermissionAdmin((msg) => {
        sendMessage(msg.chat.id, stripIndent(`
            支持的监控地址格式：
            /add <监控地址> - 添加监控站点
              示例: /add https://hsck1.25img.com/hsck
              示例: /add https://rou.video/v
              示例: /add https://www.51cg1.com/category/wpcz/
              示例: /add https://heiliao.com/jrrs/
              示例: /add https://hlj.fun/category/jrgb/
        `).trim());
    }));

    // 检查站点可用性
    $.bot.onText(/^\/getSite$/, checkPermissionAdmin(async (msg) => {
        const chatId = msg.chat.id;
        const siteList = Object.keys(api);

        if (!siteList.length) {
            return sendMessage(chatId, '没有配置任何监控站点');
        }

        // 并发检查站点可用性
        const startTime = Date.now();
        const results = await checkSiteList($, siteList);
        const elapsedTime = (Date.now() - startTime) / 1000;

        let message = "当前监控站点可用性：\n\n";
        let index = 1;

        for (const [site, status] of Object.entries(results)) {
            message += `${index}. ${site}: ${status === "Available" ? "✔️ 可用" : "❌ 不可用"}\n`;
            index++;
        }

        message += `\n检查耗时: ${elapsedTime.toFixed(2)} 秒`;
        sendMessage(chatId, message);
    }));

    // 查询未被关注的主播
    $.bot.onText(/^\/unwatched$/, checkPermissionAdmin(async (msg) => {
        const chatId = msg.chat.id;

        // 发送"正在查询"提示消息
        const processingMsg = await $.bot.sendMessage(chatId, "🔍 正在查询未被关注的主播，请稍候...");

        try {
            const unwatchedVtbs = await dbm.getUnwatchedVtbs();
            await $.bot.deleteMessage(chatId, processingMsg.message_id);

            if (!unwatchedVtbs?.length) {
                return sendMessage(chatId, "没有找到未被任何用户关注的主播");
            }

            let message = "📋 未被关注的主播列表：\n\n";
            const keyboard = [];
            let currentRow = []; // 用于临时存储当前行的按钮

            unwatchedVtbs.forEach((vtb, index) => {
                const username = vtb.username || '未知主播';
                const targetUrl = vtb.targetUrl || '';

                const urlText = targetUrl
                    ? `网址: [点击访问](${targetUrl})`  // URL本身不需要转义
                    : '网址: 无';

                message += `${index + 1}. ${username}  ${urlText}\n\n`;

                // 构建按钮并添加到当前行
                currentRow.push({
                    text: `删#${index + 1}`,
                    callback_data: `delete_unwatched_${vtb.mid}_${vtb.roomid}`
                });

                // 每满5个按钮就创建一行，并重置当前行
                if (currentRow.length === 5) {
                    keyboard.push(currentRow);
                    currentRow = [];
                }
            });

            // 添加最后一行（如果有剩余不足5个的按钮）
            if (currentRow.length > 0) {
                keyboard.push(currentRow);
            }

            sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            try {
                await $.bot.deleteMessage(chatId, processingMsg.message_id);
            } catch (deleteErr) {
                $.log(`删除提示消息失败: ${deleteErr.message}`, 'warn');
            }
            $.log(`查询未关注主播失败: ${error.message}`, 'error');
            sendMessage(chatId, "查询失败，请稍后重试");
        }
    }));


    // ---------------------------------------------------------------------------------------------
    // 7. 定时任务与特殊功能
    // ---------------------------------------------------------------------------------------------

    // 设置自动重启间隔
    $.bot.onText(/^\/schedule$/, checkPermissionAdmin((msg) => {
        const keyboard = [
            [
                {text: '30分钟', callback_data: 'scheduleRestart_*/30 * * * *_30分钟'},
                {text: '15分钟', callback_data: 'scheduleRestart_*/15 * * * *_15分钟'},
                {text: '1分钟', callback_data: 'scheduleRestart_*/1 * * * *_1分钟'}
            ],
            [
                {text: '1小时', callback_data: 'scheduleRestart_0 */1 * * *_1小时'},
                {text: '2小时', callback_data: 'scheduleRestart_0 */2 * * *_2小时'},
                {text: '4小时', callback_data: 'scheduleRestart_0 */4 * * *_4小时'}
            ],
            [
                {text: '6小时', callback_data: 'scheduleRestart_0 */6 * * *_6小时'},
                {text: '8小时', callback_data: 'scheduleRestart_0 */8 * * *_8小时'},
                {text: '10小时', callback_data: 'scheduleRestart_0 */10 * * *_10小时'}
            ],
            [
                {text: '12小时', callback_data: 'scheduleRestart_0 */12 * * *_12小时'}
            ],
            [
                {text: '不重启', callback_data: 'scheduleRestart_none'}
            ]
        ];

        sendMessage(msg.chat.id, `项目自动重启时间间隔\n当前间隔: ${getScheduleTime()}\n请选择:`, {
            reply_markup: { inline_keyboard: keyboard }
        });
    }));

    // 清空视频消息记录
    $.bot.onText(/^\/clearVideo$/, checkPermissionAdmin(async (msg) => {
        await dbm.delMessagesAll();
        const count = $.videoMessages.length;
        $.videoMessages = [];
        sendMessage(msg.chat.id, `已清空数据库视频记录，共 ${count} 条`);
    }));

    // 查询未发送的CG信息
    $.bot.onText(/^\/cg (.+)/, checkPermissionAdmin(async (msg, match) => {
        const url = match[1];
        const dataList = await cg.getList(url);
        const keyboard = [];
        const showList = [];
        let itemlist = [];

        if (dataList.code === 1) {
            $.cgList = []; // 清空现有列表
            let index = 0;

            for (const item of dataList.dataList) {
                const exists = await dbm.getCgByTargetUrl(item.targetUrl);
                if (!exists && item.title) {
                    index++;
                    const title = item.title;
                    const targetUrl = item.targetUrl;
                    showList.push(`${index}. [${title}](${targetUrl})`);
                    $.cgList.push(item);

                    // 每8个项换一行
                    if (index % 8 === 0) {
                        itemlist.push({text: index, callback_data: `sendCg_${index}`});
                        keyboard.push(itemlist);
                        itemlist = [];
                    } else {
                        itemlist.push({text: index, callback_data: `sendCg_${index}`});
                    }
                }
            }
            if (itemlist.length) keyboard.push(itemlist);
        }

        const sentMsg = await sendMessage(msg.chat.id, `当前未发送的CG信息：\n\n${showList.join('\n')}`, {
            reply_markup: { inline_keyboard: keyboard }
        });

        // 30秒后自动删除消息
        setTimeout(() => $.bot.deleteMessage(msg.chat.id, sentMsg.message_id), 30 * 1000);
    }));

    // 获取YouTube真实播放地址
    $.bot.onText(/^\/yt (.+)/, checkPermissionAdmin((msg, match) => {
        const url = match[1];
        yt.sendDetail(msg.chat.id, url);
    }));

    // 查看抖音在线列表
    $.bot.onText(/^\/dy$/, checkPermissionAdmin(async (msg) => {
        const vtbs = await dbm.getVtbs();
        const onlineDy = vtbs.filter(vtb => vtb.liveStatus === "1" && vtb.site === "live.douyin.com");

        if (!onlineDy.length) {
            return sendMessage(msg.chat.id, '当前没有在线抖音主播');
        }

        let message = `当前在线抖音主播 (*${onlineDy.length}*):\n`;
        onlineDy.forEach((vtb, i) => {
            // 对用户提供的内容进行转义
            const username = vtb.username || '未知';
            const category = config.keyObject[vtb.category] || '';
            const targetUrl = vtb.targetUrl;
            message += `${i + 1}. [${username}](${targetUrl}) *${category}*\n`;
        });

        sendMessage(msg.chat.id, message);
    }));

    // 查看福袋在线列表
    $.bot.onText(/^\/fd$/, checkPermissionAdmin(async (msg) => {
        const fds = await dbm.getDouYinAll();
        const activeFds = fds.filter(fd => fd.fdesc);

        if (!activeFds.length) {
            return sendMessage(msg.chat.id, '当前没有可用福袋');
        }

        let message = `当前可用福袋 (*${activeFds.length}*):\n`;
        activeFds.forEach((fd, i) => {
            // 转义所有用户提供的内容
            const fdesc = fd.fdesc || '';
            const title = fd.title || '';
            const targetUrl = fd.targetUrl;
            message += `${i + 1}. *${fdesc}* 名额(${fd.lucky_count}) 参与(${fd.candidate_num}) [${title}](${targetUrl})\n`;
        });

        sendMessage(msg.chat.id, message);
    }));

    // 查看主播列表（预删除功能）
    $.bot.onText(/^\/delchannle (-?\d+)$/, checkPermissionAdmin(async (msg, match) => {
        const userId = parseInt(match[1]);
        
        // 检查是否是群组ID
        const db = require('../config/db');
        const [groups] = await db.execute('SELECT * FROM bot_groups WHERE groupId = ?', [userId]);
        
        if (groups.length > 0) {
            return sendMessage(msg.chat.id, '该ID是群组/频道，请在群组管理页面操作');
        }
        
        const watches = await dbm.getWatchByChatid(userId);

        if (!watches.length) {
            return sendMessage(msg.chat.id, '该用户的监控列表为空');
        }

        const keyboardItems = watches.map(item => `❌❤  ${item.username}#${userId}`);
        keyboardItems.push('取消');
        const keyboard = $.formatTgKeyboard(keyboardItems);

        sendMessage(msg.chat.id, '请选择需要删除的主播：', {
            reply_markup: { keyboard }
        });
    }));

    // 命令大全
    $.bot.onText(/^\/registers$/, checkPermissionAdmin(async (msg) => {
        sendMessage(msg.chat.id, $.registers);
    }));

    // =============================================================================================
    // 内部工具函数
    // =============================================================================================

    /**
     * 检查站点列表可用性（并发处理）
     * @param {object} $ - 全局工具对象
     * @param {string[]} websites - 站点列表
     * @returns {Promise<object>} 站点可用性结果
     */
    async function checkWebsitesAvailability($, websites) {
        const checkSite = async (site) => {
            try {
                const response = await $.axios.get(`https://${site}`, { timeout: 5000 });
                return { site, status: response.status >= 200 && response.status < 300 ? 'Available' : 'Unavailable' };
            } catch {
                return { site, status: 'Unavailable' };
            }
        };

        const resultsArray = await Promise.all(websites.map(checkSite));
        return resultsArray.reduce((acc, item) => {
            acc[item.site] = item.status;
            return acc;
        }, {});
    }

    /**
     * 检查站点列表的包装函数
     */
    async function checkSiteList($, websites) {
        return checkWebsitesAvailability($, websites);
    }

    // 模块加载完成提示
    $.log("超级管理员模块加载完毕。");
};
