//*********************
// 消息表
//*********************

// 创建数据库连接池
let pool = '';

function setPool(tpool) {
    pool = tpool;
}

// 封装CRUD操作
const addMessages = (fileId, fileName, thumbnail, caption, type, msgBody) => {
    const sql = 'insert into messages (fileId, fileName, thumbnail, caption, type, msgBody) values(?,?,?,?,?,?)';
    return pool.execute(sql, [fileId, fileName, thumbnail, caption, type, msgBody])
        .then(result => {
            return result.length > 0;
        })
        .catch(() => false);
};

const getMessagesAll = () => {
    const sql = 'select fileId, fileName, thumbnail, caption, type from messages';
    return pool.execute(sql)
        .then(results => results[0])
        .catch(() => false);
};

const delMessagesAll = (targetUrl) => {
    const sql = 'delete from messages';
    return pool.execute(sql)
        .then(result => result[0].affectedRows > 0)
        .catch(() => false);
};

// 导出CRUD操作
module.exports = {
    setPool,
    addMessages,
    getMessagesAll,
    delMessagesAll
};
