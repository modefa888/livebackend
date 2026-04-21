// +++++++++++++++++++++++++++
// 微密圈表
// ___________________________

// 创建数据库连接池
let pool = '';
let $ = '';

function setPool(tpool, $1) {
    pool = tpool;
    $ = $1;
}

// 封装CRUD操作
// 添加维密
const addWeimi = (title, img, href, cat, time) => {
    const sql = 'INSERT INTO weimi (title, img, href, cat, time) VALUES (?, ?, ?, ?, ?)';
    return pool.execute(sql, [title, img, href, cat, time])
        .then(result => {
            return result[0].affectedRows > 0;
        })
        .catch((err) => {
            console.log(err.message)
            return false;
        }); // 添加/更新失败
};

// 获取随机一条
const getWeimiRAND = () => {
    const sql = 'SELECT * FROM weimi ORDER BY RAND() LIMIT 1';
    return pool.execute(sql)
        .then(result => {
            return result[0][0];
        }).catch(() => {
            return false;
        });
}

// 获取全部列表
const getWeimiList = () => {
    const sql = 'SELECT * FROM weimi';
    return pool.execute(sql)
        .then(result => {
            return result[0];
        }).catch(() => {
            return false;
        });
}

// const delWatch = (chatid, mid) => {
//     const sql = 'delete from watch where chatid=? and mid=?';
//     return pool.execute(sql, [chatid, mid])
//         .then(result => {
//             if (result[0].affectedRows > 0) {
//                 return true;
//             }
//         })
//         .catch(() => false);
// }
//
// const delWatchChannle = (chatid, mid) => {
//     const sql = 'delete from watch where chatid = ? and mid = ?';
//     return pool.execute(sql, [chatid, mid])
//         .then(result => {
//             return result[0].affectedRows > 0
//         })
//         .catch(() => {
//             return false;
//         });
// }
//
// const getWatchByMid = (mid) => {
//     // 连接watch和users表，并过滤权限不为0的记录
//     // 执行查询并返回结果
//     const sql = 'SELECT watch.* FROM watch JOIN users ON watch.chatid = users.userId WHERE watch.mid = ? AND users.permissionLevel <> 0';
//     return pool.execute(sql, [mid])
//         .then(results => results[0])
//         .catch(() => false);
// }
//
// const getWatchByCount = (userId) => {
//     const sql = 'SELECT count(*) as count FROM watch where chatid = ?';
//     return pool.execute(sql, [userId])
//         .then(results => results[0][0])
//         .catch(() => false);
// }
//
// // 更新发送的消息id
// const updateWatchMessageId = (userId, mid, newMessageId) => {
//     const sql = 'UPDATE watch SET messageId = ? WHERE chatid = ? and mid = ?';
//     return pool.execute(sql, [newMessageId, userId, mid])
//         .then(result => result.length > 0)
//         .catch(() => false);
// }


// 导出CRUD操作
module.exports = {
    setPool,
    addWeimi,
    getWeimiRAND,
    getWeimiList
};
