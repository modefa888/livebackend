// setting.js - 机器人设置管理模块 (更新版 - 支持消息编辑)
// ==========================================

module.exports = function($, dbm) {
    // 检查管理员权限的中间件
    const checkPermissionAdmin = (handler) => {
        return async (msg, match) => {
            try {
                const userId = msg.from.id;
                if (!dbm.hasPermission(userId, 2)) { // 假设权限级别1是管理用户的最低权限
                    await $.bot.sendMessage(msg.chat.id, '🔒您没有权限执行此操作。');
                    return;
                }
                await handler(msg, match);
            } catch (error) {
                console.error('权限检查时出错:', error);
                await $.bot.sendMessage(msg.chat.id, '⚠️ 处理请求时发生错误');
            }
        };
    };

    // 状态管理 - 用于跟踪用户当前正在进行的操作
    const userStates = new Map();

    // 跟踪当前活跃跃的消息ID，用于更新消息而不是发送新消息
    const activeMessages = new Map();

    // 每页显示的设置项数量
    const ITEMS_PER_PAGE = 5;

    // 初始化设置管理
    function init() {
        registerCommands();
        registerCallbackHandlers();
        setupInputHandlers();
        $.log("✅ 设置模块加载完毕");
    }

    // 注册命令处理器
    function registerCommands() {
        // 主设置命令
        $.bot.onText(/^\/settings$/, checkPermissionAdmin(async (msg) => {
            // 发送新消息前先删除之前的活跃消息
            clearActiveMessage(msg.chat.id);
            await showMainMenu(msg.chat.id);
        }));

        // 设置列表命令
        $.bot.onText(/^\/settings list$/, checkPermissionAdmin(async (msg) => {
            // 发送新消息前先删除之前的活跃消息
            clearActiveMessage(msg.chat.id);
            await showSettingsList(msg.chat.id, 1);
        }));

        // 添加设置命令
        $.bot.onText(/^\/settings add$/, checkPermissionAdmin(async (msg) => {
            // 发送新消息前先删除之前的活跃消息
            clearActiveMessage(msg.chat.id);
            await startAddSettingProcess(msg.chat.id, msg.from.id);
        }));

        // 编辑设置命令
        $.bot.onText(/^\/settings edit (.+)$/, checkPermissionAdmin(async (msg, match) => {
            const key = match[1];
            // 发送新消息前先删除之前的活跃消息
            clearActiveMessage(msg.chat.id);
            await startEditSettingProcess(msg.chat.id, msg.from.id, key);
        }));

        // 切换设置状态命令
        $.bot.onText(/^\/settings toggle (.+)$/, checkPermissionAdmin(async (msg, match) => {
            const key = match[1];
            await toggleSettingStatus(msg.chat.id, key);
        }));

        // 删除设置命令
        $.bot.onText(/^\/settings delete (.+)$/, checkPermissionAdmin(async (msg, match) => {
            const key = match[1];
            await confirmDeleteSetting(msg.chat.id, key);
        }));
    }

    // 注册回调处理器
    function registerCallbackHandlers() {
        $.bot.on('callback_query', async (callbackQuery) => {
            const msg = callbackQuery.message;
            const data = callbackQuery.data;
            const chatId = msg.chat.id;
            const userId = callbackQuery.from.id;
            const messageId = msg.message_id;

            try {
                $.log('收到回调数据:', data);

                // 直接解析回调数据
                if (data === 'show_settings_list') {
                    await showSettingsList(chatId, 1, messageId);
                }
                else if (data === 'add_new_setting') {
                    // 发送新消息前先删除之前的活跃消息
                    clearActiveMessage(chatId);
                    await startAddSettingProcess(chatId, userId);
                }
                else if (data === 'search_setting') {
                    await $.bot.sendMessage(chatId, '🔍 搜索功能正在开发中...');
                }
                else if (data.startsWith('settings_list_')) {
                    const page = parseInt(data.split('_')[2]) || 1;
                    await showSettingsList(chatId, page, messageId);
                }
                else if (data.startsWith('toggle_setting_')) {
                    const key = data.split('_')[2];
                    await toggleSettingStatus(chatId, key, messageId);
                }
                else if (data.startsWith('edit_setting_')) {
                    const key = data.split('_')[2];
                    // 发送新消息前先删除之前的活跃消息
                    clearActiveMessage(chatId);
                    await startEditSettingProcess(chatId, userId, key);
                }
                else if (data.startsWith('delete_setting_')) {
                    const key = data.split('_')[2];
                    await confirmDeleteSetting(chatId, key, messageId);
                }
                else if (data.startsWith('confirm_delete_')) {
                    const key = data.split('_')[2];
                    await executeDeleteSetting(chatId, key, messageId);
                }
                else if (data === 'cancel') {
                    // 清除用户状态
                    userStates.delete(userId);
                    // 发送新消息前先删除之前的活跃消息
                    clearActiveMessage(chatId);
                    await showMainMenu(chatId);
                }
                else if (data === 'back_to_menu') {
                    // 发送新消息前先删除之前的活跃消息
                    clearActiveMessage(chatId);
                    await showMainMenu(chatId);
                }

                // 确认回调
                await $.bot.answerCallbackQuery(callbackQuery.id);
            } catch (error) {
                console.error('处理回调时出错:', error);
                await $.bot.sendMessage(chatId, '⚠️ 处理请求时发生错误');
            }
        });
    }

    // 监听用户输入，处理设置流程
    function setupInputHandlers() {
        $.bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const text = msg.text;

            // 检查用户是否处于某个设置流程中
            if (userStates.has(userId)) {
                const state = userStates.get(userId);

                try {
                    switch(state.step) {
                        case 'add_key':
                            // 用户正在输入新设置的键
                            // 验证键名格式
                            if (!/^[a-zA-Z0-9_]+$/.test(text)) {
                                await $.bot.sendMessage(chatId, `❌ 键名格式无效，请使用字母、数字和下划线。`, {
                                    reply_markup: {
                                        inline_keyboard: [
                                            [{ text: '❌ 取消', callback_data: 'cancel' }]
                                        ]
                                    }
                                });
                                return;
                            }

                            userStates.set(userId, {
                                ...state,
                                key: text,
                                step: 'add_value'
                            });
                            await $.bot.sendMessage(chatId, `请输入设置值：`, {
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: '❌ 取消', callback_data: 'cancel' }]
                                    ]
                                }
                            });
                            break;

                        case 'add_value':
                            // 用户正在输入新设置的值
                            userStates.delete(userId);
                            await addNewSetting(chatId, state.key, text);
                            break;

                        case 'edit_value':
                            // 用户正在输入编辑后的值
                            userStates.delete(userId);
                            await updateSettingValue(chatId, state.key, text);
                            break;
                    }
                } catch (error) {
                    console.error('处理用户输入时出错:', error);
                    userStates.delete(userId);
                    await $.bot.sendMessage(chatId, '⚠️ 处理输入时发生错误');
                    // 发送新消息前先删除之前的活跃消息
                    clearActiveMessage(chatId);
                    await showMainMenu(chatId);
                }
            }
        });
    }

    // 显示主菜单
    async function showMainMenu(chatId) {
        try {
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📋 查看设置列表', callback_data: 'show_settings_list' }
                    ],
                    [
                        { text: '➕ 添加新设置', callback_data: 'add_new_setting' }
                    ],
                    [
                        { text: '🔍 搜索设置', callback_data: 'search_setting' }
                    ]
                ]
            };

            const result = await $.bot.sendMessage(chatId, `
📌 <b>设置管理中心</b>

请选择操作：
            `, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });

            // 保存当前活跃消息ID
            setActiveMessage(chatId, result.message_id);
        } catch (error) {
            console.error('显示主菜单时出错:', error);
            await $.bot.sendMessage(chatId, '⚠️ 显示菜单时发生错误');
        }
    }

    // 显示设置列表
    async function showSettingsList(chatId, page = 1, messageId = null) {
        try {
            // 获取当前用户的所有设置
            const settings = await dbm.getUserSettings(chatId);

            if (!settings || settings.length === 0) {
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '➕ 添加新设置', callback_data: 'add_new_setting' }
                        ],
                        [
                            { text: '🔙 返回菜单', callback_data: 'back_to_menu' }
                        ]
                    ]
                };

                const message = `
⚠️ <b>没有找到设置项</b>

您目前还没有任何设置，请添加新的设置。
                `;

                if (messageId) {
                    // 更新现有消息
                    await $.bot.editMessageText(message, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    });
                } else {
                    // 发送新消息
                    const result = await $.bot.sendMessage(chatId, message, {
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    });
                    // 保存当前活跃消息ID
                    setActiveMessage(chatId, result.message_id);
                }

                return;
            }

            // 分页处理
            const startIndex = (page - 1) * ITEMS_PER_PAGE;
            const endIndex = startIndex + ITEMS_PER_PAGE;
            const paginatedSettings = settings.slice(startIndex, endIndex);
            const totalPages = Math.ceil(settings.length / ITEMS_PER_PAGE);

            // 构建消息内容
            let message = `<b>📋 设置列表 (第 ${page}/${totalPages} 页)</b>\n\n`;

            paginatedSettings.forEach(setting => {
                const statusIcon = setting.status ? '✅' : '❌';
                message += `${statusIcon} <code>${setting.key}</code> = <code>${setting.value}</code>\n`;
            });

            // 构建键盘
            const keyboard = [];

            // 添加设置项操作按钮
            paginatedSettings.forEach(setting => {
                keyboard.push([
                    { text: `${setting.status ? '🔴 禁用' : '🟢 启用'}`, callback_data: `toggle_setting_${setting.key}` },
                    { text: '✏️ 编辑', callback_data: `edit_setting_${setting.key}` },
                    { text: '🗑️ 删除', callback_data: `delete_setting_${setting.key}` }
                ]);
            });

            // 添加分页按钮
            const paginationRow = [];

            if (page > 1) {
                paginationRow.push({ text: '⬅️ 上一页', callback_data: `settings_list_${page - 1}` });
            }

            paginationRow.push({ text: `🏠 主页`, callback_data: 'back_to_menu' });

            if (page < totalPages) {
                paginationRow.push({ text: '下一页 ➡️', callback_data: `settings_list_${page + 1}` });
            }

            keyboard.push(paginationRow);

            const options = {
                chat_id: chatId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            };

            if (messageId) {
                // 更新现有消息
                options.message_id = messageId;
                await $.bot.editMessageText(message, options);
            } else {
                // 发送新消息
                const result = await $.bot.sendMessage(chatId, message, options);
                // 保存当前活跃消息ID
                setActiveMessage(chatId, result.message_id);
            }
        } catch (error) {
            console.error('获取设置列表时出错:', error);
            await $.bot.sendMessage(chatId, '⚠️ 获取设置列表时发生错误');
        }
    }

    // 开始添加设置流程
    async function startAddSettingProcess(chatId, userId) {
        try {
            // 设置用户状态
            userStates.set(userId, {
                step: 'add_key',
                chatId: chatId
            });

            await $.bot.sendMessage(chatId, `
➕ <b>添加新设置</b>

请输入设置的键名：
（例如：site, rateLimit, scheduleTime）
            `, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ 取消', callback_data: 'cancel' }]
                    ]
                }
            });
        } catch (error) {
            console.error('开始添加设置流程时出错:', error);
            await $.bot.sendMessage(chatId, '⚠️ 开始添加设置时发生错误');
        }
    }

    // 添加新设置
    async function addNewSetting(chatId, key, value) {
        try {
            // 检查键名是否已存在
            const exists = await dbm.existsSettings(chatId, key);

            if (exists) {
                return await $.bot.sendMessage(chatId, `
❌ <b>添加失败</b>

键名 <code>${key}</code> 已存在，请使用不同的键名。
                `, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 返回菜单', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            }

            // 添加新设置
            const result = await dbm.addSetting(chatId, key, value, 1);

            if (result) {
                await $.bot.sendMessage(chatId, `
✅ <b>添加成功</b>

新设置已添加：
键名：<code>${key}</code>
值：<code>${value}</code>
状态：已启用
                `, { parse_mode: 'HTML' });

                // 更新设置列表（使用当前活跃消息ID）
                const messageId = getActiveMessage(chatId);
                await showSettingsList(chatId, 1, messageId);
            } else {
                await $.bot.sendMessage(chatId, `
❌ <b>添加失败</b>

添加设置时发生错误，请稍后再试。
                `, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 返回菜单', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            }
        } catch (error) {
            console.error('添加设置时出错:', error);
            await $.bot.sendMessage(chatId, '⚠️ 添加设置时发生错误');
        }
    }

    // 开始编辑设置流程
    async function startEditSettingProcess(chatId, userId, key) {
        try {
            // 获取设置
            const settings = await dbm.getUserSettings(chatId);
            const setting = settings.find(s => s.key === key);

            if (!setting) {
                return await $.bot.sendMessage(chatId, `
❌ <b>未找到设置</b>

键名 <code>${key}</code> 不存在。
                `, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 返回菜单', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            }

            // 设置用户状态
            userStates.set(userId, {
                step: 'edit_value',
                chatId: chatId,
                key: key
            });

            await $.bot.sendMessage(chatId, `
✏️ <b>编辑设置</b>

当前设置：
键名：<code>${setting.key}</code>
当前值：<code>${setting.value}</code>
状态：${setting.status ? '✅ 已启用' : '❌ 已禁用'}

请输入新值：
            `, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ 取消', callback_data: 'cancel' }]
                    ]
                }
            });
        } catch (error) {
            console.error('开始编辑设置时出错:', error);
            await $.bot.sendMessage(chatId, '⚠️ 开始编辑设置时发生错误');
        }
    }

    // 更新设置值
    async function updateSettingValue(chatId, key, value) {
        try {
            // 获取设置
            const settings = await dbm.getUserSettings(chatId);
            const setting = settings.find(s => s.key === key);

            if (!setting) {
                return await $.bot.sendMessage(chatId, `
❌ <b>更新失败</b>

键名 <code>${key}</code> 不存在。
                `, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 返回菜单', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            }

            // 更新设置值
            const result = await dbm.updateSettingValue2(setting.id, chatId, value);

            if (result) {
                await $.bot.sendMessage(chatId, `
✅ <b>更新成功</b>

设置已更新：
键名：<code>${key}</code>
新值：<code>${value}</code>
                `, { parse_mode: 'HTML' });

                // 更新设置列表（使用当前活跃消息ID）
                const messageId = getActiveMessage(chatId);
                await showSettingsList(chatId, 1, messageId);
            } else {
                await $.bot.sendMessage(chatId, `
❌ <b>更新失败</b>

更新设置时发生错误，请稍后再试。
                `, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 返回菜单', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            }
        } catch (error) {
            console.error('更新设置时出错:', error);
            await $.bot.sendMessage(chatId, '⚠️ 更新设置时发生错误');
        }
    }

    // 切换设置状态
    async function toggleSettingStatus(chatId, key, messageId = null) {
        try {
            // 获取设置
            const settings = await dbm.getUserSettings(chatId);
            const setting = settings.find(s => s.key === key);

            if (!setting) {
                return await $.bot.sendMessage(chatId, `
❌ <b>操作失败</b>

键名 <code>${key}</code> 不存在。
                `, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 返回菜单', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            }

            // 切换状态
            const newStatus = setting.status ? 0 : 1;
            const result = await dbm.updateSettingStatus(setting.id, chatId, newStatus);

            if (result) {
                await $.bot.sendMessage(chatId, `
✅ <b>状态已更新</b>

设置 <code>${key}</code> 已${newStatus ? '启用' : '禁用'}。
                `, { parse_mode: 'HTML' });

                // 更新设置列表（使用当前活跃消息ID或传入的messageId）
                const currentMessageId = messageId || getActiveMessage(chatId);
                if (currentMessageId) {
                    await showSettingsList(chatId, 1, currentMessageId);
                }
            } else {
                await $.bot.sendMessage(chatId, `
❌ <b>更新失败</b>

更新设置状态时发生错误，请稍后再试。
                `, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 返回菜单', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            }
        } catch (error) {
            console.error('切换设置状态时出错:', error);
            await $.bot.sendMessage(chatId, '⚠️ 切换设置状态时发生错误');
        }
    }

    // 确认删除设置
    async function confirmDeleteSetting(chatId, key, messageId = null) {
        try {
            // 获取设置
            const settings = await dbm.getUserSettings(chatId);
            const setting = settings.find(s => s.key === key);

            if (!setting) {
                return await $.bot.sendMessage(chatId, `
❌ <b>操作失败</b>

键名 <code>${key}</code> 不存在。
                `, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 返回菜单', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            }

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚠️ 确认删除', callback_data: `confirm_delete_${key}` },
                        { text: '❌ 取消', callback_data: 'back_to_menu' }
                    ]
                ]
            };

            const message = `
🗑️ <b>确认删除</b>

您确定要删除设置 <code>${key}</code> 吗？
此操作无法撤销！
            `;

            if (messageId) {
                // 更新现有消息
                await $.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            } else {
                // 发送新消息
                await $.bot.sendMessage(chatId, message, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            }
        } catch (error) {
            console.error('确认删除设置时出错:', error);
            await $.bot.sendMessage(chatId, '⚠️ 确认删除设置时发生错误');
        }
    }

    // 执行删除设置
    async function executeDeleteSetting(chatId, key, messageId = null) {
        try {
            // 获取设置
            const settings = await dbm.getUserSettings(chatId);
            const setting = settings.find(s => s.key === key);

            if (!setting) {
                return await $.bot.sendMessage(chatId, `
❌ <b>删除失败</b>

键名 <code>${key}</code> 不存在。
                `, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 返回菜单', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            }

            // 执行删除
            const result = await dbm.deleteSettingById(setting.id, chatId);

            if (result) {
                await $.bot.sendMessage(chatId, `
✅ <b>删除成功</b>

设置 <code>${key}</code> 已成功删除。
                `, { parse_mode: 'HTML' });

                // 更新设置列表（使用当前活跃消息ID或传入的messageId）
                const currentMessageId = messageId || getActiveMessage(chatId);
                if (currentMessageId) {
                    await showSettingsList(chatId, 1, currentMessageId);
                }
            } else {
                await $.bot.sendMessage(chatId, `
❌ <b>删除失败</b>

删除设置时发生错误，请稍后再试。
                `, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 返回菜单', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
            }
        } catch (error) {
            console.error('删除设置时出错:', error);
            await $.bot.sendMessage(chatId, '⚠️ 删除设置时发生错误');
        }
    }

    // 设置当前活跃消息ID
    function setActiveMessage(chatId, messageId) {
        activeMessages.set(chatId, messageId);
    }

    // 获取当前活跃消息ID
    function getActiveMessage(chatId) {
        return activeMessages.get(chatId);
    }

    // 清除当前活跃消息
    async function clearActiveMessage(chatId) {
        const messageId = getActiveMessage(chatId);
        if (messageId) {
            try {
                // 尝试删除消息
                await $.bot.deleteMessage(chatId, messageId);
            } catch (error) {
                console.warn('删除消息时出错:', error);
            }
            // 无论删除成功与否，都清除记录
            activeMessages.delete(chatId);
        }
    }

    // 初始化模块
    init();
};
