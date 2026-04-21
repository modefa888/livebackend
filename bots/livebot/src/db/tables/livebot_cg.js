// +++++++++++++++++++++++++++
// 吃瓜数据表
// ___________________________

// 创建数据库连接池
let pool = '';

function setPool(tpool) {
    pool = tpool;
}

// 封装CRUD操作
const addCg = (username, liveStatus, title, site, pic, url, targetUrl) => {
    const sql = 'INSERT INTO livebot_cg (`targetUrl`, username, liveStatus, title, site, pic, url) VALUES (?, ?, ?, ?, ?, ?, ?)';
    return pool.execute(sql, [targetUrl, username,liveStatus, title, site, pic, url])
        .then(result => result[0].affectedRows > 0)
        .catch((err) => {
            console.log(err.message)
            return false;
        });
};


const updateCg = (targetUrl, messageId) => {
    const sql = 'UPDATE livebot_cg SET messageId = ? WHERE targetUrl = ?';
    return pool.execute(sql, [messageId, targetUrl])
        .then(result => result[0].affectedRows > 0)
        .catch(() => false);
};

const getCgByTargetUrl = (targetUrl) => {
    const sql = 'SELECT * FROM livebot_cg WHERE `targetUrl` = ?';
    return pool.execute(sql, [targetUrl])
        .then(([rows, fields]) => {
            // 检查rows是否有数据
            if (rows.length > 0) {
                // 返回是否找到匹配的targetUrl
                return rows[0].targetUrl === targetUrl;
            } else {
                // 没有找到数据
                return false;
            }
        })
        .catch((err) => {
            return false;
        });
};


const getCgList = () => {
    const sql = 'SELECT * FROM livebot_cg';
    return pool.execute(sql)
        .then(results => results[0])
        .catch(() => false);
};

const deleteCgByUrl = (targetUrl) => {
    const sql = 'DELETE FROM livebot_cg WHERE `targetUrl` = ?';
    return pool.execute(sql, [targetUrl])
        .then(result => result[0].affectedRows > 0)
        .catch(() => false);
};

// 导出CRUD操作
module.exports = {
    setPool,
    addCg,
    getCgByTargetUrl,
    getCgList,
    updateCg,
    deleteCgByUrl
};
