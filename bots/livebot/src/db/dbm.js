const $ = require('../config/includes');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// 全局db
let db = null;

module.exports = {
    initDB(config) {
        db = new Database(path.resolve(__dirname, '../../sql/sqlite/' + config.dbName), {verbose: console.log});
        let tables = config.dbTableList; // 添加 'users' , 'settings' 表
        for (let table of tables) {
            let result = db.prepare('SELECT count(*) as exist FROM sqlite_master WHERE type=\'table\' AND name = ?').get(table);
            if (!result.exist) {
                db.exec(fs.readFileSync(path.resolve(__dirname, '../../sql/sqlite/' + table + '.sql'), 'utf8'));
            }
        }
    },
    // 开始插入数据
    addInitData(config, userId) {
        try {
            // 合并所有的 INSERT 语句到一个数组中
            const inserts = [
                'INSERT INTO settings (userId, key, value, status) VALUES (?, ?, ?, ?)',
                'INSERT INTO settings (userId, key, value, status) VALUES (?, ?, ?, ?)',
                'INSERT INTO settings (userId, key, value, status) VALUES (?, ?, ?, ?)',
                'INSERT INTO settings (userId, key, value, status) VALUES (?, ?, ?, ?)',
                'INSERT INTO settings (userId, key, value, status) VALUES (?, ?, ?, ?)',
                'INSERT INTO settings (userId, key, value, status) VALUES (?, ?, ?, ?)'
            ];

            // 合并所有的参数到一个数组中
            const params = [
                userId, "rateLimit", config.rateLimit, 1,
                userId, "interval", config.interval, 1,
                userId, "site", '#', 1,
                userId, "count", 0, 1,
                userId, "cg", config.cgSite, 1,
                userId, "scheduleTime", config.scheduleTime, 1
            ];
            // 使用 Promise.all 来异步执行所有的 INSERT 操作
            const results = Promise.all(inserts.map((sql, index) => db.prepare(sql).run(params[index * 4], params[index * 4 + 1], params[index * 4 + 2], params[index * 4 + 3])));
            // 检查是否有任何操作失败
            if (results.some(result => result === null)) {
                $.log('Some settings were not added successfully', 'error');
                return false;
            }
            $.emitter.emit('updateSettings');
            return true;
        } catch (e) {
            $.log(e.message, 'error');
            return false;
        }
    },
    updateVtb(updateFields, updateValues) {
        db.prepare(`UPDATE vtbs SET ${updateFields} WHERE mid = ? AND roomid = ?`).run(updateValues);
    },
    addVtbToWatch(chatid, mid, roomid, username, liveStatus, title, site, pic, url, targetUrl) {
        if (!this.hasPermission(chatid, 1)) { // 假设权限级别1是添加监控的最低权限
            return 0;
        }
        const vtb = this.getVtbByMid(mid);
        if (!vtb) {
            db.prepare('insert into vtbs (mid,roomid,username,liveStatus,title,site,pic,url,targetUrl) values' +
                '(?,?,?,?,?,?,?,?,?)').run(mid, roomid, username, liveStatus, title, site, pic, url, targetUrl);
            $.emitter.emit('updateVtbs');
        }
        db.prepare('insert into watch (chatid,mid) values(?,?)').run(chatid, mid);
    },
    getVtbByMid(mid) {
        return db.prepare('select * from vtbs where mid=?').get(mid);
    },
    getWatchByChatid(chatid) {
        return db.prepare('select w.*,v.* from watch w inner join vtbs v on w.mid=v.mid where w.chatid=?').all(chatid);
    },
    existsWatch(chatid, mid) {
        return !!db.prepare('select rowid from watch where chatid=? and mid=?').get(chatid, mid);
    },
    addWatch(chatid, mid) {
        const exist = !!db.prepare('select rowid from watch where chatid=? and mid=?').get(chatid, mid);
        if (exist) {
            return 2;
        }
        const info = db.prepare('insert into watch (chatid,mid) values(?,?)').run(chatid, mid);
        const result = info.lastInsertRowid;
        return result > 0;
    },
    delWatch(chatid, mid) {
        const info = db.prepare('delete from watch where chatid=? and mid=?').run(chatid, mid);
        let other = db.prepare('select * from watch where mid=?').get(mid);
        if (!other) {
            db.prepare('delete from vtbs where mid=?').run(mid);
            $.emitter.emit('updateVtbs');
        }
        const result = info.changes;
        return result > 0;
    },
    delWatchChannle(chatid, mid) {
        const info = db.prepare('delete from watch where chatid=? and mid=?').run(chatid, mid);
        const result = info.changes;
        return result > 0;

    },
    getVtbByUsername(username) {
        return db.prepare('select * from vtbs where username=?').get(username);
    },
    getVtbs() {
        return db.prepare('select * from vtbs').all();
    },
    updateVtbColumn(column, value, mid) {
        db.prepare('update vtbs set ' + column + '=? where mid=?').run(value, mid);
    },
    // 获取权限不为0
    getWatchByMid(mid) {
        // 连接watch和users表，并过滤权限不为0的记录，且只查询普通用户
        return db.prepare('SELECT watch.* FROM watch JOIN users ON watch.chatid = users.userId WHERE watch.mid = ? AND users.permissionLevel <> 0 AND users.type = "user"').all(mid);
    },
    getWatchByCount(userId) {
        return db.prepare('SELECT count(*) as count FROM watch where chatid = ?').get(userId);
    },


    // 更新发送的消息id
    updateWatchMessageId(userId, mid, newMessageId) {
        const info = db.prepare('UPDATE watch SET messageid = ? WHERE chatid = ? and mid = ?').run(newMessageId, userId, mid);
        const result = info.changes;
        if (result > 0) {
            return 1;
        }
        return 0;
    },

    // 用户权限表 - 只返回普通用户，不返回群组
    getUser() {
        return db.prepare('select * from users where type = "user"').all();
    },

    // 用户订阅列表
    getUserList(userId) {
        return db.prepare('SELECT v.* FROM vtbs v INNER JOIN watch w ON v.mid = w.mid WHERE w.chatid = ?').all(userId);
    },

    // 用户添加
    getUserFromId(fromId) {
        return db.prepare('select * from users where fromId = ?').all(fromId);
    },

    // 添加用户，确保userId是唯一的
    addUser(userId, fromId, permissionLevel = 0, username = null, type = "user") {
        const existsUser = db.prepare('select * from users where userId = ?').get(userId);
        if (!existsUser) {
            db.prepare('INSERT INTO users (userId, fromId, permissionLevel, username, type) VALUES (?, ?, ?, ?, ?)').run(userId, fromId, permissionLevel, username, type);
            $.emitter.emit('updateUsers');
            return 1;
        } else {
            db.prepare('delete from users where userId = ?').run(userId);
            db.prepare('INSERT INTO users (userId, fromId, permissionLevel, username, type) VALUES (?, ?, ?, ?, ?)').run(userId, fromId, permissionLevel, username, type);
            $.emitter.emit('updateUsers');
            return 1;
        }
        return 0;
    },

    existsUser(userId) {
        return !!db.prepare('select rowid from users where userId=?').get(userId);
    },

    // 获取用户的权限级别
    getUserPermissionLevel(userId) {
        let user = db.prepare('SELECT permissionLevel FROM users WHERE userId = ?').get(userId);
        return user ? user.permissionLevel : null;
    },

    // 检查用户是否具有所需的权限级别
    hasPermission(userId, requiredPermissionLevel) {
        let userPermissionLevel = this.getUserPermissionLevel(userId);
        return userPermissionLevel !== null && userPermissionLevel >= requiredPermissionLevel;
    },

    // 更新用户的权限级别
    updateUserPermissionLevel(userId, newPermissionLevel) {
        const info = db.prepare('UPDATE users SET permissionLevel = ? WHERE userId = ?').run(newPermissionLevel, userId);
        const result = info.changes;
        if (result > 0) {
            $.emitter.emit('updateUsers');
            return 1;
        }
        return 0;
    },

    // 根据用户名获取用户信息
    getUserByUsername(username) {
        return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    },
    // 从数据库中获取用户信息
    getUserByUserId(userId) {
        return db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);
    },
    // 删除用户信息
    deleteUser(userId) {
        db.prepare('update users set permissionLevel = 0 where userId=?').run(userId);
        let other = db.prepare('select * from users where userId=?').get(userId);
        if (!other.permissionLevel) {
            $.emitter.emit('updateUsers');
            return 1;
            // 删除关注列表
            // db.prepare('delete from watch where chatid = ?').run(userId);
        }
        return 0;
    },

    // 添加设置
    addSetting(userId, key, value, status = 1) {
        const info = db.prepare('INSERT INTO settings (userId, key, value, status) VALUES (?, ?, ?, ?)').run(userId, key, value, status);
        const result = info.lastInsertRowid;
        if (result) {
            $.emitter.emit('updateSettings');
        }
        return result > 0;
    },

    // 获取设置 -- 根据userId查询
    getUserSettings(userId) {
        return db.prepare('SELECT * FROM settings WHERE userId = ?').all(userId);
    },

    existsSettings(userId, key) {
        return db.prepare('SELECT * FROM settings WHERE userId = ? and key =?').get(userId, key);
    },

    // 从数据库中获取用户信息
    getSettings(key) {
        return db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    },

    // 更新设置的状态
    updateSettingStatus(settingId, userId, status) {
        const info = db.prepare('UPDATE settings SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE settingId = ? AND userId = ?').run(status, settingId, userId);
        const result = info.changes;
        if (result) {
            $.emitter.emit('updateSettings');
        }
        return result > 0;
    },

    // 更新设置的值
    updateSettingValue2(settingId, userId, value) {
        const info = db.prepare('UPDATE settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE settingId = ? AND userId = ?').run(value, settingId, userId);
        const result = info.changes;
        if (result) {
            $.emitter.emit('updateSettings');
        }
        return result > 0;
    },
    // 更新设置的值
    updateSettingValue(key, value) {
        const info = db.prepare('UPDATE settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE key = ?').run(value, key);
        const result = info.changes;
        return result > 0;
    },
    // 根据settingId和userId删除设置
    deleteSettingById(settingId, userId) {
        const info = db.prepare('DELETE FROM settings WHERE settingId = ? AND userId = ?').run(settingId, userId);
        const result = info.changes;
        if (result) {
            $.emitter.emit('updateSettings');
        }
        return result > 0;
    },


    // +++++++++++++++++++++++++++
    // 吃瓜数据表
    // ___________________________

    addCg(username, liveStatus, title, site, pic, url, targetUrl) {
        const vtb = this.getCgByTargetUrl(targetUrl);
        if (!vtb) {
            const info = db.prepare('INSERT INTO livebot_cg (targetUrl, username, liveStatus, title, site, pic, url) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(targetUrl, username, liveStatus, title, site, pic, url);
            const result = info.lastInsertRowid;
            return result > 0;
        }
        return 0;
    },

    updateCg(targetUrl, messageId){
        db.prepare(`UPDATE livebot_cg SET messageId = ? WHERE targetUrl = ?`).run(messageId, targetUrl);
    },

    getCgByTargetUrl(targetUrl) {
        return db.prepare('SELECT * FROM livebot_cg WHERE targetUrl = ?').get(targetUrl);
    },

    getCgList() {
        try {
            return db.prepare('SELECT * FROM livebot_cg').all();
        } catch (err) {
            $.log('Error fetching cg list:' + err.message, 'error');
            return 0;
        }
    },


    //*********************
    // 消息处理部分
    //*********************

    addMessages(fileId, fileName, thumbnail, caption, type, msgBody) {
        const exist = !!db.prepare('select rowid from messages where fileName = ? and caption = ?').get(fileName, caption);
        if (exist) {
            return 2;
        }
        const info = db.prepare('insert into messages (fileId, fileName, thumbnail, caption, type, msgBody) values(?,?,?,?,?,?)').run(fileId, fileName, thumbnail, caption, type, msgBody);
        const result = info.lastInsertRowid;
        $.emitter.emit('updateMessages');
        return 1;
    },

    getMessagesAll() {
        return db.prepare('select fileId, fileName, thumbnail, caption, type from messages').all();
    },

    delMessagesAll() {
        return db.prepare('delete from messages').run();
    },

    getMessagesAllByType(type) {
        return db.prepare('select fileId, fileName, thumbnail, caption, type from messages where type = ?').all(type);
    },

};
