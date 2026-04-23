let pool = null;
let $ = null;

function setPool(tpool, $1) {
    pool = tpool;
    $ = $1;
}

const getAllSettings = () => {
    if (!pool) {
        console.warn('botGuardSettings: pool is not initialized');
        return Promise.resolve([]);
    }
    const sql = 'SELECT * FROM bot_guard_settings ORDER BY bot_name';
    return pool.execute(sql)
        .then(results => results[0])
        .catch(() => []);
};

const getSettingByBotName = (botName) => {
    if (!pool) {
        console.warn('botGuardSettings: pool is not initialized');
        return Promise.resolve(null);
    }
    const sql = 'SELECT * FROM bot_guard_settings WHERE bot_name = ?';
    return pool.execute(sql, [botName])
        .then(results => results[0][0] || null)
        .catch(() => null);
};

const updateSetting = (botName, settings) => {
    if (!pool) {
        console.warn('botGuardSettings: pool is not initialized');
        return Promise.resolve(false);
    }
    const { health_check_interval, auto_restart_interval, auto_restart_enabled, enabled, max_restart_attempts } = settings;
    const sql = `UPDATE bot_guard_settings 
                 SET health_check_interval = ?, 
                     auto_restart_interval = ?, 
                     auto_restart_enabled = ?, 
                     enabled = ?, 
                     max_restart_attempts = ?,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE bot_name = ?`;
    return pool.execute(sql, [health_check_interval, auto_restart_interval, auto_restart_enabled, enabled, max_restart_attempts, botName])
        .then(result => result[0].affectedRows > 0)
        .catch(() => false);
};

const incrementRestartCount = (botName) => {
    if (!pool) {
        console.warn('botGuardSettings: pool is not initialized');
        return Promise.resolve(false);
    }
    const sql = 'UPDATE bot_guard_settings SET restart_count = restart_count + 1, last_restart_at = CURRENT_TIMESTAMP WHERE bot_name = ?';
    return pool.execute(sql, [botName])
        .then(result => result[0].affectedRows > 0)
        .catch(() => false);
};

const updateRestartBackoff = (botName, backoff) => {
    if (!pool) {
        console.warn('botGuardSettings: pool is not initialized');
        return Promise.resolve(false);
    }
    const sql = 'UPDATE bot_guard_settings SET restart_backoff = ? WHERE bot_name = ?';
    return pool.execute(sql, [backoff, botName])
        .then(result => result[0].affectedRows > 0)
        .catch(() => false);
};

const resetRestartCount = (botName) => {
    if (!pool) {
        console.warn('botGuardSettings: pool is not initialized');
        return Promise.resolve(false);
    }
    const sql = 'UPDATE bot_guard_settings SET restart_count = 0, restart_backoff = 0 WHERE bot_name = ?';
    return pool.execute(sql, [botName])
        .then(result => result[0].affectedRows > 0)
        .catch(() => false);
};

module.exports = {
    setPool,
    getAllSettings,
    getSettingByBotName,
    updateSetting,
    incrementRestartCount,
    updateRestartBackoff,
    resetRestartCount
};