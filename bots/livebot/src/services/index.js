/**
 * 服务层索引文件
 * 
 * 集中导出所有服务，方便其他模块使用
 */

const MessageService = require('./message-service');
const PermissionService = require('./permission-service');
const CommandService = require('./command-service');

/**
 * 服务管理器 - 统一管理所有服务实例
 */
class ServiceManager {
    constructor() {
        this.services = {};
    }

    /**
     * 初始化所有服务
     * @param {object} $ - 全局对象
     * @param {object} dbm - 数据库管理器
     */
    initialize($, dbm) {
        this.services.message = new MessageService($, dbm);
        this.services.permission = new PermissionService($, dbm);
        this.services.command = new CommandService($, this.services.message, this.services.permission);

        // 将服务管理器挂载到全局对象
        $.services = this.services;

        return this.services;
    }

    /**
     * 获取服务实例
     * @param {string} name - 服务名称
     */
    get(name) {
        return this.services[name];
    }

    /**
     * 获取消息服务
     */
    get message() {
        return this.services.message;
    }

    /**
     * 获取权限服务
     */
    get permission() {
        return this.services.permission;
    }

    /**
     * 获取命令服务
     */
    get command() {
        return this.services.command;
    }
}

module.exports = {
    ServiceManager,
    MessageService,
    PermissionService,
    CommandService
};
