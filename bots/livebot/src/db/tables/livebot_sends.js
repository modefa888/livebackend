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
// 添加livebot_sends消息
const addSends = (data) => {
    const sql = 'INSERT INTO livebot_sends (id, mid, roomid, username, liveStatus, title, site, pic, url, targetUrl, sendFlag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    return pool.execute(sql, [null, data.mid, data.roomid, data.username, data.liveStatus, data.title, data.site, data.pic, data.url, data.targetUrl, 1])
        .then(result => {
            if (result[0].affectedRows > 0) {
                $.emitter.emit('updateSends');
                return true; // 添加/更新成功
            } else {
                return false;
            }
        })
        .catch((err) => {
            console.log(err.message)
            return false;
        }); // 添加/更新失败
};

// 查询是否存在
const getSendByUrl = (title, targetUrl) => {
    const sql = 'select * from livebot_sends where title = ? and targetUrl = ?';
    return pool.execute(sql, [title, targetUrl])
        .then(result => {
            return result[0].affectedRows > 0;
        })
        .catch(() => false);
}

// 修改sendFlag
const updateSendsFlag = (title, targetUrl) => {
    const sql = 'update from livebot_sends set sendFlag = ? where title = ? and targetUrl = ?';
    return pool.execute(sql, [0, title, targetUrl])
        .then(results => {
            return result[0].affectedRows > 0;
        })
        .catch(() => false);
}

// 获取所有Sends数据
const getSendsList = (sendFlag = null) => {
    let sql = 'SELECT * FROM livebot_sends';
    const ty = [0, 1];
    if (sendFlag !== null && ty.includes(sendFlag)){
        sql = sql + ' WHERE sendFlag = ' + sendFlag;
    }
    return pool.execute(sql)
        .then(results => results[0])
        .catch(() => false);
}

// 添加发送消息记录（机器人发送的消息）
const addSendMessage = (data) => {
    const sql = 'INSERT INTO livebot_sends (id, content, type, target) VALUES (?, ?, ?, ?)';
    return pool.execute(sql, [null, data.content, data.type, data.target])
        .then(result => {
            if (result[0].affectedRows > 0) {
                $.emitter.emit('updateSends');
                return true; // 添加成功
            } else {
                return false;
            }
        })
        .catch((err) => {
            console.log('添加发送消息记录失败:', err.message);
            return false;
        });
};

// 导出CRUD操作
module.exports = {
    setPool,
    getSendsList,
    addSends,
    addSendMessage,
    getSendByUrl,
    updateSendsFlag
};
