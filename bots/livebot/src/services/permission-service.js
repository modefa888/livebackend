/**
 * 权限服务层 - 统一的用户权限管理服务
 * 
 * 该服务层提供：
 * 1. 用户权限验证
 * 2. 权限等级管理
 * 3. 管理员功能
 * 4. 新用户处理
 */

class PermissionService {
    constructor($, dbm) {
        this.$ = $;
        this.dbm = dbm;
        this.pendingApprovals = new Map(); // 待审批的新用户
    }

    /**
     * 检查用户权限
     * @param {number|string} userId - 用户ID
     * @param {number} requiredLevel - 需要的权限等级（默认1）
     * @returns {Promise<boolean>} - 是否有权限
     */
    async checkPermission(userId, requiredLevel = 1) {
        if (!this.dbm) return false;
        
        try {
            const user = await this.dbm.getUserByUserId(userId);
            if (!user) return false;
            
            return user.permissionLevel >= requiredLevel;
        } catch (error) {
            this.$.log(`检查权限失败: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * 获取用户权限等级
     * @param {number|string} userId - 用户ID
     * @returns {Promise<number|null>} - 权限等级，无用户返回null
     */
    async getPermissionLevel(userId) {
        if (!this.dbm) return null;
        
        try {
            const user = await this.dbm.getUserByUserId(userId);
            return user ? user.permissionLevel : null;
        } catch (error) {
            this.$.log(`获取权限等级失败: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * 检查用户是否存在
     * @param {number|string} userId - 用户ID
     * @returns {Promise<boolean>} - 是否存在
     */
    async userExists(userId) {
        if (!this.dbm) return false;
        
        try {
            const user = await this.dbm.getUserByUserId(userId);
            return !!user;
        } catch (error) {
            this.$.log(`检查用户存在失败: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * 添加新用户
     * @param {number|string} userId - 用户ID
     * @param {number|string} fromId - 来源ID
     * @param {number} permissionLevel - 权限等级（默认0）
     * @param {string} username - 用户名
     * @param {string} type - 用户类型（默认'user'）
     * @returns {Promise<boolean>} - 是否添加成功
     */
    async addUser(userId, fromId, permissionLevel = 0, username = null, type = 'user') {
        if (!this.dbm) return false;
        
        try {
            const result = await this.dbm.addUser(userId, fromId, permissionLevel, username, type);
            return result === 1;
        } catch (error) {
            this.$.log(`添加用户失败: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * 更新用户权限等级
     * @param {number|string} userId - 用户ID
     * @param {number} newLevel - 新的权限等级
     * @returns {Promise<boolean>} - 是否更新成功
     */
    async updatePermissionLevel(userId, newLevel) {
        if (!this.dbm) return false;
        
        try {
            const result = await this.dbm.updateUserPermissionLevel(userId, newLevel);
            return result === 1;
        } catch (error) {
            this.$.log(`更新权限等级失败: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * 获取所有管理员
     * @param {number} minLevel - 最小权限等级（默认2）
     * @returns {Promise<Array>} - 管理员列表
     */
    async getAdmins(minLevel = 2) {
        if (!this.dbm) return [];
        
        try {
            const users = await this.dbm.getUser();
            return users.filter(user => user.permissionLevel >= minLevel);
        } catch (error) {
            this.$.log(`获取管理员列表失败: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * 处理新用户加入
     * @param {object} msg - Telegram消息对象
     * @param {object} messageService - 消息服务实例
     * @returns {Promise<boolean>} - 处理结果
     */
    async handleNewUser(msg, messageService) {
        const userId = msg.from.id;
        const username = this.$.parseTgUserNickname(msg.from);
        const chatId = msg.chat.id;
        
        // 检查用户是否已存在
        const exists = await this.userExists(userId);
        if (exists) {
            return true; // 用户已存在，无需处理
        }
        
        // 添加到待审批列表
        this.pendingApprovals.set(userId, {
            username,
            chatId,
            timestamp: Date.now()
        });
        
        // 通知管理员有新用户
        await this.notifyAdminsNewUser(userId, username, chatId, messageService);
        
        return false; // 用户未授权
    }

    /**
     * 通知管理员有新用户
     * @param {number|string} userId - 用户ID
     * @param {string} username - 用户名
     * @param {number|string} chatId - 聊天ID
     * @param {object} messageService - 消息服务实例
     */
    async notifyAdminsNewUser(userId, username, chatId, messageService) {
        const admins = await this.getAdmins();
        
        const keyboard = [
            [
                { text: '✅ 批准', callback_data: `approve_${userId}` },
                { text: '❌ 拒绝', callback_data: `reject_${userId}` }
            ]
        ];
        
        const message = `门外有一个小朋友，没有密码。\n他(她)是：${username}\nID：\`${userId}\``;
        
        for (const admin of admins) {
            try {
                await messageService.sendWithKeyboard(admin.userId, message, keyboard, {
                    parse_mode: 'Markdown'
                });
            } catch (error) {
                this.$.log(`通知管理员 ${admin.userId} 失败: ${error.message}`, 'warn');
            }
        }
    }

    /**
     * 批准用户加入
     * @param {number|string} userId - 用户ID
     * @param {object} messageService - 消息服务实例
     * @returns {Promise<boolean>} - 是否批准成功
     */
    async approveUser(userId, messageService) {
        const pending = this.pendingApprovals.get(userId);
        if (!pending) return false;
        
        // 添加用户到数据库，权限等级设为1
        const success = await this.addUser(
            userId, 
            userId, 
            1, 
            pending.username, 
            'user'
        );
        
        if (success) {
            // 从待审批列表移除
            this.pendingApprovals.delete(userId);
            
            // 通知用户已被批准
            await messageService.sendTemplate(userId, 'welcome', pending.username);
            
            this.$.log(`用户 ${pending.username} (${userId}) 已被批准加入`, 'info');
        }
        
        return success;
    }

    /**
     * 拒绝用户加入
     * @param {number|string} userId - 用户ID
     * @returns {Promise<boolean>} - 是否拒绝成功
     */
    async rejectUser(userId) {
        const pending = this.pendingApprovals.get(userId);
        if (!pending) return false;
        
        // 从待审批列表移除
        this.pendingApprovals.delete(userId);
        
        this.$.log(`用户 ${pending.username} (${userId}) 已被拒绝加入`, 'info');
        return true;
    }

    /**
     * 创建权限检查中间件
     * @param {number} requiredLevel - 需要的权限等级
     * @param {object} messageService - 消息服务实例
     * @returns {Function} - 中间件函数
     */
    createPermissionMiddleware(requiredLevel = 1, messageService) {
        return async (msg, next) => {
            const userId = msg.from.id;
            const chatId = msg.chat.id;
            
            // 检查用户是否存在
            const exists = await this.userExists(userId);
            
            if (!exists) {
                // 新用户，处理加入请求
                await this.handleNewUser(msg, messageService);
                await messageService.sendTemplate(chatId, 'noPermission');
                return;
            }
            
            // 检查权限
            const hasPermission = await this.checkPermission(userId, requiredLevel);
            
            if (!hasPermission) {
                await messageService.sendTemplate(chatId, 'noPermission');
                return;
            }
            
            // 有权限，继续执行
            await next(msg);
        };
    }

    /**
     * 清理过期的待审批用户
     * @param {number} maxAgeMs - 最大保留时间（默认24小时）
     */
    cleanupPendingApprovals(maxAgeMs = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        
        for (const [userId, data] of this.pendingApprovals.entries()) {
            if (now - data.timestamp > maxAgeMs) {
                this.pendingApprovals.delete(userId);
                this.$.log(`清理过期待审批用户: ${userId}`, 'info');
            }
        }
    }
}

module.exports = PermissionService;
