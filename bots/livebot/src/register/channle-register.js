// ********************
// 频道功能
// ********************
const {downloadAndSaveFile} = require('../utils/files-utils');

module.exports = ($, dbm, config) => {

    function checkPermissionAdmin(handler) {
        return async (msg, match) => {
            // 只在私聊中响应
            if (msg.chat.type !== 'private') {
                return;
            }
            const userId = msg.from.id;
            const hasPermission = await dbm.hasPermission(userId, 1);
            if (!hasPermission) { // 权限级别1是普通用户级别
                $.bot.sendMessage(msg.chat.id, '🔒您没有权限执行此操作。');
                return;
            }
            handler(msg, match);
        };
    }

    // 监听机器人加入新的群组或频道
    $.bot.onText(/^\/startgroup$/, checkPermissionAdmin(async (msg) => {
        const chatId = msg.chat.id;
        const message = "🤖机器人功能介绍\n" +
            "\n" +
            "一、自动发瓜\n" +
            "将它邀请进频道|群，它就会定时自动发送吃瓜消息。\n" +
            "\n" +
            "二、资源自定义\n" +
            "①选择公有数据源，可设置只发送特定类型的资源（不设置会随机发送）\n" +
            "②支持创建私有数据源，只定时发送自己私有的资源\n" +
            "\n" +
            "三、广告自定义\n" +
            "①可在每条广播的底部创建自己的广告\n" +
            "②可向频道定时推送带有图片、视频的广告"

        // 发送消息
        let targetUrl = 'https://t.me/' + config[config.environment].appName + '?startgroup=true';
        let keyboard = {
            inline_keyboard: [
                [
                    {text: '👁️‍🗨查看频道', callback_data: 'showMyChannle_' + chatId},
                    {text: '➕邀请机器人', url: targetUrl},
                ]
            ]
        };
        // 发送消息
        await $.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(keyboard)
        });
    }));

    // 添加频道
    $.bot.on("channel_post", checkPermissionAdmin((msg) => {
        const channelId = msg.chat.id;
        const channelTitle = msg.chat.title;
        const channelUsername = msg.chat.username;
        const channelType = msg.chat.type;

        const MsgText = msg.text;
        const MsgDate = msg.date;

        $.log(`频道: ${channelTitle}(${channelUsername}) 在${$.convertUnixTimestampToDate(MsgDate)}, 发布了: ${MsgText}。ChannleID => ${channelId}`);
    }));


    $.bot.on('my_chat_member',async (msg) => {
        // 频道信息
        const channelId = msg.chat.id;
        const channelTitle = msg.chat.title;
        const channelUsername = msg.chat.username;
        const channelType = msg.chat.type;

        // 用户信息
        const fromId = msg.from.id;
        const fromIsBot = msg.from.is_bot;
        const fromFirstName = msg.from.first_name;
        const fromLastName = msg.from.last_name;
        const fromUsername = msg.from.username;
        const fromLanguageCode = msg.from.language_code;

        // 用户状态
        const status = msg.new_chat_member.status;
        let statusText = '';
        switch (status) {
            case 'creator':
                statusText = '创建者';
                break;
            case 'administrator':
                statusText = '管理员';
                break;
            case 'member':
                statusText = '成员';
                break;
            case 'left':
                statusText = '离开';
                break;
            case 'kicked':
                statusText = '被踢出';
                break;
            // 可以根据需要添加其他状态
            default:
                statusText = '未知状态';
                break;
        }

        // 输出信息
        // console.log(`频道ID: ${channelId}`);
        // console.log(`频道标题: ${channelTitle}`);
        // console.log(`频道用户名: ${channelUsername}`);
        // console.log(`频道类型: ${channelType}`);
        // console.log(`用户ID: ${fromId}`);
        // console.log(`是否是机器人: ${fromIsBot}`);
        // console.log(`用户名: ${fromUsername}`);
        // console.log(`用户姓名: ${fromFirstName}${fromLastName}`);
        // console.log(`用户语言代码: ${fromLanguageCode}`);
        // console.log(`用户状态: ${statusText}`);
        if (status === 'administrator') {
            try {
                const db = require('../db/index');
                // 检查群组是否已存在于 bot_groups 表
                const [existingGroups] = await db.execute('SELECT * FROM bot_groups WHERE groupId = ?', [channelId]);
                
                if (existingGroups.length === 0) {
                    // 保存群组信息到 bot_groups 表
                    await db.execute(
                        'INSERT INTO bot_groups (groupId, groupName, permissionLevel, type, userId) VALUES (?, ?, ?, ?, ?)',
                        [channelId, channelTitle, 1, channelType, fromId]
                    );
                    $.bot.sendMessage(fromId, `已添加频道 *${channelTitle}* https://t.me/${channelUsername}`, $.defTgMsgForm);
                    $.log(`频道: ${channelTitle} 添加成功！`);
                } else {
                    $.log(`频道: ${channelTitle} 已存在！`);
                }
            } catch (error) {
                $.log(`添加频道失败: ${error.message}`, 'error');
            }
        }

        if (status === 'left' || status === 'kicked') {
            try {
                const db = require('../db/index');
                // 获取原来添加用户ID
                const [existingGroups] = await db.execute('SELECT * FROM bot_groups WHERE groupId = ?', [channelId]);
                if (existingGroups.length > 0) {
                    const fromUserId = existingGroups[0].userId;
                    // 从 bot_groups 表中删除群组
                    await db.execute('DELETE FROM bot_groups WHERE groupId = ?', [channelId]);
                    $.bot.sendMessage(fromUserId, `由于机器人已退出该频道\n频道*${fromUsername}* https://t.me/${channelUsername} 已删除。`, $.defTgMsgForm);
                }
            } catch (error) {
                $.log(`删除频道失败: ${error.message}`, 'error');
            }
        }
    });


    // 检查群组是否被禁用
    const isGroupDisabled = async (groupId) => {
        try {
            const db = require('../db/index');
            const [groups] = await db.execute('SELECT disabled FROM bot_groups WHERE groupId = ?', [groupId]);
            return groups.length > 0 && groups[0].disabled === true;
        } catch (error) {
            $.log(`检查群组状态失败: ${error.message}`, 'error');
            return false;
        }
    };

    // 监听所有消息
    $.bot.on('message', async (msg) => {
            // 检查群组是否被禁用
            if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
                const isDisabled = await isGroupDisabled(msg.chat.id);
                if (isDisabled) {
                    return; // 忽略被禁用群组的消息
                }
            }

            // 检查消息类型并处理
            if (msg.chat.type === 'group' || msg.chat.type === 'supergroup' || msg.chat.type === 'private') {
                if (msg.video) {
                    // console.log(msg)
                    const messageType = 'video';
                    handleVideoMessage($, dbm, msg, messageType);
                }
            }

            // 保存文件
            if (msg.document) {
                const userId = msg.chat.id;
                const hasPermission = await dbm.hasPermission(userId, 2);
                if (!hasPermission) { // 假设权限级别1是管理用户的最低权限
                    $.bot.sendMessage(userId, '🔒您没有权限执行此操作。');
                    return;
                }
                const file_id = msg.document.file_id;
                const file_name = msg.document.file_name;
                const endsList = ['.js', '.db', '.json', '.txt', '.yaml', '.md'];
                const startList = ['bot', 'config', 'db', 'db/tables', 'register', 'spider', 'utils', 'utils/fenci', 'utils/otox'];

                // 检查文件名是否以.js 或者 .db结尾
                if (endsList.some(end => file_name.endsWith(end))) {
                    let directory = '../../'; // 默认保存到项目顶级目录中

                    // 如果消息中有指定目录，并且是允许的目录名，则使用指定目录
                    const file_path = msg.caption;
                    if (file_path !== null && startList.includes(file_path)) {
                        directory = `../${file_path}/`;
                        $.log(`开始保存文件 =>${file_name} 到 ${file_path} 目录中`);
                    } else {
                        $.log(`开始保存文件 =>${file_name} 到项目顶级目录中`);
                    }

                    // 调用封装好的函数下载并保存文件
                    downloadAndSaveFile($, file_id, file_name, directory, userId);
                } else {
                    $.log(`文件 ${file_name} 不符合保存条件（非.js或.db结尾）`);
                    $.bot.sendMessage(userId, `文件 *${file_name}* 不符合保存条件（非.js或.db结尾）`, $.defTgMsgForm);
                }
            }
        }
    );

    // 监听回调查询
    $.bot.on('callback_query', async (query) => {
        try {
            const data = query.data;
            const chatId = query.message.chat.id;
            const userId = query.from.id;

            if (data.startsWith('showMyChannle_')) {
                try {
                    // 从 bot_groups 表中获取用户的群组和频道
                    const db = require('../db/index');
                    const [userGroups] = await db.execute('SELECT * FROM bot_groups WHERE userId = ?', [userId]);

                    if (userGroups.length === 0) {
                        try {
                            await $.bot.answerCallbackQuery(query.id, {
                                text: '您还没有添加任何群组或频道',
                                show_alert: true
                            });
                        } catch (err) {
                            // 忽略回调超时错误
                            if (!err.message.includes('query is too old')) {
                                $.log(`回答回调失败: ${err.message}`, 'error');
                            }
                        }
                        return;
                    }

                    let message = '您的群组和频道：\n\n';
                    let keyboard = { inline_keyboard: [] };

                    userGroups.forEach((group, index) => {
                        message += `${index + 1}. ${group.groupName || '未知名称'} (${group.type})\n`;
                        message += `   ID: ${group.groupId}\n\n`;
                        
                        // 为每个群组添加管理按钮
                        keyboard.inline_keyboard.push([
                            {
                                text: `管理 ${group.groupName || '未知名称'}`,
                                callback_data: `manageGroup_${group.groupId}`
                            }
                        ]);
                    });

                    message += '您可以在管理后台查看和管理这些群组：\n';
                    message += 'http://localhost:3003/bot-groups';

                    await $.bot.sendMessage(chatId, message, {
                        parse_mode: 'Markdown',
                        reply_markup: JSON.stringify(keyboard)
                    });
                    try {
                        await $.bot.answerCallbackQuery(query.id);
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                } catch (error) {
                    $.log(`处理查看频道回调失败: ${error.message}`, 'error');
                    try {
                        await $.bot.answerCallbackQuery(query.id, {
                            text: '获取群组列表失败',
                            show_alert: true
                        });
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                }
            }

            // 群组管理回调
            if (data.startsWith('manageGroup_')) {
                try {
                    const groupId = data.replace('manageGroup_', '');
                    const db = require('../db/index');
                    const [groups] = await db.execute('SELECT * FROM bot_groups WHERE groupId = ? AND userId = ?', [groupId, userId]);

                    if (groups.length === 0) {
                        try {
                            await $.bot.answerCallbackQuery(query.id, {
                                text: '群组不存在或您没有权限管理此群组',
                                show_alert: true
                            });
                        } catch (err) {
                            // 忽略回调超时错误
                            if (!err.message.includes('query is too old')) {
                                $.log(`回答回调失败: ${err.message}`, 'error');
                            }
                        }
                        return;
                    }

                    const group = groups[0];
                    let message = `群组管理：${group.groupName || '未知名称'}\n\n`;
                    message += `类型：${group.type}\n`;
                    message += `ID：${group.groupId}\n`;
                    message += `状态：${group.disabled ? '已禁用' : '正常'}\n`;
                    message += `添加时间：${group.createTime}\n`;

                    // 如果群组被禁用，添加提示信息
                    if (group.disabled) {
                        message += `\n🔒 你当前群组权限以及功能被禁用\n`;
                    }

                    // 检查用户权限
                    const hasAdminPermission = await dbm.hasPermission(userId, 2); // 权限级别2是管理员级别
                    
                    let keyboard = { inline_keyboard: [] };
                    
                    // 只有群组未被禁用时，才显示关注主播按钮
                    if (!group.disabled) {
                        keyboard.inline_keyboard.push([
                            {
                                text: '关注主播',
                                callback_data: `followVtb_${groupId}`
                            }
                        ]);
                    }
                    
                    // 添加返回上一条消息按钮
                    keyboard.inline_keyboard.push([
                        {
                            text: '返回上一条消息',
                            callback_data: `backToPrevious_${groupId}`
                        }
                    ]);
                    
                    // 只有管理员可以禁用/启用群组
                    if (hasAdminPermission) {
                        keyboard.inline_keyboard.push([
                            {
                                text: group.disabled ? '启用群组' : '禁用群组',
                                callback_data: `toggleGroupStatus_${groupId}`
                            }
                        ]);
                    }

                    // 在当前消息上修改，显示群组管理信息
                    try {
                        await $.bot.editMessageText(message, {
                            chat_id: chatId,
                            message_id: query.message.message_id,
                            parse_mode: 'Markdown',
                            reply_markup: JSON.stringify(keyboard)
                        });
                    } catch (err) {
                        // 如果修改消息失败，发送新消息作为备选
                        if (err.message.includes('message can\'t be edited')) {
                            await $.bot.sendMessage(chatId, message, {
                                parse_mode: 'Markdown',
                                reply_markup: JSON.stringify(keyboard)
                            });
                        } else {
                            $.log(`修改消息失败: ${err.message}`, 'error');
                        }
                    }
                    try {
                        await $.bot.answerCallbackQuery(query.id);
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                } catch (error) {
                    $.log(`处理群组管理回调失败: ${error.message}`, 'error');
                    try {
                        await $.bot.answerCallbackQuery(query.id, {
                            text: '群组管理失败',
                            show_alert: true
                        });
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                }
            }

            // 切换群组状态回调
            if (data.startsWith('toggleGroupStatus_')) {
                try {
                    const groupId = data.replace('toggleGroupStatus_', '');
                    const db = require('../db/index');
                    const [groups] = await db.execute('SELECT * FROM bot_groups WHERE groupId = ? AND userId = ?', [groupId, userId]);

                    if (groups.length === 0) {
                        try {
                            await $.bot.answerCallbackQuery(query.id, {
                                text: '群组不存在或您没有权限管理此群组',
                                show_alert: true
                            });
                        } catch (err) {
                            // 忽略回调超时错误
                            if (!err.message.includes('query is too old')) {
                                $.log(`回答回调失败: ${err.message}`, 'error');
                            }
                        }
                        return;
                    }

                    const group = groups[0];
                    const newStatus = !group.disabled;

                    // 更新群组状态
                    await db.execute('UPDATE bot_groups SET disabled = ? WHERE groupId = ?', [newStatus, groupId]);

                    // 如果是禁用群组，同时禁用该群组的所有关注
                    // 如果是启用群组，同时启用该群组的所有关注
                    if (newStatus) {
                        // 新状态是禁用，将所有关注标记为禁用
                        await db.execute('UPDATE watch SET disabled = 1 WHERE chatid = ?', [groupId]);
                    } else {
                        // 新状态是启用，将所有关注标记为启用
                        await db.execute('UPDATE watch SET disabled = 0 WHERE chatid = ?', [groupId]);
                    }

                    try {
                        await $.bot.answerCallbackQuery(query.id, {
                            text: `群组已${newStatus ? '禁用' : '启用'}，同时${newStatus ? '禁用' : '恢复'}了所有关注`,
                            show_alert: true
                        });
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }

                    // 修改当前消息，更新群组状态
                    const [updatedGroups] = await db.execute('SELECT * FROM bot_groups WHERE groupId = ?', [groupId]);
                    if (updatedGroups.length > 0) {
                        const updatedGroup = updatedGroups[0];
                        let message = `群组管理：${updatedGroup.groupName || '未知名称'}\n\n`;
                        message += `类型：${updatedGroup.type}\n`;
                        message += `ID：${updatedGroup.groupId}\n`;
                        message += `状态：${updatedGroup.disabled ? '已禁用' : '正常'}\n`;
                        message += `添加时间：${updatedGroup.createTime}\n`;

                        // 检查用户权限
                        const hasAdminPermission = await dbm.hasPermission(userId, 2); // 权限级别2是管理员级别
                        
                        let keyboard = { inline_keyboard: [] };
                        
                        // 添加关注主播按钮
                        keyboard.inline_keyboard.push([
                            {
                                text: '关注主播',
                                callback_data: `followVtb_${groupId}`
                            }
                        ]);
                        
                        // 添加返回上一条消息按钮
                        keyboard.inline_keyboard.push([
                            {
                                text: '返回上一条消息',
                                callback_data: `backToPrevious_${groupId}`
                            }
                        ]);
                        
                        // 只有管理员可以禁用/启用群组
                        if (hasAdminPermission) {
                            keyboard.inline_keyboard.push([
                                {
                                    text: updatedGroup.disabled ? '启用群组' : '禁用群组',
                                    callback_data: `toggleGroupStatus_${groupId}`
                                }
                            ]);
                        }

                        try {
                            // 修改当前消息，而不是发送新消息
                            await $.bot.editMessageText(message, {
                                chat_id: chatId,
                                message_id: query.message.message_id,
                                parse_mode: 'Markdown',
                                reply_markup: JSON.stringify(keyboard)
                            });
                        } catch (err) {
                            // 如果修改消息失败，发送新消息作为备选
                            if (err.message.includes('message can\'t be edited')) {
                                await $.bot.sendMessage(chatId, message, {
                                    parse_mode: 'Markdown',
                                    reply_markup: JSON.stringify(keyboard)
                                });
                            } else {
                                $.log(`修改消息失败: ${err.message}`, 'error');
                            }
                        }
                    }
                } catch (error) {
                    $.log(`处理切换群组状态回调失败: ${error.message}`, 'error');
                    try {
                        await $.bot.answerCallbackQuery(query.id, {
                            text: '切换群组状态失败',
                            show_alert: true
                        });
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                }
            }

            // 查看群组监控回调
            if (data.startsWith('viewGroupWatch_')) {
                try {
                    const groupId = data.replace('viewGroupWatch_', '');
                    const db = require('../db/index');
                    const [groups] = await db.execute('SELECT * FROM bot_groups WHERE groupId = ? AND userId = ?', [groupId, userId]);

                    if (groups.length === 0) {
                        try {
                            await $.bot.answerCallbackQuery(query.id, {
                                text: '群组不存在或您没有权限管理此群组',
                                show_alert: true
                            });
                        } catch (err) {
                            // 忽略回调超时错误
                            if (!err.message.includes('query is too old')) {
                                $.log(`回答回调失败: ${err.message}`, 'error');
                            }
                        }
                        return;
                    }

                    // 这里可以添加获取群组监控列表的逻辑
                    // 暂时返回一个提示
                    try {
                        await $.bot.answerCallbackQuery(query.id, {
                            text: '查看监控功能开发中',
                            show_alert: true
                        });
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                } catch (error) {
                    $.log(`处理查看群组监控回调失败: ${error.message}`, 'error');
                    try {
                        await $.bot.answerCallbackQuery(query.id, {
                            text: '查看监控失败',
                            show_alert: true
                        });
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                }
            }

            // 返回上一条消息回调
            if (data.startsWith('backToPrevious_')) {
                try {
                    const groupId = data.replace('backToPrevious_', '');
                    const db = require('../db/index');
                    
                    // 从 bot_groups 表中获取用户的群组和频道
                    const [userGroups] = await db.execute('SELECT * FROM bot_groups WHERE userId = ?', [userId]);

                    if (userGroups.length === 0) {
                        try {
                            await $.bot.answerCallbackQuery(query.id, {
                                text: '您还没有添加任何群组或频道',
                                show_alert: true
                            });
                        } catch (err) {
                            // 忽略回调超时错误
                            if (!err.message.includes('query is too old')) {
                                $.log(`回答回调失败: ${err.message}`, 'error');
                            }
                        }
                        return;
                    }

                    let message = '您的群组和频道：\n\n';
                    let keyboard = { inline_keyboard: [] };

                    userGroups.forEach((group, index) => {
                        message += `${index + 1}. ${group.groupName || '未知名称'} (${group.type})\n`;
                        message += `   ID: ${group.groupId}\n\n`;
                        
                        // 为每个群组添加管理按钮
                        keyboard.inline_keyboard.push([
                            {
                                text: `管理 ${group.groupName || '未知名称'}`,
                                callback_data: `manageGroup_${group.groupId}`
                            }
                        ]);
                    });

                    message += '您可以在管理后台查看和管理这些群组：\n';
                    message += 'http://localhost:3003/bot-groups';

                    // 在当前消息上修改，显示群组列表
                    try {
                        await $.bot.editMessageText(message, {
                            chat_id: chatId,
                            message_id: query.message.message_id,
                            parse_mode: 'Markdown',
                            reply_markup: JSON.stringify(keyboard)
                        });
                    } catch (err) {
                        // 如果修改消息失败，发送新消息作为备选
                        if (err.message.includes('message can\'t be edited')) {
                            await $.bot.sendMessage(chatId, message, {
                                parse_mode: 'Markdown',
                                reply_markup: JSON.stringify(keyboard)
                            });
                        } else {
                            $.log(`修改消息失败: ${err.message}`, 'error');
                        }
                    }
                    
                    try {
                        await $.bot.answerCallbackQuery(query.id);
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                } catch (error) {
                    $.log(`处理返回上一条消息回调失败: ${error.message}`, 'error');
                    try {
                        await $.bot.answerCallbackQuery(query.id, {
                            text: '返回失败',
                            show_alert: true
                        });
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                }
            }

            // 关注主播回调
            if (data.startsWith('followVtb_')) {
                try {
                    const groupId = data.replace('followVtb_', '');
                    const db = require('../db/index');
                    const [groups] = await db.execute('SELECT * FROM bot_groups WHERE groupId = ? AND userId = ?', [groupId, userId]);

                    if (groups.length === 0) {
                        try {
                            await $.bot.answerCallbackQuery(query.id, {
                                text: '群组不存在或您没有权限管理此群组',
                                show_alert: true
                            });
                        } catch (err) {
                            // 忽略回调超时错误
                            if (!err.message.includes('query is too old')) {
                                $.log(`回答回调失败: ${err.message}`, 'error');
                            }
                        }
                        return;
                    }

                    // 从vtbs表中获取liveStatus不等于0且不等于1的主播
                    const [vtbs] = await db.execute('SELECT id, username, roomid, mid, liveStatus FROM vtbs WHERE liveStatus != ? AND liveStatus != ? LIMIT 10', ['0', '1']);

                    $.log(`获取到的主播数量: ${vtbs.length}`, 'info');
                    vtbs.forEach((vtb, index) => {
                        $.log(`主播${index + 1}: ${vtb.username}, liveStatus: ${vtb.liveStatus}`, 'info');
                    });

                    if (vtbs.length === 0) {
                        try {
                            await $.bot.answerCallbackQuery(query.id, {
                                text: '没有符合条件的主播',
                                show_alert: true
                            });
                        } catch (err) {
                            // 忽略回调超时错误
                            if (!err.message.includes('query is too old')) {
                                $.log(`回答回调失败: ${err.message}`, 'error');
                            }
                        }
                        return;
                    }

                    // 生成主播列表按钮
                    let message = '请选择要关注的主播：\n\n';
                    let keyboard = { inline_keyboard: [] };

                    // 为每个主播添加关注/取消关注按钮
                    for (let i = 0; i < vtbs.length; i++) {
                        const vtb = vtbs[i];
                        // 检查该群组是否已经关注了该主播
                        const [existingWatch] = await db.execute('SELECT id FROM watch WHERE chatid = ? AND mid = ?', [groupId, vtb.mid || vtb.id]);
                        const isFollowing = existingWatch.length > 0;
                        
                        // 添加emoji表情
                        const emoji = isFollowing ? '✅ ' : '🔴 ';
                        message += `${i + 1}. ${emoji}${vtb.username || '未知主播'}\n`;
                        message += `   房间ID: ${vtb.roomid}\n\n`;
                        
                        // 为每个主播添加关注/取消关注按钮
                        keyboard.inline_keyboard.push([
                            {
                                text: isFollowing ? `取消关注 ${vtb.username || '未知主播'}` : `关注 ${vtb.username || '未知主播'}`,
                                callback_data: `toggleFollowVtb_${groupId}_${vtb.roomid}_${isFollowing ? 'unfollow' : 'follow'}`
                            }
                        ]);
                    }
                    
                    // 添加返回按钮
                    keyboard.inline_keyboard.push([
                        {
                            text: '返回群组管理',
                            callback_data: `manageGroup_${groupId}`
                        }
                    ]);

                    message += '点击按钮关注对应主播 ';


                    // 在当前消息上修改，显示主播列表
                    try {
                        await $.bot.editMessageText(message, {
                            chat_id: chatId,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: JSON.stringify(keyboard)
                        });
                    } catch (err) {
                        // 如果修改消息失败，发送新消息作为备选
                        if (err.message.includes('message can\'t be edited')) {
                            await $.bot.sendMessage(chatId, message, {
                                parse_mode: 'HTML',
                                reply_markup: JSON.stringify(keyboard)
                            });
                        } else {
                            $.log(`修改消息失败: ${err.message}`, 'error');
                        }
                    }

                    try {
                        await $.bot.answerCallbackQuery(query.id);
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                } catch (error) {
                    $.log(`处理关注主播回调失败: ${error.message}`, 'error');
                    try {
                        await $.bot.answerCallbackQuery(query.id, {
                            text: '关注主播失败',
                            show_alert: true
                        });
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                }
            }

            // 关注/取消关注主播回调
            if (data.startsWith('toggleFollowVtb_')) {
                try {
                    const parts = data.replace('toggleFollowVtb_', '').split('_');
                    const groupId = parts[0];
                    const vtbId = parts[1];
                    const action = parts[2];

                    const db = require('../db/index');
                    const [groups] = await db.execute('SELECT * FROM bot_groups WHERE groupId = ? AND userId = ?', [groupId, userId]);

                    if (groups.length === 0) {
                        try {
                            await $.bot.answerCallbackQuery(query.id, {
                                text: '群组不存在或您没有权限管理此群组',
                                show_alert: true
                            });
                        } catch (err) {
                            // 忽略回调超时错误
                            if (!err.message.includes('query is too old')) {
                                $.log(`回答回调失败: ${err.message}`, 'error');
                            }
                        }
                        return;
                    }

                    // 从vtbs表中获取主播信息（使用mid字段查询）
                    const [vtbs] = await db.execute('SELECT username, roomid FROM vtbs WHERE mid = ?', [vtbId]);
                    if (vtbs.length === 0) {
                        try {
                            await $.bot.answerCallbackQuery(query.id, {
                                text: '主播不存在',
                                show_alert: true
                            });
                        } catch (err) {
                            // 忽略回调超时错误
                            if (!err.message.includes('query is too old')) {
                                $.log(`回答回调失败: ${err.message}`, 'error');
                            }
                        }
                        return;
                    }

                    const vtb = vtbs[0];
                    const username = vtb.username || '未知主播';
                    const roomId = vtb.roomid;

                    if (action === 'follow') {
                        // 关注主播，添加到watch表
                        await db.execute('INSERT INTO watch (chatid, mid) VALUES (?, ?)', [groupId, vtbId]);
                    } else {
                        // 取消关注主播，从watch表删除
                        await db.execute('DELETE FROM watch WHERE chatid = ? AND mid = ?', [groupId, vtbId]);
                    }

                    // 重新生成主播列表，更新按钮状态
                    const [allVtbs] = await db.execute('SELECT id, username, roomid, mid, liveStatus FROM vtbs WHERE liveStatus != ? AND liveStatus != ? LIMIT 10', ['0', '1']);
                    
                    let message = '请选择要关注的主播：\n\n';
                    let keyboard = { inline_keyboard: [] };

                    // 为每个主播添加关注/取消关注按钮
                    for (let i = 0; i < allVtbs.length; i++) {
                        const v = allVtbs[i];
                        // 检查该群组是否已经关注了该主播
                        const [existingWatch] = await db.execute('SELECT id FROM watch WHERE chatid = ? AND mid = ?', [groupId, v.mid || v.id]);
                        const isFollowing = existingWatch.length > 0;
                        
                        // 添加emoji表情
                        const emoji = isFollowing ? '✅ ' : '🔴 ';
                        message += `${i + 1}. ${emoji}${v.username || '未知主播'}\n`;
                        message += `   房间ID: ${v.roomid}\n\n`;
                        
                        // 为每个主播添加关注/取消关注按钮
                        keyboard.inline_keyboard.push([
                            {
                                text: isFollowing ? `取消关注 ${v.username || '未知主播'}` : `关注 ${v.username || '未知主播'}`,
                                callback_data: `toggleFollowVtb_${groupId}_${v.roomid}_${isFollowing ? 'unfollow' : 'follow'}`
                            }
                        ]);
                    }
                    
                    // 添加返回按钮
                    keyboard.inline_keyboard.push([
                        {
                            text: '返回群组管理',
                            callback_data: `manageGroup_${groupId}`
                        }
                    ]);

                    message += '点击按钮关注对应主播     这主播列表已关注的加一个emoji，没关注也加一个emoji';


                    // 修改当前消息，更新按钮状态
                    try {
                        await $.bot.editMessageText(message, {
                            chat_id: chatId,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: JSON.stringify(keyboard)
                        });
                    } catch (err) {
                        // 如果修改消息失败，发送新消息作为备选
                        if (err.message.includes('message can\'t be edited')) {
                            await $.bot.sendMessage(chatId, message, {
                                parse_mode: 'HTML',
                                reply_markup: JSON.stringify(keyboard)
                            });
                        } else {
                            $.log(`修改消息失败: ${err.message}`, 'error');
                        }
                    }

                    // 显示操作成功提示
                    try {
                        await $.bot.answerCallbackQuery(query.id, {
                            text: action === 'follow' ? `已关注主播 ${username}` : `已取消关注主播 ${username}`,
                            show_alert: true
                        });
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                } catch (error) {
                    $.log(`处理关注/取消关注主播回调失败: ${error.message}`, 'error');
                    try {
                        await $.bot.answerCallbackQuery(query.id, {
                            text: '操作失败',
                            show_alert: true
                        });
                    } catch (err) {
                        // 忽略回调超时错误
                        if (!err.message.includes('query is too old')) {
                            $.log(`回答回调失败: ${err.message}`, 'error');
                        }
                    }
                }
            }
        } catch (error) {
            // 全局错误捕获，避免机器人崩溃
            // 忽略回调超时错误
            if (!error.message.includes('query is too old') && !error.message.includes('BUTTON_DATA_INVALID')) {
                $.log(`处理回调时出错: ${error.message}`, 'error');
            } else {
                // 忽略这些常见的可忽略错误
                $.log(`[忽略的错误] ${error.message}`, 'warn');
            }
        }
    });

    $.log("频道模块加载完毕。。。");
}


// 定义一个函数来处理视频消息的保存
const handleVideoMessage = async ($, dbm, msg, messageType) => {
    const video = msg.video;
    let file_name = video.file_name;
    if (msg.caption !== null) {
        file_name = msg.caption;
    }
    const thumbnail = video.thumbnail.file_id;
    const file_id = video.file_id;
    const caption = msg.caption ? msg.caption.replace("🔎 已上传影视搜索: @LunTan", "").replace("🔍已上传影视搜索： @LunTan", "") : "";
    let saveVideo = 1;
    const result = await dbm.addMessages(file_id, file_name, thumbnail, caption, messageType, JSON.stringify(msg));
    if (result) {
        $.log('保存video消息成功 =【' + file_name + '】');
        let faBuCallbackData = 'faBu_' + msg.chat.id  + '_-1003000233318';
        let keyboard = {
            inline_keyboard: [
                [{text: '一键发布', callback_data: faBuCallbackData},
                    {text: '删除消息', callback_data: 'delete_message'},]
            ]
        };
        $.bot.sendMessage(msg.chat.id,
             `保存${messageType === '3movie' ? '电影' : '视频'}成功【${file_name}】`,
            {
                parse_mode: 'Markdown',
                reply_markup: JSON.stringify(keyboard)
            });
    } else {
        $.log('保存video消息失败 =【' + file_name + '】', 'error');
        $.bot.sendMessage(msg.chat.id, `保存${messageType === '3movie' ? '电影' : '视频'}失败【${file_name}】`);
        saveVideo = 0;
    }
    if (saveVideo) {
        // $.bot.deleteMessage(msg.chat.id, msg.message_id);
    }
};
