// ******************************************
// 监控+通知模块（重构版，采用老代码处理方式）
// ******************************************

const { format } = require('date-fns');

const { setNotifyConfig, notifySubscriberChats } = require('./notifySubscriberChats-utils');

module.exports = async ($, dbm, apiHandlers, config) => {
    // -------------------------
    // 配置 & 状态（模块级）
    // -------------------------
    setNotifyConfig($, dbm, config);

    // 初始化数据
    let vtbs = $.sortVtbsByPriority(await dbm.getVtbs());
    $.log('Loaded vtbs: ' + (vtbs ? vtbs.length : 0));

    // 站点停用/特殊处理列表
    let siteStopList = [];
    let siteCgList = [];
    let site19List = [];

    // 访问站点间隔设置（秒）
    let interval = Number.isFinite(config.interval) ? config.interval : 3;

    // 计数视图轮次
    let viewCount = 1;

    // 上一次的扫描数量
    let lastCount = -1;

    // 暂停监控时间段
    let stopF = 0;
    let stopE = 0;

    // -------------------------
    // 小工具
    // -------------------------
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function safeSplitSetting(value) {
        if (!value && value !== '') return [];
        if (typeof value !== 'string') return [];
        return value === '' ? [] : value.split('#');
    }

    function logError(err, msg) {
        if (err && err.message) {
            $.log(`${msg} ${err.message}`, 'error');
        } else {
            $.log(msg || err, 'error');
        }
    }

    // -------------------------
    // 初始化加载函数
    // -------------------------
    async function loadSettings() {
        try {
            const siteSetting = await dbm.getSettings('site');
            siteStopList = siteSetting ? safeSplitSetting(siteSetting.value) : [];

            const cgSetting = await dbm.getSettings('cg');
            siteCgList = cgSetting ? safeSplitSetting(cgSetting.value) : [];

            const s19Setting = await dbm.getSettings('19');
            site19List = s19Setting ? safeSplitSetting(s19Setting.value) : [];

            const intervalSetting = await dbm.getSettings('interval');
            if (intervalSetting && !Number.isNaN(parseInt(intervalSetting.value, 10))) {
                interval = parseInt(intervalSetting.value, 10);
                config.interval = interval;
            }

            const stopSetting = await dbm.getSettings('stopFE');
            if (stopSetting && stopSetting.value) {
                const parts = safeSplitSetting(stopSetting.value);
                stopF = parts.length > 0 && !Number.isNaN(parseInt(parts[0], 10)) ? parseInt(parts[0], 10) : 0;
                stopE = parts.length > 1 && !Number.isNaN(parseInt(parts[1], 10)) ? parseInt(parts[1], 10) : 8;
            } else {
                stopF = 0;
                stopE = 8;
            }

            $.log(`Loaded settings: interval=${interval}, stopF=${stopF}, stopE=${stopE}, siteStopList=${siteStopList.length}, siteCgList=${siteCgList.length}`);
        } catch (err) {
            logError(err, '加载 settings 出错，使用默认值：');
            // 保持之前的值（不覆盖）
        }
    }

    // 立即加载设置
    await loadSettings();

    // 监听事件触发更新
    $.emitter.on('updateVtbs', async () => {
        vtbs = $.sortVtbsByPriority(await dbm.getVtbs());
        $.log('Reloaded Vtbs: ' + (vtbs ? vtbs.length : 0));
    });

    $.emitter.on('updateSettings', async () => {
        await loadSettings();
        $.log('Reloaded Settings.');
    });

    // -------------------------
    // 更新主播数据
    // -------------------------
    async function updateVtbData(vtb, respData) {
        // respData 结构：{ title, username, room_status, liveUrl, avatar_thumb, targetUrl }
        try {
            const updates = {};
            // 保持当前值副本用于比较
            let liveStatus = vtb.liveStatus ? vtb.liveStatus.toString() : '0';

            // 用户名
            if (respData.username && respData.username !== vtb.username) {
                updates.username = respData.username;
            }

            // 标题：防止 undefined，且对特殊站点做处理
            const rawTitle = (respData.title || '').toString();
            const resptitle = rawTitle.replace('[', '').replace(']', '');
            if (resptitle !== vtb.title) {
                // 特殊站点处理（zh.stripchat.com）
                if (vtb.site === 'zh.stripchat.com') {
                    try {
                        const match = resptitle.split('完成度: ')[1];
                        if (match) {
                            const success = match.replace('%', '');
                            if (!Number.isNaN(parseInt(success, 10)) && parseInt(success, 10) > 96) {
                                try {
                                    // 注意：sendMessage 可能抛错，包裹
                                    $.bot.sendMessage(-4233387672, `当前主播 *${vtb.username}*,[前往](${vtb.targetUrl}), 任务完成度已经超过95%啦！\n${resptitle}`, $.defTgMsgForm);
                                } catch (err) {
                                    $.log('发送TG消息失败: ' + err.message, 'error');
                                }
                            }
                        }
                    } catch (err) {
                        $.log(`【${vtb.site}】(${vtb.vmid}) 特殊站点处理错误: ${err.message}`, 'error');
                    }
                }
                updates.title = resptitle;
            }

            // 图片、url、targetUrl
            if ((respData.avatar_thumb || respData.pic) && (respData.avatar_thumb || respData.pic) !== vtb.pic) {
                updates.pic = respData.avatar_thumb || respData.pic;
            }
            if ((respData.liveUrl || respData.url) && (respData.liveUrl || respData.url) !== vtb.url) {
                updates.url = respData.liveUrl || respData.url;
            }
            if (respData.targetUrl && respData.targetUrl !== vtb.targetUrl) {
                updates.targetUrl = respData.targetUrl;
            }

            // 直播状态（room_status）
            if (typeof respData.room_status !== 'undefined' && respData.room_status.toString() !== vtb.liveStatus) {
                updates.liveStatus = respData.room_status.toString();
                liveStatus = respData.room_status.toString();

                // 更新时间戳（避免重复写同一时间）
                const formattedTime = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
                if (formattedTime !== vtb.updatedAt) {
                    updates.updatedAt = formattedTime;
                }
            }

            // 如果无更新，直接返回
            if (Object.keys(updates).length === 0) return;

            // 构建动态更新语句
            const updateFields = Object.keys(updates).map((f) => `${f} = ?`).join(', ');
            const updateValues = Object.values(updates);

            // 添加条件值
            updateValues.push(vtb.mid);
            updateValues.push(vtb.roomid);

            try {
                await dbm.updateVtb(updateFields, updateValues);
            } catch (err) {
                logError(err, '更新数据库失败：');
                $.log('更新数据 => ' + JSON.stringify(updates), 'error');
                return;
            }

            // 如果 liveStatus 变化，处理历史记录和通知
            if (liveStatus !== (vtb.liveStatus ? vtb.liveStatus.toString() : '0')) {
                // 更新本地 vtbs 对象
                Object.assign(vtb, updates);

                let shouldSend = true;

                try {
                    const live = await dbm.getLiveHistoryByMidAndAndLive(vtb.mid);
                    if (liveStatus === '1' && vtb.site !== 'fd.live.douyin.com' && !live) {
                        const now = Date.now();
                        const nowDate = new Date();
                        const dayTime = `${nowDate.getFullYear()}-${nowDate.getMonth() + 1}-${nowDate.getDate()}`;
                        const added = await dbm.addLiveHistory(vtb.mid, dayTime, vtb.username, vtb.title, now, '', vtb.targetUrl, vtb.pic);
                        if (added) {
                            $.log(`${vtb.username} 在${$.convertUnixTimestampToDate(now)} 开播`);
                        } else {
                            $.log(`【直播记录添加失败】${vtb.username} 在${$.convertUnixTimestampToDate(now)} 开播`);
                            shouldSend = false;
                        }
                    } else if (liveStatus === '0' && vtb.site !== 'fd.live.douyin.com') {
                        // 结束直播：live 应该存在且包含 id
                        if (live && live.id) {
                            const endLive = Date.now();
                            const updated = await dbm.updateLiveHistory(live.id, vtb.mid, endLive);
                            if (updated) {
                                $.log(`${vtb.username} 在${$.convertUnixTimestampToDate(endLive)} 下播`);
                            } else {
                                $.log(`【直播记录更新失败】${vtb.username} 在${$.convertUnixTimestampToDate(endLive)} 下播`);
                                shouldSend = false;
                            }
                        }
                    }
                } catch (err) {
                    logError(err, '处理直播历史出错：');
                    shouldSend = false;
                }

                if (shouldSend) {
                    try {
                        await notifySubscriberChats(vtb, siteCgList, site19List);
                    } catch (err) {
                        logError(err, '通知订阅者出错：');
                    }
                }
            }
        } catch (err) {
            logError(err, 'updateVtbData 异常：');
        }
    }

    // -------------------------
    // 获取站点状态
    // -------------------------
    async function fetchStationStatus(api, vmid, vtb) {
        try {
            const data = await api.getStationStatus(vmid);
            if (!data) return null;

            if (data.code) {
                const title = data.title || vtb.title || '';
                const username = data.username || data.user || vtb.username || '';
                const room_status = typeof data.room_status !== 'undefined' ? data.room_status : (data.roomStatus || vtb.liveStatus || 0);
                const url = data.liveUrl || data.url || data.live_url || vtb.url || '';
                const pic = data.avatar_thumb || data.pic || data.avatar || vtb.pic || '';
                const targetUrl = data.targetUrl || data.target_url || vtb.targetUrl || '';

                // 抖音福袋处理
                if (vmid && vmid.match(/fudai_/)) {
                    try {
                        if (data.douyinJson) {
                            await dbm.addUpdateDouYinFD(data.douyinJson);
                        }
                    } catch (err) {
                        // 记录但不影响主流程
                        $.log('保存抖音福袋数据失败: ' + err.message, 'error');
                    }
                }

                return { title, username, room_status, url, pic, targetUrl };
            }
        } catch (err) {
            $.log(`监控: site=${vtb && vtb.site ? vtb.site : 'unknown'}, vmid=${vmid} => ${err.message}`, 'error');
        }
        return null;
    }

    // -------------------------
    // 异步请求处理
    // -------------------------
    async function AsyncGetUpdateVtb(apiHandler, vmid, vtb) {
        try {
            const respData = await fetchStationStatus(apiHandler, vmid, vtb);
            if (respData) {
                await updateVtbData(vtb, respData);
            }
        } catch (error) {
            $.log('获取站点信息 status:' + error.message, 'error');
        }
    }

    // -------------------------
    // 主轮询循环（采用老代码的顺序处理方式）
    // -------------------------
    (async function rotate() {
        // 时间检查：凌晨0点至8点暂停监控
        const currentHour = new Date().getHours();
        if (currentHour >= stopF && currentHour < stopE) {
            await sleep(60 * 1000); // 每分钟检查一次
            return setImmediate(rotate);
        }

        const startTime = new Date();
        const startTimestamp = startTime.getTime();
        let count = 0;
        let successCount = 0;
        let onlineCount = 0;
        let offlineCount = 0;
        let nonStreamerCount = 0;

        // 重置 viewCount 的数据库计数（首次运行时）
        if (viewCount === 1) {
            try {
                await dbm.updateSettingValue('count', 0);
            } catch (err) {
                // 忽略错误
            }
        }

        // 遍历处理每个主播
        for (const vtb of vtbs) {
            const site = vtb.site;

            // 跳过被暂停的站点
            if (siteStopList.includes(site)) {
                continue;
            }

            count++;
            const vmid = vtb.mid;
            const apiHandler = apiHandlers[site];

            if (apiHandler) {
                // 异步处理，不阻塞循环
                try {
                    await AsyncGetUpdateVtb(apiHandler, vmid, vtb);
                    successCount++;
                } catch (err) {
                    // 忽略错误
                }
            } else {
                $.log('当前网站没有对应响应处理程序 => ' + site);
            }

            // 统计主播状态
            const liveStatus = vtb.liveStatus ? vtb.liveStatus.toString() : '0';
            if (liveStatus === '1') {
                onlineCount++;
            } else if (liveStatus === '0') {
                offlineCount++;
            } else {
                nonStreamerCount++;
            }

            // 每个主播处理后等待指定间隔
            await sleep(interval * 1000);
        }

        // 如果没有主播数据，也等待间隔时间
        if (!vtbs.length) {
            await sleep(interval * 1000);
        }

        // 计算运行时间并记录
        const endTime = new Date();
        const endTimestamp = endTime.getTime();
        const elapsedTime = endTime - startTime;
        const elapsedTimeSec = elapsedTime / 1000;
        const successRate = count > 0 ? (successCount / count * 100).toFixed(2) : 0;
        
        // 只有当扫描数量发生变化时才输出日志
        if (count !== lastCount) {
            $.log(`本次运行时间: ${elapsedTimeSec} 秒, 扫描数量: ${count}`);
            lastCount = count;
        }
        
        // 输出统计信息
        $.log(`监控统计: 成功: ${successCount}, 失败: ${count - successCount}, 成功率: ${successRate}%`);
        $.log(`主播状态: 在线: ${onlineCount}, 离线: ${offlineCount}, 非主播: ${nonStreamerCount}`);

        // 持久化次数与耗时统计
        try {
            await dbm.updateSettingValue('count', `${viewCount}#${elapsedTimeSec}#${count}`);
            
            // 持久化监控统计数据
            await dbm.addMonitorStats(startTimestamp, endTimestamp, elapsedTimeSec, count, successCount, successRate, onlineCount, offlineCount, nonStreamerCount);
        } catch (err) {
            // 忽略持久化失败
            console.log('持久化监控统计数据失败:', err.message);
        }

        viewCount++;
        setImmediate(rotate);
    })();

    $.log('监控模块加载完毕。。。');
};
