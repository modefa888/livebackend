const express = require('express');
const router = express.Router();
const streamerManager = require('../services/robot/streamer-manager');
const { logOperation } = require('./operation-logs');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.sendStatus(401);
    }
    
    next();
};

router.post('/streamers', authenticateToken, async (req, res) => {
    try {
        const { url } = req.body;
        const result = await streamerManager.addStreamer(url);
        
        if (result.success) {
            await logOperation(req.user?.id, req.user?.username, 'add', 'streamer', result.mid, result.username);
        }
        
        res.json(result);
    } catch (error) {
        console.error('添加主播失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.get('/streamers', authenticateToken, async (req, res) => {
    try {
        const result = await streamerManager.getStreamers();
        res.json(result);
    } catch (error) {
        console.error('获取主播列表失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.get('/streamers/online', authenticateToken, async (req, res) => {
    try {
        const result = await streamerManager.getOnlineStreamers();
        res.json(result);
    } catch (error) {
        console.error('获取在线主播失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.delete('/streamers/:id', authenticateToken, async (req, res) => {
    try {
        const result = await streamerManager.deleteStreamer(req.params.id);
        
        if (result.success) {
            await logOperation(req.user?.id, req.user?.username, 'delete', 'streamer', req.params.id);
        }
        
        res.json(result);
    } catch (error) {
        console.error('删除主播失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/parser', authenticateToken, async (req, res) => {
    try {
        const { url } = req.body;
        const result = await streamerManager.parseUrl(url);
        res.json(result);
    } catch (error) {
        console.error('解析链接失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
