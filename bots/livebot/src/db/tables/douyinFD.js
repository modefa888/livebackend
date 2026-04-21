// +++++++++++++++++++++++++++
// 抖音福袋表
// ___________________________

// 创建数据库连接池
let pool = '';

function setPool(tpool) {
    pool = tpool;
}

// 封装CRUD操作
const addUpdateDouYinFD = (data) => {
    const sql = `
        INSERT INTO douyinFD (
            mid, title, pic, fdesc, lucky_count, candidate_num,
            lucky, start_time, draw_time, sytime, conditionStr,
            targetUrl, updatedAt  -- 新增updatedAt字段
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())  -- 插入时用当前时间
            ON DUPLICATE KEY UPDATE
                                 title = VALUES(title),
                                 pic = VALUES(pic),
                                 fdesc = VALUES(fdesc),
                                 lucky_count = VALUES(lucky_count),
                                 candidate_num = VALUES(candidate_num),
                                 lucky = VALUES(lucky),
                                 start_time = VALUES(start_time),
                                 draw_time = VALUES(draw_time),
                                 sytime = VALUES(sytime),
                                 conditionStr = VALUES(conditionStr),
                                 targetUrl = VALUES(targetUrl),
                                 updatedAt = NOW()  -- 更新时刷新为当前时间
    `;
    const values = [
        data.mid,
        data.username,
        data.pic,
        data.desc,
        data.lucky_count,
        data.candidate_num,
        data.lucky,
        data.start_time,
        data.draw_time,
        data.time,
        data.conditionStr,
        data.targetUrl
    ];

    return pool.execute(sql, values)
        .then(result => result[0].affectedRows > 0)
        .catch((err) => {
            console.log(err.message);
            return false;
        });
};

const getDouYinAll = () => {
    const sql = 'select * from douyinFD';
    return pool.execute(sql)
        .then(results => results[0])
        .catch(() => false);
}


// 导出CRUD操作
module.exports = {
    setPool,
    addUpdateDouYinFD,
    getDouYinAll
};
