// +++++++++++++++++++++++++++
// 用户表
// ___________________________

// 创建数据库连接池
let pool = '';
let $ = '';

function setPool(tpool, $1) {
    pool = tpool;
    $ = $1;
}

// 用户权限表
const getUser = () => pool.query('SELECT * FROM users')
    .then(results => results[0])
    .catch(() => false);

// 用户订阅列表
const getUserList = (userId) => pool.execute("SELECT v.* FROM vtbs v INNER JOIN watch w ON v.mid = w.mid WHERE w.chatid = ?", [userId])
    .then(results => results[0])
    .catch(() => false);

// 用户添加
const addUser = (userId, fromId, permissionLevel = 0, username = null, type = "user") => {
    const sql = 'INSERT INTO users (userId, fromId, permissionLevel, username, type) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE permissionLevel = VALUES(permissionLevel), username = VALUES(username), type = VALUES(type)';
    return pool.query(sql, [userId, fromId, permissionLevel, username, type])
        .then(() => {
            $.emitter.emit('updateUsers');
            return true; // 添加用户成功
        })
        .catch((err) => {
            console.log(err.message);
            return false; // 添加用户失败
        });
};


// 获取用户的权限级别
const getUserPermissionLevel = (userId) => pool.query('SELECT permissionLevel FROM users WHERE userId = ?', [userId])
    .then(results => results[0][0]['permissionLevel'])
    .catch(() => false);

// 检查用户是否具有所需的权限级别
const hasPermission = async (userId, requiredPermissionLevel) => {
    let userPermissionLevel = await getUserPermissionLevel(userId);
    return userPermissionLevel !== null && userPermissionLevel >= requiredPermissionLevel;
}

// 更新用户的权限级别
const updateUserPermissionLevel = (userId, newPermissionLevel) => pool.query('UPDATE users SET permissionLevel = ? WHERE userId = ?', [newPermissionLevel, userId])
    .then(result => {
        $.emitter.emit('updateUsers');
        return result[0].affectedRows > 0;
    })
    .catch(() => false);

// 从数据库中获取用户信息
const getUserByUserId = (userId) => pool.query('SELECT * FROM users WHERE userId = ?', [userId])
    .then(results => results[0][0])
    .catch(() => false);

// 删除用户信息
const deleteUser = (userId) => pool.query('delete from users where userId=?', [userId])
    .then(result => {
        if (result[0].affectedRows > 0) {
            $.emitter.emit('updateUsers');
            return true;
        } else {
            return false;
        }
    })
    .catch(() => false);

// 用户添加
const getUserFromId = (fromId) => pool.query('select * from users where fromId = ?', fromId)
    .then(results => results[0])
    .catch(() => false);

// 导出CRUD操作
module.exports = {
    setPool,
    addUser,
    getUser,
    getUserList,
    getUserByUserId,
    deleteUser,
    updateUserPermissionLevel,
    getUserPermissionLevel,
    hasPermission,
    getUserFromId
};
