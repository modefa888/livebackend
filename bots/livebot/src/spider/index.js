const fs = require('fs');
const path = require('path');

// *************************
// Spider加载 - 优化版本
// *************************

let apiHandlersCache = null;

const getApiHandlers = () => {
    if (apiHandlersCache) {
        return apiHandlersCache;
    }

    const spiderFolder = path.resolve(__dirname, '../spider');
    const files = fs.readdirSync(spiderFolder);
    const apiHandlers = {};

    // 使用 for...of 循环代替 forEach，性能更好
    for (const file of files) {
        if (file === "index.js" || path.extname(file) !== '.js') {
            continue;
        }
        
        const modulePath = path.join(spiderFolder, file);
        try {
            const module = require(modulePath);
            if (typeof module.getStationStatus === 'function' && typeof module.getModuleName === 'function') {
                const moduleName = module.getModuleName();
                apiHandlers[moduleName] = module;
            }
        } catch (error) {
            console.error(`加载模块 ${modulePath} 失败:`, error);
        }
    }

    apiHandlersCache = apiHandlers;
    return apiHandlers;
};

// 立即执行一次初始化，保持向后兼容
const apiHandlers = getApiHandlers();

module.exports = {
    apiHandlers,
    getApiHandlers
}
