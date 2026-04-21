// +++++++++++++++++++++++++++
// 关注表
// ___________________________

// 创建数据库连接池
let pool = '';
let $ = '';

function setPool(tpool, $1) {
    pool = tpool;
    $ = $1;
}

// 封装CRUD操作

const updateVtb = (updateFields, updateValues) => {
    const sql = `UPDATE vtbs SET ${updateFields} WHERE mid = ? AND roomid = ?`.replace("mid", "`mid`");
    return pool.execute(sql, updateValues)
        .then(() => true)
        .catch((err) => {
            console.log(err.message);
            return false;
        });
}

const addVtbToWatch = (chatid, mid, roomid, username, liveStatus, title, site, pic, url, targetUrl) => {
    const sql = 'INSERT INTO vtbs (`mid`, roomid, username, liveStatus, title, site, pic, url, targetUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    return pool.execute(sql, [mid, roomid, username, liveStatus, title, site, pic, url, targetUrl])
        .then(() => {
            $.emitter.emit('updateVtbs');
            return true; // 添加/更新成功
        })
        .catch((err) => {
            console.log(err.message)
            return false;
        }); // 添加/更新失败
};

// 根据mid和roomid删除单条主播信息
const deleteVtbByMidAndRoomid = (mid, roomid) => {
    const sql = 'DELETE FROM vtbs WHERE `mid` = ? AND roomid = ?';
    return pool.execute(sql, [mid, roomid])
        .then(result => {
            // 检查是否有记录被删除
            if (result[0].affectedRows > 0) {
                $.emitter.emit('updateVtbs'); // 触发更新事件
                return true;
            }
            return false; // 没有匹配的记录被删除
        })
        .catch((err) => {
            console.log('删除主播信息失败:', err.message);
            return false;
        });
};

const getVtbByMid = (mid) => {
    const sql = 'select * from vtbs where mid=?';
    return pool.execute(sql, [mid])
        .then(results => results[0][0])
        .catch(() => false);
}

const getVtbByUsername = (username) => {
    const sql = 'select * from vtbs where username = ?';
    return pool.execute(sql, [username])
        .then(results => results[0][0])
        .catch(() => false);
}

const getVtbs = () => {
    const sql = 'SELECT * FROM vtbs';
    return pool.execute(sql)
        .then(results => results[0])
        .catch(() => false);
}

const getVtbBySite = (site) => {
    const sql = 'select * from vtbs where site = ?';
    return pool.execute(sql, [site])
        .then(results => results[0])
        .catch(() => false);
}


const updateVtbByCategory = (mid, category) => {
    const sql = 'update vtbs set category = ? where mid = ?';
    return pool.execute(sql, [category, mid])
        .then(result => result[0].affectedRows > 0)
        .catch(() => false);
}

// 导出CRUD操作
module.exports = {
    setPool,
    updateVtb,
    addVtbToWatch,
    getVtbByMid,
    getVtbByUsername,
    getVtbs,
    getVtbBySite,
    updateVtbByCategory,
    deleteVtbByMidAndRoomid
};
