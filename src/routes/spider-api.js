const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const spiderLoader = require('../services/spider/spider-loader');
const db = require('../config/db');
const { logOperation } = require('./operation-logs');

const authenticateToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: '未提供认证令牌' });
    }
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: '无效的认证令牌' });
    }
};

const verifyAdmin = async (req, res, next) => {
    if (req.user.permissionLevel < 2) {
        return res.status(403).json({ message: '权限不足' });
    }
    next();
};

const rateLimiter = (count, windowMs) => {
    const requests = new Map();
    return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const windowData = requests.get(key) || { count: 0, resetAt: now + windowMs };

        if (now > windowData.resetAt) {
            windowData.count = 0;
            windowData.resetAt = now + windowMs;
        }

        windowData.count++;
        requests.set(key, windowData);

        if (windowData.count > count) {
            return res.status(429).json({ message: '请求过于频繁，请稍后再试' });
        }
        next();
    };
};

router.get('/configs', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [configs] = await db.execute('SELECT * FROM spider_api_configs ORDER BY id DESC');
        const files = fs.readdirSync(spiderLoader.spidersDir).filter(f => f.endsWith('.js') && f !== 'index.js');

        const result = configs.map(cfg => {
            const exists = files.includes(`${cfg.file_name}.js`);
            const loaded = spiderLoader.isSpiderLoaded(cfg.file_name);
            return { ...cfg, exists, loaded };
        });

        const missingInDB = files.filter(f => {
            const name = f.replace('.js', '');
            return !result.some(r => r.file_name === name);
        });

        const notLoaded = result.filter(r => r.exists && !r.loaded);

        res.json({
            success: true,
            data: result,
            stats: {
                total: result.length,
                enabled: result.filter(r => r.is_enabled).length,
                disabled: result.filter(r => !r.is_enabled).length,
                loaded: result.filter(r => r.loaded).length,
                notLoaded: notLoaded.length,
                missingInDB: missingInDB.length
            },
            missingInDB: missingInDB.map(f => f.replace('.js', ''))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '获取配置失败', error: error.message });
    }
});

router.get('/files', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const files = fs.readdirSync(spiderLoader.spidersDir).filter(f => f.endsWith('.js') && f !== 'index.js');

        const result = await Promise.all(files.map(async (file) => {
            const name = file.replace('.js', '');
            const filePath = path.join(spiderLoader.spidersDir, file);
            const stats = fs.statSync(filePath);

            let moduleInfo = {};
            try {
                const mod = require(filePath);
                moduleInfo = {
                    name: mod.info?.name || mod.routerInfo?.name || name,
                    title: mod.info?.title || mod.routerInfo?.title || '',
                    subtitle: mod.info?.subtitle || mod.routerInfo?.subtitle || '',
                    category: mod.info?.category || mod.routerInfo?.category || ''
                };
            } catch (e) {
                moduleInfo = { error: e.message };
            }

            const [configs] = await db.execute('SELECT * FROM spider_api_configs WHERE file_name = ?', [name]);

            return {
                fileName: file,
                name: name,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                moduleInfo,
                config: configs[0] || null
            };
        }));

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: '获取文件列表失败', error: error.message });
    }
});

router.get('/config/:id', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [configs] = await db.execute('SELECT * FROM spider_api_configs WHERE id = ?', [req.params.id]);
        if (configs.length === 0) {
            return res.status(404).json({ success: false, message: '配置不存在' });
        }
        res.json({ success: true, data: configs[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: '获取配置失败', error: error.message });
    }
});

router.post('/config', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const {
            name, file_name, title = '', subtitle = '', category = '',
            description = '', is_enabled = 1, require_auth = 0,
            require_admin = 0, cache_enabled = 1, cache_ttl = 300,
            rate_limit_enabled = 0, rate_limit_count = 60
        } = req.body;

        if (!name || !file_name) {
            return res.status(400).json({ success: false, message: '名称和文件名不能为空' });
        }

        const safeFileName = file_name.replace(/[^a-zA-Z0-9_-]/g, '');
        const filePath = path.join(spiderLoader.spidersDir, `${safeFileName}.js`);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: '爬虫文件不存在' });
        }

        const [existing] = await db.execute('SELECT id FROM spider_api_configs WHERE file_name = ?', [safeFileName]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: '该文件已存在配置' });
        }

        await db.execute(`
            INSERT INTO spider_api_configs 
            (name, file_name, title, subtitle, category, description, is_enabled, require_auth, require_admin, cache_enabled, cache_ttl, rate_limit_enabled, rate_limit_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [name, safeFileName, title, subtitle, category, description, is_enabled, require_auth, require_admin, cache_enabled, cache_ttl, rate_limit_enabled, rate_limit_count]);

        if (is_enabled) {
            await spiderLoader.reloadSpider(safeFileName);
        }

        res.json({ success: true, message: '配置添加成功' });
    } catch (error) {
        res.status(500).json({ success: false, message: '添加配置失败', error: error.message });
    }
});

router.put('/config/:id', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        delete updates.id;
        delete updates.created_at;

        const fields = Object.keys(updates);
        const values = Object.values(updates);

        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: '没有需要更新的字段' });
        }

        const setClause = fields.map(f => `${f} = ?`).join(', ');
        await db.execute(`UPDATE spider_api_configs SET ${setClause} WHERE id = ?`, [...values, id]);

        const [configs] = await db.execute('SELECT file_name, is_enabled FROM spider_api_configs WHERE id = ?', [id]);
        if (configs.length > 0 && configs[0].is_enabled) {
            await spiderLoader.reloadSpider(configs[0].file_name);
        } else if (configs.length > 0) {
            await spiderLoader.disableSpider(configs[0].file_name);
        }
        
        await logOperation(req, 'update', '爬虫接口', parseInt(id), req.body.name || `接口${id}`, `更新爬虫接口配置`);
        
        res.json({ success: true, message: '配置更新成功' });
    } catch (error) {
        res.status(500).json({ success: false, message: '更新配置失败', error: error.message });
    }
});

router.delete('/config/:id', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const [configs] = await db.execute('SELECT file_name, name FROM spider_api_configs WHERE id = ?', [req.params.id]);
        if (configs.length === 0) {
            return res.status(404).json({ success: false, message: '配置不存在' });
        }
        
        const configName = configs[0].name;

        await spiderLoader.disableSpider(configs[0].file_name);
        await db.execute('DELETE FROM spider_api_configs WHERE id = ?', [req.params.id]);
        
        await logOperation(req, 'delete', '爬虫接口', parseInt(req.params.id), configName, `删除爬虫接口: ${configName}`);
        
        res.json({ success: true, message: '配置删除成功' });
    } catch (error) {
        res.status(500).json({ success: false, message: '删除配置失败', error: error.message });
    }
});

router.post('/reload/:fileName', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const { fileName } = req.params;
        await spiderLoader.reloadSpider(fileName);
        res.json({ success: true, message: '爬虫重载成功' });
    } catch (error) {
        res.status(500).json({ success: false, message: '重载失败', error: error.message });
    }
});

router.post('/reload-all', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        await spiderLoader.initialize();
        res.json({ success: true, message: '全部爬虫重载成功' });
    } catch (error) {
        res.status(500).json({ success: false, message: '重载失败', error: error.message });
    }
});

router.post('/discover', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const files = fs.readdirSync(spiderLoader.spidersDir).filter(f => f.endsWith('.js') && f !== 'index.js');
        
        const [existingConfigs] = await db.execute('SELECT file_name FROM spider_api_configs');
        const existingFileNames = existingConfigs.map(c => c.file_name);

        const added = [];
        const skipped = [];
        const failed = [];

        for (const file of files) {
            const fileName = file.replace('.js', '');
            
            if (existingFileNames.includes(fileName)) {
                skipped.push(fileName);
                continue;
            }

            try {
                const filePath = path.join(spiderLoader.spidersDir, file);
                let moduleInfo = {};
                try {
                    const mod = require(filePath);
                    moduleInfo = {
                        name: mod.info?.name || mod.routerInfo?.name || fileName,
                        title: mod.info?.title || mod.routerInfo?.title || fileName,
                        subtitle: mod.info?.subtitle || mod.routerInfo?.subtitle || '',
                        category: mod.info?.category || mod.routerInfo?.category || ''
                    };
                } catch (e) {
                    moduleInfo = { name: fileName, title: fileName, subtitle: '', category: '' };
                }

                await db.execute(`
                    INSERT INTO spider_api_configs 
                    (name, file_name, title, subtitle, category, description, is_enabled, require_auth, require_admin, cache_enabled, cache_ttl, rate_limit_enabled, rate_limit_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    moduleInfo.name,
                    fileName,
                    moduleInfo.title,
                    moduleInfo.subtitle,
                    moduleInfo.category,
                    '',
                    1,
                    0,
                    0,
                    1,
                    300,
                    0,
                    60
                ]);

                await spiderLoader.reloadSpider(fileName);
                added.push(fileName);
            } catch (error) {
                failed.push({ fileName, error: error.message });
            }
        }
        
        await logOperation(req, 'add', '爬虫接口', 0, `${added.length}个接口`, `发现并添加 ${added.length} 个爬虫接口`);
        
        res.json({
            success: true,
            message: `发现 ${files.length} 个爬虫文件`,
            added,
            skipped,
            failed
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '发现爬虫失败', error: error.message });
    }
});

router.get('/logs', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const { spider_id, limit = 100, offset = 0 } = req.query;

        let query = 'SELECT * FROM spider_api_logs WHERE 1=1';
        const params = [];

        if (spider_id) {
            query += ' AND spider_id = ?';
            params.push(spider_id);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [logs] = await db.execute(query, params);
        const [[{ total }]] = await db.execute(
            `SELECT COUNT(*) as total FROM spider_api_logs ${spider_id ? 'WHERE spider_id = ?' : ''}`,
            spider_id ? [spider_id] : []
        );

        res.json({ success: true, data: logs, total: total });
    } catch (error) {
        res.status(500).json({ success: false, message: '获取日志失败', error: error.message });
    }
});

router.delete('/logs', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const { days = 7 } = req.body;
        await db.execute('DELETE FROM spider_api_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [days]);
        res.json({ success: true, message: `已删除 ${days} 天前的日志` });
    } catch (error) {
        res.status(500).json({ success: false, message: '删除日志失败', error: error.message });
    }
});

router.get('/code/:fileName', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const { fileName } = req.params;
        const safeFileName = fileName.endsWith('.js') ? fileName : `${fileName}.js`;
        const filePath = path.join(spiderLoader.spidersDir, safeFileName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: '文件不存在', path: filePath });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ success: true, data: { fileName: safeFileName, content } });
    } catch (error) {
        res.status(500).json({ success: false, message: '读取文件失败', error: error.message });
    }
});

router.put('/code/:fileName', authenticateToken, verifyAdmin, async (req, res) => {
    try {
        const { fileName } = req.params;
        const { content } = req.body;

        if (content === undefined) {
            return res.status(400).json({ success: false, message: '内容不能为空' });
        }

        const safeFileName = fileName.endsWith('.js') ? fileName : `${fileName}.js`;
        const filePath = path.join(spiderLoader.spidersDir, safeFileName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: '文件不存在' });
        }

        fs.writeFileSync(filePath, content, 'utf-8');

        const moduleName = safeFileName.replace('.js', '');
        await spiderLoader.reloadSpider(moduleName);

        res.json({ success: true, message: '代码保存成功' });
    } catch (error) {
        res.status(500).json({ success: false, message: '保存文件失败', error: error.message });
    }
});

module.exports = router;