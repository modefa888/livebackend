const mysql = require('mysql2/promise');
const config = require('../../config'); // Adjust the path as needed
const $ = require("../config/includes"); // Adjust the path as needed

const cgOperations = require('./tables/livebot_cg');
const vtbsOperations = require('./tables/vtbs');
const messagesOperations = require('./tables/messages');
const usersOperations = require('./tables/users');
const watchOperations = require('./tables/watch');
const settingsOperations = require('./tables/settings');
const weimiOperations = require('./tables/weimi');
const sendsOperations = require('./tables/livebot_sends');
const douyinFDOperations = require('./tables/douyinFD');
const liveHistoryOperations = require('./tables/liveHistory');


// 创建数据库连接池
const pool = mysql.createPool(config[config.environment].mysql);

// 数据库连接测试方法
const testConnection = async () => {
    let connection;
    try {
        // 尝试获取连接
        connection = await pool.getConnection();
        $.log('成功连接到 MySQL 数据库', 'info');
        return true;
    } catch (error) {
        $.log(`MySQL 连接失败: ${error.message}`, 'error');
        return false;
    } finally {
        // 确保连接释放（无论成功失败）
        if (connection) {
            connection.release();
        }
    }
};

cgOperations.setPool(pool);
vtbsOperations.setPool(pool, $);
messagesOperations.setPool(pool);
usersOperations.setPool(pool, $);
watchOperations.setPool(pool, $);
settingsOperations.setPool(pool, $);
weimiOperations.setPool(pool, $);
sendsOperations.setPool(pool, $);
douyinFDOperations.setPool(pool, $);
liveHistoryOperations.setPool(pool, $);


const addInitData = async (config, userId) => {
    try {
        // 合并所有的 INSERT 数据到一个数组中
        const inserts = [
            { userId, key: "rateLimit", value: config.rateLimit, status: 1 },
            { userId, key: "interval", value: config.interval, status: 1 },
            { userId, key: "site", value: '#', status: 1 },
            { userId, key: "count", value: 0, status: 1 },
            { userId, key: "cg", value: config.cgSite, status: 1 },
            { userId, key: "19", value: config.s19Site, status: 1 },
            { userId, key: "scheduleTime", value: config.scheduleTime, status: 1 }
        ];

        // 使用 Promise.all 来异步执行所有的 INSERT 操作
        const results = await Promise.all(inserts.map(data => settingsOperations.addSetting(data.userId, data.key, data.value, data.status)));
        // 检查是否有任何操作失败
        if (results.some(result => !result)) {
            $.log('settings 初始化失败', 'error');
            return false;
        }
        $.emitter.emit('updateSettings');
        return true;
    } catch (e) {
        $.log(e.message, 'error');
        return false;
    }
}


module.exports = {
    addInitData,
    testConnection,
    ...cgOperations,
    ...vtbsOperations,
    ...messagesOperations,
    ...usersOperations,
    ...watchOperations,
    ...settingsOperations,
    ...weimiOperations,
    ...sendsOperations,
    ...douyinFDOperations,
    ...liveHistoryOperations,

}
