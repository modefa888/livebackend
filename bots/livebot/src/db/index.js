const mysql = require('mysql2/promise');
const { loadConfigFromDB } = require('../../config');
const $ = require("../config/includes");

const cgOperations = require('./tables/livebot_cg');
const vtbsOperations = require('./tables/vtbs');
const messagesOperations = require('./tables/messages');
const usersOperations = require('./tables/users');
const watchOperations = require('./tables/watch');
const settingsOperations = require('./tables/settings');
const weimiOperations = require('./tables/weimi');
const douyinFDOperations = require('./tables/douyinFD');
const liveHistoryOperations = require('./tables/liveHistory');
const modulePermissionsOperations = require('./tables/modulePermissions');
const monitorStatsOperations = require('./tables/monitorStats');
const botGuardSettingsOperations = require('./tables/botGuardSettings');

let pool = null;
let isInitialized = false;

const initialize = async () => {
    if (isInitialized) {
        return;
    }
    try {
        const config = await loadConfigFromDB();
        pool = mysql.createPool(config[config.environment].mysql);
        
        cgOperations.setPool(pool);
        vtbsOperations.setPool(pool, $);
        messagesOperations.setPool(pool);
        usersOperations.setPool(pool, $);
        watchOperations.setPool(pool, $);
        settingsOperations.setPool(pool, $);
        weimiOperations.setPool(pool, $);
        douyinFDOperations.setPool(pool, $);
        liveHistoryOperations.setPool(pool, $);
        modulePermissionsOperations.setPool(pool, $);
        monitorStatsOperations.setPool(pool, $);
        botGuardSettingsOperations.setPool(pool, $);
        
        isInitialized = true;
    } catch (error) {
        console.error('初始化数据库失败:', error);
        throw error;
    }
};

const testConnection = async () => {
    await initialize();
    let connection;
    try {
        connection = await pool.getConnection();
        $.log('成功连接到 MySQL 数据库', 'info');
        return true;
    } catch (error) {
        $.log(`MySQL 连接失败: ${error.message}`, 'error');
        return false;
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const addInitData = async (config, userId) => {
    await initialize();
    try {
        const inserts = [
            { userId, key: "rateLimit", value: config.rateLimit, status: 1 },
            { userId, key: "interval", value: config.interval, status: 1 },
            { userId, key: "site", value: '#', status: 1 },
            { userId, key: "count", value: 0, status: 1 },
            { userId, key: "cg", value: config.cgSite, status: 1 },
            { userId, key: "19", value: config.s19Site, status: 1 },
            { userId, key: "scheduleTime", value: config.scheduleTime, status: 1 }
        ];

        const results = await Promise.all(inserts.map(data => settingsOperations.addSetting(data.userId, data.key, data.value, data.status)));
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
};

const getPool = async () => {
    await initialize();
    return pool;
};

const execute = async (sql, params) => {
    await initialize();
    const connection = await pool.getConnection();
    try {
        return await connection.execute(sql, params);
    } finally {
        connection.release();
    }
};

module.exports = {
    addInitData,
    testConnection,
    getPool,
    execute,
    ...cgOperations,
    ...vtbsOperations,
    ...messagesOperations,
    ...usersOperations,
    ...watchOperations,
    ...settingsOperations,
    ...weimiOperations,
    ...douyinFDOperations,
    ...liveHistoryOperations,
    ...modulePermissionsOperations,
    ...monitorStatsOperations,
    ...botGuardSettingsOperations,
};
