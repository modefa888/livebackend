const db = require('../../config/db');

const siteList = {
    'www.huya.com': '虎牙',
    'www.douyu.com': '斗鱼',
    'live.douyin.com': '抖音',
    'live.bilibili.com': 'B站',
    'play.afreecatv.com': 'AfreecaTV',
    'chaturbate.com': 'Chaturbate',
    'www.pandalive.co.kr': 'PandaLive',
    'live.kuaishou.com': '快手'
};

function getMidFromUrl(url, site) {
    const parts = url.split('/');
    let mid;
    
    switch(site) {
        case 'www.huya.com':
        case 'www.douyu.com':
            mid = parts[3];
            break;
        case 'live.douyin.com':
            mid = parts[3];
            break;
        case 'live.bilibili.com':
            mid = parts[3];
            break;
        case 'play.afreecatv.com':
            mid = parts[4];
            break;
        case 'chaturbate.com':
            mid = parts[3];
            break;
        case 'www.pandalive.co.kr':
            mid = parts[5];
            break;
        case 'live.kuaishou.com':
            mid = parts[4];
            break;
        default:
            mid = parts[parts.length - 1];
    }
    
    return mid && mid.includes('?') ? mid.split("?")[0] : mid;
}

async function addStreamer(url) {
    try {
        const site = url.split('/')[2];
        
        if (!siteList[site]) {
            return { success: false, message: '暂不支持当前网站' };
        }
        
        const mid = getMidFromUrl(url, site);
        if (!mid) {
            return { success: false, message: '检查网址是否正确' };
        }
        
        const [existingVtb] = await db.execute('SELECT * FROM vtbs WHERE mid = ?', [mid]);
        if (existingVtb.length > 0) {
            return { success: false, message: '该主播已在监控列表中' };
        }
        
        const apiHandlerPath = `../../../bots/livebot/src/spider/${site.replace('.', '_')}.js`;
        try {
            const apiHandler = require(apiHandlerPath);
            if (apiHandler.getStationStatus) {
                const data = await apiHandler.getStationStatus(mid);
                if (data.code) {
                    const { title, roomid, username, room_status, liveUrl, avatar_thumb } = data;
                    
                    await db.execute(
                        `INSERT INTO vtbs (mid, username, roomid, site, liveStatus, title, targetUrl, pic, url, updatedAt) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                        [mid, username, roomid, site, room_status ? '1' : '0', title, url, avatar_thumb, liveUrl]
                    );
                    
                    return { success: true, message: '添加成功', username, mid, targetUrl: url };
                }
            }
        } catch (e) {
            console.log('使用通用方法添加主播');
        }
        
        await db.execute(
            `INSERT INTO vtbs (mid, username, site, liveStatus, targetUrl, updatedAt) 
             VALUES (?, ?, ?, '0', ?, NOW())`,
            [mid, mid, site, url]
        );
        
        return { success: true, message: '添加成功', username: mid, mid, targetUrl: url };
    } catch (error) {
        console.error('添加主播失败:', error);
        return { success: false, message: '添加失败' };
    }
}

async function getStreamers() {
    try {
        const [vtbs] = await db.execute('SELECT * FROM vtbs ORDER BY updatedAt DESC');
        return { success: true, data: vtbs };
    } catch (error) {
        console.error('获取主播列表失败:', error);
        return { success: false, message: '获取失败' };
    }
}

async function getOnlineStreamers() {
    try {
        const [vtbs] = await db.execute('SELECT * FROM vtbs WHERE liveStatus = "1" ORDER BY updatedAt DESC');
        return { success: true, data: vtbs };
    } catch (error) {
        console.error('获取在线主播失败:', error);
        return { success: false, message: '获取失败' };
    }
}

async function deleteStreamer(id) {
    try {
        await db.execute('DELETE FROM vtbs WHERE id = ?', [id]);
        return { success: true, message: '删除成功' };
    } catch (error) {
        console.error('删除主播失败:', error);
        return { success: false, message: '删除失败' };
    }
}

async function parseUrl(url) {
    try {
        return { success: false, message: '链接解析功能已暂时禁用' };
    } catch (error) {
        console.error('解析链接失败:', error);
        return { success: false, message: '解析失败' };
    }
}

module.exports = {
    addStreamer,
    getStreamers,
    getOnlineStreamers,
    deleteStreamer,
    parseUrl,
    siteList
};
