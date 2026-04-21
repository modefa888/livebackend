/**
 * 消息服务层 - 统一的消息发送和管理服务
 * 
 * 该服务层提供：
 * 1. 统一的消息发送接口
 * 2. 消息记录功能
 * 3. 错误处理和重试机制
 * 4. 消息格式化工具
 */

const { stripIndent } = require('common-tags');

class MessageService {
    constructor($, dbm) {
        this.$ = $;
        this.dbm = dbm;
        this.rateLimitMap = new Map(); // 频率限制缓存
        this.defaultOptions = {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        };
    }

    /**
     * 发送文本消息
     * @param {number|string} chatId - 目标聊天ID
     * @param {string} text - 消息文本
     * @param {object} options - 发送选项
     * @returns {Promise<object>} - 发送结果
     */
    async sendText(chatId, text, options = {}) {
        try {
            const mergedOptions = { ...this.defaultOptions, ...options };
            const result = await this.$.bot.sendMessage(chatId, text, mergedOptions);
            
            // 记录发送消息
            await this.recordMessage(chatId, text, 'text');
            
            return result;
        } catch (error) {
            return this.handleSendError(error, chatId, 'text');
        }
    }

    /**
     * 发送带内联键盘的消息
     * @param {number|string} chatId - 目标聊天ID
     * @param {string} text - 消息文本
     * @param {array} keyboard - 键盘按钮数组
     * @param {object} options - 发送选项
     */
    async sendWithKeyboard(chatId, text, keyboard, options = {}) {
        const replyMarkup = {
            inline_keyboard: keyboard
        };
        
        return this.sendText(chatId, text, {
            ...options,
            reply_markup: JSON.stringify(replyMarkup)
        });
    }

    /**
     * 发送照片
     * @param {number|string} chatId - 目标聊天ID
     * @param {string} photoUrl - 照片URL或file_id
     * @param {string} caption - 照片说明
     * @param {object} options - 发送选项
     */
    async sendPhoto(chatId, photoUrl, caption = '', options = {}) {
        try {
            const result = await this.$.bot.sendPhoto(chatId, photoUrl, {
                caption,
                parse_mode: 'Markdown',
                ...options
            });
            
            await this.recordMessage(chatId, `photo: ${photoUrl}`, 'photo');
            return result;
        } catch (error) {
            return this.handleSendError(error, chatId, 'photo');
        }
    }

    /**
     * 发送视频
     * @param {number|string} chatId - 目标聊天ID
     * @param {string} videoUrl - 视频URL或file_id
     * @param {string} caption - 视频说明
     * @param {object} options - 发送选项
     */
    async sendVideo(chatId, videoUrl, caption = '', options = {}) {
        try {
            const result = await this.$.bot.sendVideo(chatId, videoUrl, {
                caption,
                parse_mode: 'Markdown',
                ...options
            });
            
            await this.recordMessage(chatId, `video: ${videoUrl}`, 'video');
            return result;
        } catch (error) {
            return this.handleSendError(error, chatId, 'video');
        }
    }

    /**
     * 发送通知给管理员
     * @param {string} message - 通知消息
     * @param {object} options - 发送选项
     */
    async notifyAdmins(message, options = {}) {
        if (!this.dbm) return;
        
        try {
            const admins = await this.dbm.getUser();
            const adminList = admins.filter(user => user.permissionLevel >= 2);
            
            const sendPromises = adminList.map(admin => 
                this.sendText(admin.userId, message, options).catch(() => null)
            );
            
            await Promise.all(sendPromises);
        } catch (error) {
            this.$.log(`通知管理员失败: ${error.message}`, 'error');
        }
    }

    /**
     * 发送模板消息
     * @param {number|string} chatId - 目标聊天ID
     * @param {string} templateName - 模板名称
     * @param {object} data - 模板数据
     */
    async sendTemplate(chatId, templateName, data = {}) {
        const templates = {
            welcome: (user) => stripIndent`
                嗨，${user}
                您可以输入 /help 查看命令帮助。
            `,
            help: () => stripIndent`
                ⚙️ 功能菜单 | Command Center

                🚀 /start — 激活机器人，开启智能助手之旅  
                ❓ /help — 查看完整命令列表与使用指南
                ➕ /add — 添加新主播至监控列表
                📋 /list — 查看当前监控的所有主播
                🗑️ /del — 从监控列表中删除主播
                🌐 /online — 查看当前在线的主播列表
                📊 /status — 查看机器人运行状态
                
                💡 提示：所有命令均支持快捷操作，点击即可执行。
            `,
            noPermission: () => '🚪对不起，您没有权限执行此操作。',
            rateLimit: () => '对不起，您的操作过于频繁。请稍后再试。',
            newUser: (username, userId) => stripIndent`
                门外有一个小朋友，没有密码。
                他(她)是：${username}
                ID：\`${userId}\`
            `
        };

        const template = templates[templateName];
        if (!template) {
            throw new Error(`未知的消息模板: ${templateName}`);
        }

        const text = template(data);
        return this.sendText(chatId, text);
    }

    /**
     * 记录发送的消息到数据库
     * @param {number|string} target - 目标ID
     * @param {string} content - 消息内容
     * @param {string} type - 消息类型
     */
    async recordMessage(target, content, type) {
        if (!this.dbm || !this.dbm.addSendMessage) return;
        
        try {
            await this.dbm.addSendMessage({
                target: target.toString(),
                content: content.substring(0, 500), // 限制长度
                type: type
            });
        } catch (error) {
            // 记录失败不影响消息发送
            this.$.log(`记录消息失败: ${error.message}`, 'warn');
        }
    }

    /**
     * 处理发送错误
     * @param {Error} error - 错误对象
     * @param {number|string} chatId - 目标聊天ID
     * @param {string} type - 消息类型
     */
    handleSendError(error, chatId, type) {
        // 检查是否是已知的可忽略错误
        let errorMessage = '';
        
        // 尝试从不同的错误结构中获取错误信息
        if (error.code === 'ETELEGRAM' && error.response?.body) {
            errorMessage = error.response.body.description || '';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        const ignorableErrors = [
            'chat not found',
            'bot was blocked',
            'user is deactivated',
            'Forbidden',
            'query is too old',
            'BUTTON_DATA_INVALID'
        ];
        
        if (ignorableErrors.some(err => errorMessage.includes(err))) {
            this.$.log(`发送${type}消息失败[可忽略]: ${errorMessage} (chatId: ${chatId})`, 'warn');
            return null;
        }
        
        // 其他错误抛出
        throw error;
    }

    /**
     * 检查频率限制
     * @param {number|string} userId - 用户ID
     * @param {number} limit - 限制次数（默认5次）
     * @param {number} windowMs - 时间窗口（默认60000ms = 1分钟）
     */
    checkRateLimit(userId, limit = 5, windowMs = 60000) {
        const now = Date.now();
        const userLimit = this.rateLimitMap.get(userId);
        
        if (!userLimit || now - userLimit.lastReset > windowMs) {
            // 新窗口或重置
            this.rateLimitMap.set(userId, {
                count: 1,
                lastReset: now
            });
            return { allowed: true, remaining: limit - 1 };
        }
        
        if (userLimit.count >= limit) {
            return { 
                allowed: false, 
                remaining: 0,
                retryAfter: Math.ceil((userLimit.lastReset + windowMs - now) / 1000)
            };
        }
        
        userLimit.count++;
        return { allowed: true, remaining: limit - userLimit.count };
    }

    /**
     * 清理过期的频率限制记录
     */
    cleanupRateLimit() {
        const now = Date.now();
        const windowMs = 60000;
        
        for (const [userId, data] of this.rateLimitMap.entries()) {
            if (now - data.lastReset > windowMs) {
                this.rateLimitMap.delete(userId);
            }
        }
    }
}

module.exports = MessageService;
