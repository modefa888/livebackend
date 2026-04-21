const express = require('express');
const db = require('../config/db');
const { logOperation } = require('./operation-logs');
const emailService = require('../services/email-service');
const router = express.Router();

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

// 中间件：验证是否是管理员
const isAdmin = async (req, res, next) => {
  try {
    const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    const user = users[0];
    if (user.role !== 'admin') {
      return res.status(403).json({ message: '需要管理员权限' });
    }
    
    req.isAdmin = true;
    next();
  } catch (error) {
    console.error('管理员验证错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 获取所有设置
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [settings] = await db.execute('SELECT * FROM bot_settings WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
    res.status(200).json(settings);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取设置列表错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取设置列表错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 获取单个设置
router.get('/:key', authenticateToken, async (req, res) => {
  const { key } = req.params;
  
  try {
    const [settings] = await db.execute('SELECT * FROM bot_settings WHERE user_id = ? AND setting_key = ?', [req.user.id, key]);
    
    if (settings.length === 0) {
      return res.status(404).json({ message: '设置不存在' });
    }
    
    res.status(200).json(settings[0]);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('获取设置详情错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('获取设置详情错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 添加或更新设置
router.post('/', authenticateToken, async (req, res) => {
  const { key, value, description, status = 1, setting_type = 'string', category = 'user' } = req.body;
  
  try {
    // 检查设置是否存在
    const [existingSettings] = await db.execute('SELECT * FROM bot_settings WHERE user_id = ? AND setting_key = ?', [req.user.id, key]);
    
    if (existingSettings.length > 0) {
      // 获取原设置值
      const originalValue = existingSettings[0].setting_value;
      const originalDescription = existingSettings[0].description;
      
      // 更新设置
      await db.execute(
        'UPDATE bot_settings SET setting_value = ?, description = ?, status = ?, setting_type = ?, category = ? WHERE user_id = ? AND setting_key = ?',
        [value, description, status, setting_type, category, req.user.id, key]
      );
      
      // 记录操作日志
      console.log('记录操作日志 - 更新设置:', req.user, key, value, description);
      await logOperation(req, 'update', 'setting', key, key, `更新设置: ${key}, 值: ${originalValue} → ${value}, 描述: ${originalDescription} → ${description}`);
      
      res.status(200).json({ message: '设置更新成功' });
    } else {
      // 添加新设置
      await db.execute(
        'INSERT INTO bot_settings (user_id, setting_key, setting_value, description, setting_type, category, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, key, value, description, setting_type, category, status]
      );
      
      // 记录操作日志
      await logOperation(req, 'add', 'setting', key, key, `添加设置: ${key}, 值: ${value}, 描述: ${description}`);
      
      res.status(201).json({ message: '设置添加成功' });
    }
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('添加/更新设置错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('添加/更新设置错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// 删除设置
router.delete('/:key', authenticateToken, async (req, res) => {
  const { key } = req.params;
  
  try {
    // 先获取设置信息
    const [existingSettings] = await db.execute('SELECT * FROM bot_settings WHERE user_id = ? AND setting_key = ?', [req.user.id, key]);
    if (existingSettings.length === 0) {
      return res.status(404).json({ message: '设置不存在' });
    }
    const settingValue = existingSettings[0].setting_value;
    const settingDescription = existingSettings[0].description;
    
    // 删除设置
    const [result] = await db.execute('DELETE FROM bot_settings WHERE user_id = ? AND setting_key = ?', [req.user.id, key]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '设置不存在' });
    }
    
    // 记录操作日志
    await logOperation(req, 'delete', 'setting', key, key, `删除设置: ${key}, 值: ${settingValue}, 描述: ${settingDescription}`);
    
    res.status(200).json({ message: '设置删除成功' });
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('删除设置错误: 数据库连接超时');
      res.status(500).json({ message: '数据库连接超时，请稍后再试' });
    } else {
      console.error('删除设置错误:', error.message);
      res.status(500).json({ message: '服务器内部错误' });
    }
  }
});

// ==================== 系统设置相关 ====================

// 获取系统设置
router.get('/system/all', authenticateToken, async (req, res) => {
  try {
    const [settings] = await db.execute('SELECT * FROM bot_settings WHERE user_id = ? AND category = ?', [0, 'system']);
    res.status(200).json(settings);
  } catch (error) {
    console.error('获取系统设置错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取系统设置（按分类）
router.get('/system/category/:category', authenticateToken, async (req, res) => {
  const { category } = req.params;
  try {
    const [settings] = await db.execute('SELECT * FROM bot_settings WHERE user_id = ? AND category = ?', [0, category]);
    res.status(200).json(settings);
  } catch (error) {
    console.error('获取系统设置错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 批量保存系统设置
router.post('/system/batch', authenticateToken, async (req, res) => {
  const { settings } = req.body;
  if (!Array.isArray(settings)) {
    return res.status(400).json({ message: 'settings 必须是数组' });
  }

  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    for (const setting of settings) {
      const { key, value, description, status = 1, setting_type = 'string', category = 'system' } = setting;
      
      // 检查设置是否存在
      const [existingSettings] = await connection.execute(
        'SELECT * FROM bot_settings WHERE user_id = ? AND setting_key = ?',
        [0, key]
      );
      
      if (existingSettings.length > 0) {
        // 更新设置
        await connection.execute(
          'UPDATE bot_settings SET setting_value = ?, description = ?, status = ?, setting_type = ?, category = ? WHERE user_id = ? AND setting_key = ?',
          [value, description, status, setting_type, category, 0, key]
        );
      } else {
        // 添加新设置
        await connection.execute(
          'INSERT INTO bot_settings (user_id, setting_key, setting_value, description, setting_type, category, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [0, key, value, description, setting_type, category, status]
        );
      }
    }

    await connection.commit();
    
    // 记录操作日志
    await logOperation(req, 'update', 'setting', 'system', 'system', `批量更新系统设置: ${settings.map(s => s.key).join(', ')}`);
    
    // 重新加载邮件配置
    await emailService.updateConfigAndReload();
    
    res.status(200).json({ message: '系统设置更新成功' });
  } catch (error) {
    await connection.rollback();
    console.error('批量保存系统设置错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  } finally {
    connection.release();
  }
});

// ==================== 邮件相关 ====================

// 获取所有邮箱配置
router.get('/email/configs', authenticateToken, async (req, res) => {
  try {
    const configs = await emailService.getAllEmailConfigs();
    res.status(200).json(configs);
  } catch (error) {
    console.error('获取邮箱配置列表错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取单个邮箱配置
router.get('/email/config/:id', authenticateToken, async (req, res) => {
  try {
    const config = await emailService.getEmailConfigById(req.params.id);
    if (!config) {
      return res.status(404).json({ message: '配置不存在' });
    }
    res.status(200).json(config);
  } catch (error) {
    console.error('获取邮箱配置错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 保存邮箱配置（新增或更新）
router.post('/email/config', authenticateToken, async (req, res) => {
  try {
    const config = req.body;
    const result = await emailService.saveEmailConfig(config);
    
    if (result.success) {
      // 重新加载邮件配置
      await emailService.updateConfigAndReload();
      res.status(200).json({ message: '配置保存成功', id: result.id, action: result.action });
    } else {
      res.status(400).json({ message: '配置保存失败', error: result.error });
    }
  } catch (error) {
    console.error('保存邮箱配置错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 删除邮箱配置
router.delete('/email/config/:id', authenticateToken, async (req, res) => {
  try {
    const result = await emailService.deleteEmailConfig(req.params.id);
    
    if (result.success) {
      await emailService.updateConfigAndReload();
      res.status(200).json({ message: '配置删除成功' });
    } else {
      res.status(400).json({ message: '配置删除失败', error: result.error });
    }
  } catch (error) {
    console.error('删除邮箱配置错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 设置默认邮箱配置
router.put('/email/config/:id/default', authenticateToken, async (req, res) => {
  try {
    const result = await emailService.setDefaultConfig(req.params.id);
    
    if (result.success) {
      await emailService.updateConfigAndReload();
      res.status(200).json({ message: '设置默认配置成功' });
    } else {
      res.status(400).json({ message: '设置默认配置失败', error: result.error });
    }
  } catch (error) {
    console.error('设置默认邮箱配置错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取当前邮件配置（兼容旧接口）
router.get('/email/config', authenticateToken, async (req, res) => {
  try {
    const config = await emailService.getEmailConfig();
    res.status(200).json(config);
  } catch (error) {
    console.error('获取邮件配置错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 测试邮件连接
router.post('/email/test-connection', authenticateToken, async (req, res) => {
  try {
    const config = req.body;
    const result = await emailService.testConnection(config);
    
    if (result.success) {
      res.status(200).json({ message: '邮件服务器连接成功' });
    } else {
      res.status(400).json({ message: '邮件服务器连接失败', error: result.error });
    }
  } catch (error) {
    console.error('测试邮件连接错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 发送测试邮件
router.post('/email/send-test', authenticateToken, async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ message: '请提供收件人邮箱' });
    }
    
    const subject = '【LiveBot】测试邮件';
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #1890ff; text-align: center;">LiveBot 系统</h2>
        <div style="background: #f5f5f5; padding: 30px; border-radius: 8px; margin: 20px 0;">
          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">您好，</p>
          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">这是一封来自 LiveBot 系统的测试邮件。</p>
          <p style="font-size: 16px; color: #333;">如果您能收到此邮件，说明邮件服务配置成功！</p>
        </div>
        <div style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
          <p>此邮件由系统自动发送，请勿回复</p>
        </div>
      </div>
    `;
    const text = 'LiveBot 系统\n\n这是一封来自 LiveBot 系统的测试邮件。\n如果您能收到此邮件，说明邮件服务配置成功！';
    
    const result = await emailService.sendEmail(to, subject, html, text);
    
    if (result.success) {
      res.status(200).json({ message: '测试邮件发送成功' });
    } else {
      res.status(400).json({ message: '测试邮件发送失败', error: result.error });
    }
  } catch (error) {
    console.error('发送测试邮件错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 发送验证码（公开接口，不需要登录）
router.post('/email/send-code', async (req, res) => {
  try {
    const { email, type = 'register' } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: '请提供邮箱地址' });
    }
    
    // 简单的邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: '邮箱格式不正确' });
    }
    
    const result = await emailService.sendVerificationCode(email, type);
    
    if (result.success) {
      res.status(200).json({ message: '验证码发送成功' });
    } else {
      res.status(400).json({ message: '验证码发送失败', error: result.error });
    }
  } catch (error) {
    console.error('发送验证码错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 验证验证码（公开接口，不需要登录）
router.post('/email/verify-code', async (req, res) => {
  try {
    const { email, code, type = 'register' } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ message: '请提供邮箱和验证码' });
    }
    
    const result = await emailService.verifyCode(email, code, type);
    
    if (result.success) {
      res.status(200).json({ message: '验证码验证成功' });
    } else {
      res.status(400).json({ message: '验证码验证失败', error: result.error });
    }
  } catch (error) {
    console.error('验证验证码错误:', error.message);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;