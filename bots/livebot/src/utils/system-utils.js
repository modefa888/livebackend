const os = require('os');

// 格式化日期为北京时间（字符串）
function formatShanghaiTime(date) {
    const shanghaiOffset = 8 * 60 * 60 * 1000;
    const shanghaiTime = new Date(date.getTime() + shanghaiOffset);
    return shanghaiTime.toISOString().replace('T', ' ').split('.')[0] + ' (UTC+8)';
}

// 获取上次系统重启时间
async function getLastRestartDate() {
    const uptime = os.uptime();
    const currentTime = new Date();
    return new Date(currentTime - uptime * 1000);
}

// Telegram MarkdownV2 特殊字符转义
function escapeMarkdownV2(text) {
    return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// 主函数：生成系统信息报告
async function getSystemInfo() {
    const lines = [];
    lines.push('🖥️ **系统信息报告**');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 系统名和平台
    lines.push(`📦 系统类型: ${os.type()} (${os.platform()})`);
    lines.push(`🔧 架构: ${os.arch()}`);
    lines.push(`🧩 系统版本: ${os.release()}\n`);

    // CPU 信息
    const cpuInfo = os.cpus()[0];
    lines.push(`⚙️ CPU 型号: ${cpuInfo.model}`);
    lines.push(`🔢 核心数量: ${os.cpus().length}\n`);

    // 内存信息
    const totalMemGB = os.totalmem() / 1024 / 1024 / 1024;
    const freeMemGB = os.freemem() / 1024 / 1024 / 1024;
    const usedPercent = ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2);
    lines.push(`💾 内存总量: ${totalMemGB.toFixed(2)} GB`);
    lines.push(`📉 可用内存: ${freeMemGB.toFixed(2)} GB`);
    lines.push(`📈 内存使用率: ${usedPercent}%\n`);

    // 上次系统重启时间
    try {
        const restartDate = await getLastRestartDate();
        lines.push(`⏱️ 上次系统启动时间: ${formatShanghaiTime(restartDate)}\n`);
    } catch (e) {
        lines.push(`⚠️ 获取系统启动时间失败: ${e.message}\n`);
    }

    // 网络接口
    // lines.push('🌐 网络接口信息:');
    // const interfaces = os.networkInterfaces();
    // Object.keys(interfaces).forEach(name => {
    //     interfaces[name].forEach(iface => {
    //         if (!iface.internal && iface.family === 'IPv4') {
    //             lines.push(`   • ${name} → ${iface.address}`);
    //         }
    //     });
    // });


    lines.push('\n━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`📅 报告时间: ${formatShanghaiTime(new Date())}`);

    const text = lines.join('\n');
    const markdownV2 = escapeMarkdownV2(text);

    return { text, markdownV2 };
}

module.exports = { getSystemInfo };
