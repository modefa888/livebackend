const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { encryptEnvironment, decryptEnvironment } = require('../../bots/livebot/src/utils/encryption');

// 中间件：验证JWT令牌
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

// 中间件：验证管理员权限（管理员 permissionLevel = 2，超级管理员 permissionLevel = 3）
const verifyAdmin = async (req, res, next) => {
  if (req.user.permissionLevel < 2) {
    return res.status(403).json({ message: '权限不足' });
  }
  next();
};

// 获取所有环境配置
router.get('/environments', authenticateToken, async (req, res) => {
  try {
    const [environments] = await db.execute('SELECT * FROM env_configs');
    // 对每个环境配置的敏感字段进行加密
    const encryptedEnvironments = environments.map(env => encryptEnvironment(env));
    res.status(200).json({ environments: encryptedEnvironments });
  } catch (error) {
    res.status(500).json({ message: '获取环境配置失败', error: error.message });
  }
});

// 获取单个环境配置
router.get('/environments/:envName', authenticateToken, async (req, res) => {
  try {
    const { envName } = req.params;
    const [environments] = await db.execute('SELECT * FROM env_configs WHERE env_name = ?', [envName]);
    if (environments.length === 0) {
      return res.status(404).json({ message: '环境配置不存在' });
    }
    // 对环境配置的敏感字段进行加密
    const encryptedEnvironment = encryptEnvironment(environments[0]);
    res.status(200).json({ environment: encryptedEnvironment });
  } catch (error) {
    res.status(500).json({ message: '获取环境配置失败', error: error.message });
  }
});

// 更新环境配置
router.put('/environments/:envName', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { envName } = req.params;
    // 前端发送的是明文数据，直接使用
    const { app_name, bot_token, proxy, authorization, github_token, user_name, user_email, api_host, backend_port, frontend_port } = req.body;
    
    // 调试日志
    console.log('更新环境配置:', envName);
    console.log('接收到的数据:', { app_name, bot_token, proxy, authorization, github_token, user_name, user_email, api_host, backend_port, frontend_port });
    
    const [result] = await db.execute(
      'UPDATE env_configs SET app_name = ?, bot_token = ?, proxy = ?, authorization = ?, github_token = ?, user_name = ?, user_email = ?, api_host = ?, backend_port = ?, frontend_port = ? WHERE env_name = ?',
      [app_name, bot_token, proxy, authorization, github_token, user_name, user_email, api_host, backend_port, frontend_port, envName]
    );
    
    console.log('更新结果:', result);
    
    res.status(200).json({ success: true, message: '环境配置更新成功', affectedRows: result.affectedRows });
  } catch (error) {
    console.error('更新环境配置失败:', error);
    res.status(500).json({ message: '更新环境配置失败', error: error.message });
  }
});

// 获取系统设置
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    // 获取所有设置（包括有 user_id 的），优先使用系统设置（user_id IS NULL）
    const [allSettings] = await db.execute('SELECT * FROM bot_settings');
    
    // 合并设置：先取系统设置，再用用户设置覆盖（如果有的话）
    const settingsMap = new Map();
    for (const setting of allSettings) {
      if (setting.user_id === null) {
        // 系统设置优先
        settingsMap.set(setting.setting_key, setting);
      } else if (!settingsMap.has(setting.setting_key)) {
        // 如果没有系统设置，则使用用户设置
        settingsMap.set(setting.setting_key, setting);
      }
    }
    
    const settings = Array.from(settingsMap.values());
    res.status(200).json({ settings });
  } catch (error) {
    res.status(500).json({ message: '获取系统设置失败', error: error.message });
  }
});

// 更新系统设置
router.put('/settings', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { settings } = req.body;
    
    for (const setting of settings) {
      await db.execute(
        'UPDATE bot_settings SET setting_value = ? WHERE user_id IS NULL AND setting_key = ?',
        [setting.setting_value, setting.setting_key]
      );
    }
    
    res.status(200).json({ success: true, message: '系统设置更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新系统设置失败', error: error.message });
  }
});

// 获取网站配置
router.get('/sites', authenticateToken, async (req, res) => {
  try {
    const [sites] = await db.execute('SELECT * FROM livebot_site_configs');
    res.status(200).json({ sites });
  } catch (error) {
    res.status(500).json({ message: '获取网站配置失败', error: error.message });
  }
});

// 更新网站配置
router.put('/sites/:siteType', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { siteType } = req.params;
    const { site_list } = req.body;
    
    await db.execute(
      'UPDATE livebot_site_configs SET site_list = ? WHERE site_type = ?',
      [site_list, siteType]
    );
    
    res.status(200).json({ success: true, message: '网站配置更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新网站配置失败', error: error.message });
  }
});

// 获取当前环境
router.get('/current-env', authenticateToken, async (req, res) => {
  try {
    const [currentEnv] = await db.execute('SELECT setting_value FROM bot_settings WHERE user_id IS NULL AND setting_key = ?', ['current_environment']);
    res.status(200).json({ environment: currentEnv[0]?.setting_value || 'local' });
  } catch (error) {
    res.status(500).json({ message: '获取当前环境失败', error: error.message });
  }
});

// 更新当前环境
router.put('/current-env', authenticateToken, verifyAdmin, async (req, res) => {
  try {
    const { environment } = req.body;
    
    // 检查是否已存在当前环境配置
    const [existing] = await db.execute('SELECT id FROM bot_settings WHERE user_id IS NULL AND setting_key = ?', ['current_environment']);
    
    if (existing.length > 0) {
      // 更新现有配置
      await db.execute(
        'UPDATE bot_settings SET setting_value = ? WHERE user_id IS NULL AND setting_key = ?',
        [environment, 'current_environment']
      );
    } else {
      // 插入新配置
      await db.execute(
        'INSERT INTO bot_settings (user_id, setting_key, setting_value, status, description, setting_type, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [null, 'current_environment', environment, 1, '当前环境配置', 'string', 'system']
      );
    }
    
    res.status(200).json({ success: true, message: '当前环境更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新当前环境失败', error: error.message });
  }
});

module.exports = router;