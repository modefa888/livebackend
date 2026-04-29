const express = require('express');
const spiderLoader = require('../services/spider/spider-loader');
const db = require('../config/db');
const { get } = require('../utils/cacheData');

const router = express.Router();

const logRequest = async (spiderId, endpoint, params, resultCode, resultMessage, ipAddress, userId, executionTime) => {
    try {
        await db.execute(`
            INSERT INTO spider_api_logs 
            (spider_id, endpoint, params, result_code, result_message, ip_address, user_id, execution_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [spiderId, endpoint, JSON.stringify(params), resultCode, resultMessage, ipAddress, userId, executionTime]);
    } catch (error) {
        console.error('[SpiderAPI] 记录日志失败:', error);
    }
};

const authenticateIfNeeded = async (config, req) => {
    if (!config.require_auth) return { allowed: true, userId: null };

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return { allowed: false, error: '需要登录才能访问此接口' };
    }

    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

        if (config.require_admin && decoded.permissionLevel < 2) {
            return { allowed: false, error: '需要管理员权限才能访问此接口' };
        }

        return { allowed: true, userId: decoded.id };
    } catch (error) {
        return { allowed: false, error: '无效的认证令牌' };
    }
};

const getCacheKey = (config, req) => {
    if (!config.cache_enabled) return null;
    return `spider_api:${config.file_name}:${req.originalUrl}`;
};

const matchRoute = (pattern, path) => {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) {
        return null;
    }

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = pathParts[i];
        } else if (patternParts[i] !== pathParts[i]) {
            return null;
        }
    }

    return params;
};

const handleSpiderRequest = async (req, res, next) => {
    const startTime = Date.now();
    const fileName = req.params.fileName;
    const originalPath = '/spider-api/' + fileName + (req.params[0] ? '/' + req.params[0] : '');
    const config = spiderLoader.getSpiderConfig(fileName);

    if (!config) {
        return res.status(404).json({ code: 404, message: '爬虫接口不存在' });
    }

    if (!config.is_enabled) {
        return res.status(403).json({ code: 403, message: '此爬虫接口已被禁用' });
    }

    if (config.require_auth) {
        const auth = await authenticateIfNeeded(config, req);
        if (!auth.allowed) {
            return res.status(401).json({ code: 401, message: auth.error });
        }
    }

    const spider = spiderLoader.getSpider(fileName);
    if (!spider || !spider.router) {
        return res.status(500).json({ code: 500, message: '爬虫模块加载失败' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userId = config.require_auth ? (await authenticateIfNeeded(config, req)).userId : null;

    try {
        if (config.rate_limit_enabled) {
            const redisClient = require('../config/redis').client;
            if (redisClient) {
                const key = `ratelimit:spider:${fileName}:${ipAddress}`;
                const current = await redisClient.incr(key);
                if (current === 1) {
                    await redisClient.expire(key, 60);
                }
                if (current > config.rate_limit_count) {
                    await logRequest(config.id, originalPath, req.query, 429, '请求过于频繁', ipAddress, userId, Date.now() - startTime);
                    return res.status(429).json({ code: 429, message: '请求过于频繁' });
                }
            }
        }

        const cached = await get(getCacheKey(config, req));
        if (cached) {
            await logRequest(config.id, originalPath, req.query, 200, '从缓存获取', ipAddress, userId, Date.now() - startTime);
            return res.json({ code: 200, message: '获取成功（缓存）', data: cached, from: 'cache' });
        }

        const subRouter = spider.router;
        const requestPath = '/' + (req.params[0] || '');

        const layer = subRouter.stack.find(layer => {
            if (!layer.route) return false;
            const params = matchRoute(layer.route.path, requestPath);
            if (params) {
                req.params = { ...req.params, ...params };
                return true;
            }
            return false;
        });

        if (layer) {
            const handler = layer.route.stack[0].handle;
            const originalSend = res.send;
            res.send = function(data) {
                const result = originalSend.apply(this, arguments);
                logRequest(config.id, originalPath, req.query, res.statusCode, '请求成功', ipAddress, userId, Date.now() - startTime).catch(console.error);
                return result;
            };
            
            handler(req, res, (err) => {
                if (err) {
                    console.error('[SpiderAPI] 路由错误:', err);
                    logRequest(config.id, originalPath, req.query, 500, err.message, ipAddress, userId, Date.now() - startTime).catch(console.error);
                    return res.status(500).json({ code: 500, message: '处理请求时出错' });
                }
            });
        } else {
            await logRequest(config.id, originalPath, req.query, 404, '接口路径不存在', ipAddress, userId, Date.now() - startTime);
            res.status(404).json({ code: 404, message: '接口路径不存在' });
        }
    } catch (error) {
        console.error(`[SpiderAPI] 处理请求失败:`, error);
        await logRequest(config.id, originalPath, req.query, 500, error.message, ipAddress, userId, Date.now() - startTime);
        res.status(500).json({ code: 500, message: error.message || '服务器内部错误' });
    }
};

router.use('/:fileName/*?', handleSpiderRequest);

module.exports = router;