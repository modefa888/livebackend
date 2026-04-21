// +++++++++++++++++++++++++++
// 直播记录表
// ___________________________

// 创建数据库连接池
let pool = '';

function setPool(tpool) {
    pool = tpool;
}

// 封装CRUD操作
const addLiveHistory = (mid, day, username, title, startLive, endLive, targetUrl, pic) => {
    const sql = `
        INSERT INTO liveHistory (mid, day, username, title, startLive, endLive, targetUrl, pic)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    return pool.execute(sql, [mid, day, username, title, startLive, endLive, targetUrl, pic])
        .then(result => result[0].affectedRows > 0)
        .catch((err) => {
            console.log(err.message);
            return false;
        });
};

const getLiveHistoryByMidAndAndLive = (mid) => {
    const sql = 'select * from liveHistory where mid = ? and endLive = ""';
    return pool.execute(sql, [mid])
        .then(results => results[0][0])
        .catch(() => false);
}

const getLiveHistoryOrderByMid = (mid) => {
    const sql = `SELECT * FROM liveHistory
    WHERE mid = ? and endLive != ""
    ORDER BY updatedAt DESC
    LIMIT 1`;
    return pool.execute(sql, [mid])
        .then(results => results[0][0])
        .catch(() => false);
}

const getLiveHistoryAll = () => {
    const sql = 'select * from liveHistory';
    return pool.execute(sql)
        .then(results => results[0])
        .catch(() => false);
}

const updateLiveHistory = (id, mid, endLive) => {
    const sql = 'update liveHistory set endLive = ? where mid = ? and id = ?';
    return pool.execute(sql, [endLive, mid, id])
        .then(result => result[0].affectedRows > 0)
        .catch((err) => {
            console.log(err.message);
            return false;
        });
}


// 导出CRUD操作
module.exports = {
    setPool,
    addLiveHistory,
    getLiveHistoryAll,
    getLiveHistoryByMidAndAndLive,
    updateLiveHistory,
    getLiveHistoryOrderByMid
};
