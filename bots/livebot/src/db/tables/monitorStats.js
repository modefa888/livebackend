// +++++++++++++++++++++++++++
// 监控统计表
// ___________________________

// 创建数据库连接池
let pool = '';

function setPool(tpool) {
    pool = tpool;
}

// 封装CRUD操作
const addMonitorStats = (startTime, endTime, elapsedTime, totalCount, successCount, successRate, onlineCount, offlineCount, nonStreamerCount) => {
    const sql = `
        INSERT INTO monitorStats (startTime, endTime, elapsedTime, totalCount, successCount, successRate, onlineCount, offlineCount, nonStreamerCount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    return pool.execute(sql, [startTime, endTime, elapsedTime, totalCount, successCount, successRate, onlineCount, offlineCount, nonStreamerCount])
        .then(result => result[0].affectedRows > 0)
        .catch((err) => {
            console.log(err.message);
            return false;
        });
};

const getMonitorStatsAll = () => {
    const sql = 'select * from monitorStats order by id desc';
    return pool.execute(sql)
        .then(results => results[0])
        .catch(() => false);
};

// 导出CRUD操作
module.exports = {
    setPool,
    addMonitorStats,
    getMonitorStatsAll
};