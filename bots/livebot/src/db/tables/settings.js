// +++++++++++++++++++++++++++
// 吃瓜数据表
// ___________________________

// 创建数据库连接池
let pool = '';
let $ = '';

function setPool(tpool, $1) {
    pool = tpool;
    $ = $1;
}

// 添加设置
const addSetting = (userId, key, value, status = 1) => {
    const sql = 'INSERT INTO settings (userId, `key`, value, status) VALUES (?, ?, ?, ?)';
    return pool.query(sql, [userId, key, value, status])
        .then(() => {
            $.emitter.emit('updateSettings');
            return true;
        })
        .catch((err) => {
            return false; // 添加设置失败
        });
};


// 获取设置 -- 根据userId查询
const getUserSettings = (userId) => {
    const sql = 'SELECT * FROM settings WHERE userId = ?';
    return pool.execute(sql, [userId])
        .then(results => results[0])
        .catch(() => false);
};

// 验证是否存在
const existsSettings = (userId, key) => {
    const sql = 'SELECT * FROM settings WHERE userId = ? and key =?';
    return pool.execute(sql, [userId, key])
        .then(() => true)
        .catch(() => false);
}

// 根据key获取对应的value配置
const getSettings = (key) => {
    const sql = 'SELECT value FROM settings WHERE `key` = ?';
    return pool.execute(sql, [key])
        .then(results => results[0][0])
        .catch(() => false);
}

// 更新设置的状态
const updateSettingStatus = (settingId, userId, status) => {
    const sql = 'UPDATE settings SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?';
    return pool.execute(sql, [status, settingId, userId])
        .then(result => {
            $.emitter.emit('updateSettings');
            return result[0].affectedRows > 0
        })
        .catch(() => false);
};

// 更新设置的值
const updateSettingValue2 = (id, userId, value) => {
    const sql = 'UPDATE settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?';
    return pool.execute(sql, [value, id, userId])
        .then(result => {
            $.emitter.emit('updateSettings');
            return result[0].affectedRows > 0
        })
        .catch(() => false);
};

// 更新设置的值
const updateSettingValue = (key, value) => {
    const sql = 'UPDATE settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE `key` = ?';
    return pool.execute(sql, [value, key])
        .then(() => true)
        .catch(() => false);
}

// 根据settingId和userId删除设置
const deleteSettingById = (settingId, userId) => {
    const sql = 'DELETE FROM settings WHERE id = ? AND userId = ?';
    return pool.execute(sql, [settingId, userId])
        .then(result => result[0].affectedRows > 0)
        .catch(() => false);
};

// 导出CRUD操作
module.exports = {
    setPool,
    addSetting,
    getUserSettings,
    existsSettings,
    getSettings,
    updateSettingStatus,
    updateSettingValue2,
    updateSettingValue,
    deleteSettingById,
};
