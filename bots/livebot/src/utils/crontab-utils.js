const cron = require('node-cron');
const exec = require('child_process').exec;

// 保存任务的引用，以便我们可以动态管理
let task;

// 默认调度时间（例如：每 60 分钟）
let scheduleTime = '*/60 * * * *';

let $ = null;
let dbm = null;

// 启动或更新定时任务
function startOrUpdateTask(schedule) {
    // 如果任务已经存在，先停止它
    if (task) {
        task.stop();
    }

    if (schedule !== 'none') {
        // 创建新的定时任务
        task = cron.schedule(schedule, () => {
            $.log('Restarting PM2 application 0');
            exec('pm2 restart 0', (error, stdout, stderr) => {
                if (error) {
                    $.log(`Error restarting PM2: ${error}`);
                    return;
                }
                $.log(`PM2 restart output: ${stdout}`);
            });
        });
        // $.log(`Task scheduled with cron pattern: ${schedule}`);
    } else {
        $.log('No scheduling task set (not restarting).');
    }
}

// 初始化任务
// startOrUpdateTask(scheduleTime);

function setScheduleTime(scheduleTimes){
    $.log('更新定时时间' + scheduleTimes);
    startOrUpdateTask(scheduleTimes);
    scheduleTime = scheduleTimes;
}

function getScheduleTime(){
    return scheduleTime;
}

function setConfig(config, dbsql){
    $ = config;
    dbm = dbsql;
}

module.exports = {
    setScheduleTime,  // 更改定时时间
    getScheduleTime,  // 获取定时时间
    setConfig, // 传入$,dbm
}
