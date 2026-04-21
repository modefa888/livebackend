/**
 * 命令服务层 - 统一的命令注册和管理服务
 * 
 * 该服务层提供：
 * 1. 命令注册和管理
 * 2. 命令权限控制
 * 3. 命令帮助生成
 * 4. 命令执行日志
 */

class CommandService {
    constructor($, messageService, permissionService) {
        this.$ = $;
        this.messageService = messageService;
        this.permissionService = permissionService;
        this.commands = new Map(); // 命令注册表
        this.commandHandlers = new Map(); // 命令处理器
        this.commandHelp = new Map(); // 命令帮助信息
    }

    /**
     * 注册命令
     * @param {string} command - 命令名称（不带/）
     * @param {Function} handler - 命令处理器
     * @param {object} options - 命令选项
     * @param {number} options.permissionLevel - 需要的权限等级（默认1）
     * @param {string} options.description - 命令描述
     * @param {string} options.usage - 命令用法
     * @param {string} options.category - 命令分类
     * @param {boolean} options.hidden - 是否在帮助中隐藏
     */
    register(command, handler, options = {}) {
        const defaultOptions = {
            permissionLevel: 1,
            description: '',
            usage: `/${command}`,
            category: 'general',
            hidden: false
        };

        const mergedOptions = { ...defaultOptions, ...options };

        this.commands.set(command, mergedOptions);
        this.commandHandlers.set(command, handler);

        if (!mergedOptions.hidden) {
            this.commandHelp.set(command, mergedOptions);
        }

        this.$.log(`命令注册成功: /${command}`, 'info');
    }

    /**
     * 注销命令
     * @param {string} command - 命令名称
     */
    unregister(command) {
        this.commands.delete(command);
        this.commandHandlers.delete(command);
        this.commandHelp.delete(command);
    }

    /**
     * 执行命令
     * @param {string} command - 命令名称
     * @param {object} msg - Telegram消息对象
     * @param {Array} args - 命令参数
     */
    async execute(command, msg, args = []) {
        const commandInfo = this.commands.get(command);
        const handler = this.commandHandlers.get(command);

        if (!commandInfo || !handler) {
            await this.messageService.sendText(msg.chat.id, `未知命令: /${command}\n请使用 /help 查看可用命令。`);
            return;
        }

        // 检查权限
        const userId = msg.from.id;
        const hasPermission = await this.permissionService.checkPermission(userId, commandInfo.permissionLevel);

        if (!hasPermission) {
            await this.messageService.sendTemplate(msg.chat.id, 'noPermission');
            return;
        }

        // 检查频率限制
        const rateLimit = this.messageService.checkRateLimit(userId);
        if (!rateLimit.allowed) {
            await this.messageService.sendTemplate(msg.chat.id, 'rateLimit');
            return;
        }

        try {
            // 执行命令
            await handler(msg, args, {
                messageService: this.messageService,
                permissionService: this.permissionService,
                $: this.$
            });
        } catch (error) {
            this.$.log(`执行命令 /${command} 失败: ${error.message}`, 'error');
            await this.messageService.sendText(msg.chat.id, `执行命令失败: ${error.message}`);
        }
    }

    /**
     * 解析命令
     * @param {string} text - 消息文本
     * @returns {object|null} - 解析结果 { command, args }
     */
    parseCommand(text) {
        if (!text || !text.startsWith('/')) return null;

        const parts = text.split(' ');
        const command = parts[0].substring(1).split('@')[0]; // 移除/和@botname
        const args = parts.slice(1).filter(arg => arg.trim() !== '');

        return { command, args };
    }

    /**
     * 生成帮助文本
     * @param {string} category - 分类筛选（可选）
     * @returns {string} - 帮助文本
     */
    generateHelp(category = null) {
        const { stripIndent } = require('common-tags');
        
        let helpText = '⚙️ 功能菜单 | Command Center\n\n';
        
        // 按分类组织命令
        const categories = new Map();
        
        for (const [command, info] of this.commandHelp) {
            if (category && info.category !== category) continue;
            
            if (!categories.has(info.category)) {
                categories.set(info.category, []);
            }
            categories.get(info.category).push({ command, ...info });
        }

        // 分类显示
        const categoryNames = {
            general: '📋 通用命令',
            monitor: '👁️ 监控命令',
            admin: '🔐 管理命令',
            tools: '🛠️ 工具命令',
            fun: '🎮 娱乐命令'
        };

        for (const [cat, commands] of categories) {
            helpText += `${categoryNames[cat] || cat}:\n`;
            commands.forEach(cmd => {
                helpText += `/${cmd.command} — ${cmd.description}\n`;
            });
            helpText += '\n';
        }

        helpText += '💡 提示：所有命令均支持快捷操作，点击即可执行。';
        
        return helpText;
    }

    /**
     * 获取命令列表（用于BotFather）
     * @returns {Array} - 命令列表
     */
    getCommandList() {
        const list = [];
        for (const [command, info] of this.commandHelp) {
            list.push({
                command: command,
                description: info.description
            });
        }
        return list;
    }

    /**
     * 设置命令到BotFather
     */
    async setCommands() {
        if (!this.$.bot) return;

        try {
            const commands = this.getCommandList();
            await this.$.bot.setMyCommands(commands, {
                scope: { type: 'all_private_chats' }
            });
            this.$.log('命令列表已更新到BotFather', 'info');
        } catch (error) {
            this.$.log(`更新命令列表失败: ${error.message}`, 'error');
        }
    }

    /**
     * 注册基础命令
     */
    registerBaseCommands() {
        // /start 命令
        this.register('start', async (msg, args, { messageService }) => {
            const username = this.$.parseTgUserNickname(msg.from);
            await messageService.sendTemplate(msg.chat.id, 'welcome', username);
        }, {
            description: '激活机器人，开启智能助手之旅',
            category: 'general'
        });

        // /help 命令
        this.register('help', async (msg, args, { messageService }) => {
            const helpText = this.generateHelp();
            await messageService.sendText(msg.chat.id, helpText);
        }, {
            description: '查看完整命令列表与使用指南',
            category: 'general'
        });

        // /status 命令
        this.register('status', async (msg, args, { messageService }) => {
            const statusText = this.generateStatusText();
            await messageService.sendText(msg.chat.id, statusText);
        }, {
            description: '查看机器人运行状态',
            category: 'general'
        });
    }

    /**
     * 生成状态文本
     * @returns {string} - 状态文本
     */
    generateStatusText() {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        
        return stripIndent`
            🤖 机器人状态
            
            ⏱️ 运行时间: ${hours}小时${minutes}分钟
            📊 内存使用: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
            📝 注册命令: ${this.commands.size}个
            
            ✅ 机器人运行正常
        `;
    }

    /**
     * 初始化命令监听
     */
    initCommandListener() {
        this.$.bot.on('text', async (msg) => {
            const parsed = this.parseCommand(msg.text);
            if (!parsed) return;

            await this.execute(parsed.command, msg, parsed.args);
        });

        this.$.log('命令监听器已初始化', 'info');
    }
}

module.exports = CommandService;
