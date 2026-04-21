require('dotenv').config();
const mysql = require('mysql2/promise');

// 环境配置
const environment = process.env.ENVIRONMENT || 'local';
const getEnvKey = (key) => process.env[`${environment.toUpperCase()}_${key}`];

// 数据库连接配置
const mysqlConfig = {
    host: getEnvKey('MYSQL_HOST'),
    port: parseInt(getEnvKey('MYSQL_PORT'), 10) || 3306,
    user: getEnvKey('MYSQL_USER'),
    password: getEnvKey('MYSQL_PASSWORD'),
    database: getEnvKey('MYSQL_DATABASE'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// 安全的 JSON 解析函数
const safeJSONParse = (str, defaultValue) => {
    try {
        return str ? JSON.parse(str) : defaultValue;
    } catch {
        return defaultValue;
    }
};

// 从数据库读取配置
const loadConfigFromDB = async () => {
    let connection;
    try {
        connection = await mysql.createConnection(mysqlConfig);
        
        // 并行执行所有查询，提高效率
        const [currentEnvResult, envConfigResult, systemSettingsResult, siteConfigResult] = await Promise.all([
            connection.execute('SELECT setting_value FROM bot_settings WHERE user_id IS NULL AND setting_key = ? LIMIT 1', ['current_environment']),
            connection.execute('SELECT app_name, bot_token, proxy, authorization, github_token, user_name, user_email, api_host, backend_port, frontend_port FROM env_configs WHERE env_name = ?', [environment]),
            connection.execute('SELECT setting_key, setting_value FROM bot_settings WHERE user_id IS NULL'),
            connection.execute('SELECT site_type, site_list FROM livebot_site_configs')
        ]);
        
        const currentEnv = currentEnvResult[0][0]?.setting_value || environment;
        const envConfig = envConfigResult[0][0] || {};
        
        // 将系统设置转换为对象
        const systemSettings = systemSettingsResult[0].reduce((acc, row) => {
            acc[row.setting_key] = row.setting_value;
            return acc;
        }, {});
        
        // 将网站配置转换为对象
        const siteConfigs = siteConfigResult[0].reduce((acc, row) => {
            acc[row.site_type] = row.site_list;
            return acc;
        }, {});
        
        // 构建配置对象
        const config = {
            environment: currentEnv,
            [currentEnv]: {
                appName: envConfig.app_name,
                token: envConfig.bot_token,
                proxy: envConfig.proxy,
                authorization: envConfig.authorization,
                github: envConfig.github_token,
                user: {
                    name: envConfig.user_name,
                    email: envConfig.user_email
                },
                apiHost: envConfig.api_host,
                backendPort: envConfig.backend_port,
                frontendPort: envConfig.frontend_port,
                mysql: mysqlConfig
            },
            dbName: systemSettings.DB_NAME,
            dbTableList: ['vtbs', 'watch', 'users', 'settings', 'cg', 'messages'],
            cgSite: siteConfigs.CG_SITE,
            interval: parseInt(systemSettings.INTERVAL, 10) || 30000,
            rateLimit: parseInt(systemSettings.RATE_LIMIT, 10) || 10,
            password: systemSettings.PASSWORD,
            timeout: parseInt(systemSettings.TIMEOUT, 10) || 30000,
            adminToken: systemSettings.ADMIN_TOKEN,
            GPCToken: systemSettings.GPC_TOKEN,
            scheduleTime: systemSettings.SCHEDULE_TIME,
            sourceData: systemSettings.SOURCE_DATA || 'mysql',
            extendAPI: systemSettings.EXTEND_API,
            weimiHost: systemSettings.WEIMI_HOST,
            maxConcurrent: parseInt(systemSettings.MAX_CONCURRENT, 10) || 5,
            s19Site: siteConfigs.S19_SITE,
            dyJxApi: systemSettings.DY_JX_API,
            dyJxGroups: systemSettings.DY_JX_GROUPS,
            biliJxGroups: systemSettings.BILI_JX_GROUPS,
            keyObject: safeJSONParse(systemSettings.KEY_OBJECT, {
                lucky: '超级福袋',
                looks: '颜值',
                game: '游戏',
                dance: '舞蹈',
                av: '19+',
                study: '学习',
                luckys: '普通福袋',
                null: '其他'
            }),
            siteKeyValue: safeJSONParse(systemSettings.SITE_KEY_VALUE, {
                'fd.live.douyin.com': '抖音福袋',
                'zh.stripchat.com': 'stripchat',
                'www.huya.com': '虎牙',
                'www.douyu.com': '斗鱼',
                'cc.163.com': '163',
                'live.douyin.com': '抖音',
                'live.bilibili.com': '哔哩哔哩',
                'www.pandalive.co.kr': 'pandalive',
                'play.afreecatv.com': 'afreecatv',
                'www.youtube.com': '油管',
                'chaturbate.com': 'c站',
                'www.51cg1.com': '51cg'
            })
        };
        
        return config;
    } catch (error) {
        console.error('从数据库加载配置失败:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end().catch(() => {});
        }
    }
};

module.exports = {
    loadConfigFromDB
};
