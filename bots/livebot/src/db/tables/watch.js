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
const getWatchByChatid = (chatid) => {
    const sql = 'select w.*,v.* from watch w inner join vtbs v on w.mid=v.mid where w.chatid = ?';
    return pool.execute(sql, [chatid])
        .then(results => results[0])
        .catch(() => false);
}

const existsWatch = (chatid, mid) => {
    const sql = 'select count(*) count from watch where chatid = ? and mid = ?';
    return pool.execute(sql, [chatid, mid])
        .then(result => {
            return result[0][0]['count'] > 0;
        })
        .catch(() => false);
}

const addWatch = (chatid, mid) => {
    const sql = 'INSERT INTO watch (chatid, mid) VALUES (?, ?)';
    return pool.execute(sql, [chatid, mid])
        .then(() => {
            // 这里不再单独触发 updateVtbs，避免和 addVtbToWatch 重复触发
            return true; // 添加/更新成功
        })
        .catch((err) => {
            console.log(err.message)
            return false;
        }); // 添加/更新失败
};


const delWatch = (chatid, mid) => {
    const sql = 'delete from watch where chatid=? and mid=?';
    return pool.execute(sql, [chatid, mid])
        .then(async result => {
            if (result[0].affectedRows > 0) {
                // 检查是否还有其他用户关注该主播
                const [watchRows] = await pool.execute('select * from watch where mid=?', [mid]);
                if (watchRows.length === 0) {
                    // 如果没有其他用户关注，删除 vtbs 记录
                    await pool.execute('delete from vtbs where mid=?', [mid]);
                    $.emitter.emit('updateVtbs');
                }
                return true;
            }
            return false;
        })
        .catch(() => false);
}

const delWatchChannle = (chatid, mid) => {
    const sql = 'delete from watch where chatid = ? and mid = ?';
    return pool.execute(sql, [chatid, mid])
        .then(result => {
            return result[0].affectedRows > 0
        })
        .catch(() => {
            return false;
        });
}

const getWatchByMid = (mid) => {
    // 连接watch和users表，并过滤权限不为0的记录
    // 执行查询并返回结果
    const sql = 'SELECT watch.* FROM watch JOIN users ON watch.chatid = users.userId WHERE watch.mid = ? AND users.permissionLevel <> 0';
    return pool.execute(sql, [mid])
        .then(results => results[0])
        .catch(() => false);
}

const getWatchByCount = (userId) => {
    const sql = 'SELECT count(*) as count FROM watch where chatid = ?';
    return pool.execute(sql, [userId])
        .then(results => results[0][0])
        .catch(() => false);
}

// 更新发送的消息id
const updateWatchMessageId = (userId, mid, newMessageId) => {
    const sql = 'UPDATE watch SET messageId = ? WHERE chatid = ? and mid = ?';
    return pool.execute(sql, [newMessageId, userId, mid])
        .then(result => result.length > 0)
        .catch(() => false);
}

// 查询所有未被任何用户关注的主播
const getUnwatchedVtbs = () => {
    const sql = `
        SELECT v.*
        FROM vtbs v
                 LEFT JOIN watch w ON v.mid = w.mid
        WHERE w.id IS NULL
    `;
    return pool.execute(sql)
        .then(results => results[0])
        .catch(() => false);
}


// 导出CRUD操作
module.exports = {
    setPool,
    getWatchByChatid,
    existsWatch,
    delWatchChannle,
    delWatch,
    addWatch,
    getWatchByMid,
    getWatchByCount,
    updateWatchMessageId,
    getUnwatchedVtbs
};
