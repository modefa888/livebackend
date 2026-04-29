const fs = require('fs');
const path = require('path');
const db = require('../../config/db');

class SpiderLoader {
    constructor() {
        this.spidersDir = path.join(__dirname, '../../spiders');
        this.loadedSpiders = new Map();
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            await this.loadSpidersFromDB();
            this.initialized = true;
            console.log(`[SpiderLoader] 已加载 ${this.loadedSpiders.size} 个爬虫接口`);
        } catch (error) {
            console.error('[SpiderLoader] 初始化失败:', error);
            throw error;
        }
    }

    async loadSpidersFromDB() {
        try {
            const [configs] = await db.execute(
                'SELECT * FROM spider_api_configs WHERE is_enabled = 1'
            );

            this.loadedSpiders.clear();

            for (const config of configs) {
                try {
                    const spider = this.loadSpiderFile(config.file_name);
                    if (spider) {
                        const router = spider.default || spider;
                        this.loadedSpiders.set(config.file_name, {
                            config,
                            module: spider,
                            router: router
                        });
                    }
                } catch (err) {
                    console.error(`[SpiderLoader] 加载爬虫文件 ${config.file_name} 失败:`, err.message);
                }
            }
        } catch (error) {
            console.error('[SpiderLoader] 从数据库加载爬虫配置失败:', error);
            throw error;
        }
    }

    loadSpiderFile(fileName) {
        const filePath = path.join(this.spidersDir, `${fileName}.js`);

        if (!fs.existsSync(filePath)) {
            throw new Error(`爬虫文件不存在: ${filePath}`);
        }

        delete require.cache[require.resolve(filePath)];
        return require(filePath);
    }

    getSpider(fileName) {
        return this.loadedSpiders.get(fileName);
    }

    getAllSpiders() {
        return Array.from(this.loadedSpiders.values());
    }

    getSpiderConfig(fileName) {
        const spider = this.loadedSpiders.get(fileName);
        return spider ? spider.config : null;
    }

    async reloadSpider(fileName) {
        try {
            const [configs] = await db.execute(
                'SELECT * FROM spider_api_configs WHERE file_name = ?',
                [fileName]
            );

            if (configs.length === 0) {
                throw new Error('爬虫配置不存在');
            }

            const config = configs[0];
            const spider = this.loadSpiderFile(fileName);

            this.loadedSpiders.set(fileName, {
                config,
                module: spider,
                router: spider.default || spider
            });

            return true;
        } catch (error) {
            console.error(`[SpiderLoader] 重新加载爬虫 ${fileName} 失败:`, error);
            throw error;
        }
    }

    async disableSpider(fileName) {
        this.loadedSpiders.delete(fileName);
    }

    isSpiderLoaded(fileName) {
        return this.loadedSpiders.has(fileName);
    }
}

const spiderLoader = new SpiderLoader();

module.exports = spiderLoader;