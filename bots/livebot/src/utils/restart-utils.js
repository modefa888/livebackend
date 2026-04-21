const { exec } = require('child_process');

// 重启应用程序
function restartApp() {
    exec('pm2 restart 0', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error restarting PM2: ${error}`); // 由于是当前项目，无法输出
            return;
        }
        console.log(`PM2 restart output: ${stdout}`);  // 由于是当前项目，无法输出
    });
};

module.exports = {
    restartApp
}
