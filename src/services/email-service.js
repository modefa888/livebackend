const nodemailer = require('nodemailer');
const db = require('../config/db');

let transporter = null;
let activeConfig = null;

// 初始化邮件传输器（使用默认配置）
const initTransporter = async () => {
  try {
    activeConfig = await getActiveEmailConfig();
    
    if (!activeConfig) {
      console.log('[EmailService] 没有启用的邮箱配置');
      return null;
    }

    transporter = nodemailer.createTransport({
      host: activeConfig.host,
      port: parseInt(activeConfig.port),
      secure: activeConfig.secure === 1 || activeConfig.secure === true,
      auth: {
        user: activeConfig.user,
        pass: activeConfig.pass
      }
    });

    console.log('[EmailService] 邮件服务初始化成功');
    return transporter;
  } catch (error) {
    console.error('[EmailService] 初始化失败:', error.message);
    return null;
  }
};

// 获取所有邮箱配置
const getAllEmailConfigs = async () => {
  try {
    const [configs] = await db.execute('SELECT * FROM email_configs ORDER BY is_default DESC, created_at DESC');
    return configs;
  } catch (error) {
    console.error('[EmailService] 获取邮箱配置列表失败:', error.message);
    return [];
  }
};

// 获取启用的邮箱配置（优先默认）
const getActiveEmailConfig = async () => {
  try {
    const [configs] = await db.execute(
      'SELECT * FROM email_configs WHERE is_active = 1 ORDER BY is_default DESC LIMIT 1'
    );
    return configs.length > 0 ? configs[0] : null;
  } catch (error) {
    console.error('[EmailService] 获取启用的邮箱配置失败:', error.message);
    return null;
  }
};

// 获取单个邮箱配置
const getEmailConfigById = async (id) => {
  try {
    const [configs] = await db.execute('SELECT * FROM email_configs WHERE id = ?', [id]);
    return configs.length > 0 ? configs[0] : null;
  } catch (error) {
    console.error('[EmailService] 获取邮箱配置失败:', error.message);
    return null;
  }
};

// 保存邮箱配置（新增或更新）
const saveEmailConfig = async (config) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    if (config.is_default === 1) {
      await connection.execute('UPDATE email_configs SET is_default = 0');
    }
    
    if (config.id) {
      await connection.execute(
        `UPDATE email_configs 
         SET name = ?, host = ?, port = ?, secure = ?, user = ?, pass = ?, 
             from_email = ?, from_name = ?, is_active = ?, is_default = ?
         WHERE id = ?`,
        [
          config.name, config.host, config.port, config.secure, config.user, config.pass,
          config.from_email, config.from_name, config.is_active, config.is_default, config.id
        ]
      );
      await connection.commit();
      return { success: true, id: config.id, action: 'update' };
    } else {
      const [result] = await connection.execute(
        `INSERT INTO email_configs 
         (name, host, port, secure, user, pass, from_email, from_name, is_active, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          config.name, config.host, config.port, config.secure, config.user, config.pass,
          config.from_email, config.from_name, config.is_active, config.is_default
        ]
      );
      await connection.commit();
      return { success: true, id: result.insertId, action: 'insert' };
    }
  } catch (error) {
    await connection.rollback();
    console.error('[EmailService] 保存邮箱配置失败:', error.message);
    return { success: false, error: error.message };
  } finally {
    connection.release();
  }
};

// 删除邮箱配置
const deleteEmailConfig = async (id) => {
  try {
    await db.execute('DELETE FROM email_configs WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    console.error('[EmailService] 删除邮箱配置失败:', error.message);
    return { success: false, error: error.message };
  }
};

// 设置默认配置
const setDefaultConfig = async (id) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    await connection.execute('UPDATE email_configs SET is_default = 0');
    await connection.execute('UPDATE email_configs SET is_default = 1 WHERE id = ?', [id]);
    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error('[EmailService] 设置默认配置失败:', error.message);
    return { success: false, error: error.message };
  } finally {
    connection.release();
  }
};

// 获取当前邮箱配置（保留原有接口兼容（用于兼容之前的前端代码
const getEmailConfig = async () => {
  try {
    const config = await getActiveEmailConfig();
    
    if (!config) {
      return {
        enabled: '0',
        host: '',
        port: '587',
        secure: '0',
        user: '',
        pass: '',
        from: '',
        fromName: 'LiveBot 系统'
      };
    }
    
    return {
      enabled: config.is_active ? '1' : '0',
      host: config.host,
      port: String(config.port),
      secure: config.secure ? '1' : '0',
      user: config.user,
      pass: config.pass,
      from: config.from_email || config.user,
      fromName: config.from_name
    };
  } catch (error) {
    console.error('[EmailService] 获取邮件配置失败:', error.message);
    return {
      enabled: '0',
      host: '',
      port: '587',
      secure: '0',
      user: '',
      pass: '',
      from: '',
      fromName: 'LiveBot 系统'
    };
  }
};

// 发送邮件
const sendEmail = async (to, subject, html, text = '') => {
  try {
    if (!transporter) {
      await initTransporter();
    }

    if (!transporter || !activeConfig) {
      throw new Error('邮件服务未初始化');
    }

    const mailOptions = {
      from: `"${activeConfig.from_name}" <${activeConfig.from_email || activeConfig.user}>`,
      to: to,
      subject: subject,
      text: text,
      html: html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[EmailService] 邮件发送成功:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService] 邮件发送失败:', error.message);
    return { success: false, error: error.message };
  }
};

// 生成验证码
const generateVerificationCode = (length = 6) => {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// 发送验证码邮件
const sendVerificationCode = async (email, type = 'register') => {
  try {
    const code = generateVerificationCode();
    
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    await db.execute(
      'DELETE FROM email_verification_codes WHERE email = ? AND type = ?',
      [email, type]
    );
    
    await db.execute(
      'INSERT INTO email_verification_codes (email, code, type, expires_at) VALUES (?, ?, ?, ?)',
      [email, code, type, expiresAt]
    );
    
    const subject = type === 'register' 
      ? '【LiveBot】注册验证码' 
      : type === 'reset' 
        ? '【LiveBot】密码重置验证码' 
        : '【LiveBot】验证码';
    
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #1890ff; text-align: center;">LiveBot 系统</h2>
        <div style="background: #f5f5f5; padding: 30px; border-radius: 8px; margin: 20px 0;">
          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">您好，</p>
          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
            您的验证码为：
          </p>
          <div style="background: white; padding: 20px; text-align: center; border-radius: 6px; font-size: 32px; font-weight: bold; color: #1890ff; letter-spacing: 8px;">
            ${code}
          </div>
          <p style="font-size: 14px; color: #999; margin-top: 20px;">
            此验证码将在 10 分钟后过期，请尽快使用。
          </p>
          <p style="font-size: 14px; color: #999;">
            如果这不是您本人的操作，请忽略此邮件。
          </p>
        </div>
        <div style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
          <p>此邮件由系统自动发送，请勿回复</p>
        </div>
      </div>
    `;
    
    const text = `LiveBot 系统\n\n您的验证码为：${code}\n\n此验证码将在 10 分钟后过期，请尽快使用。\n如果这不是您本人的操作，请忽略此邮件。`;
    
    const result = await sendEmail(email, subject, html, text);
    return result;
  } catch (error) {
    console.error('[EmailService] 发送验证码失败:', error.message);
    return { success: false, error: error.message };
  }
};

// 验证验证码
const verifyCode = async (email, code, type = 'register') => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM email_verification_codes WHERE email = ? AND code = ? AND type = ? AND expires_at > NOW()',
      [email, code, type]
    );
    
    if (rows.length === 0) {
      return { success: false, error: '验证码无效或已过期' };
    }
    
    await db.execute(
      'DELETE FROM email_verification_codes WHERE id = ?',
      [rows[0].id]
    );
    
    return { success: true };
  } catch (error) {
    console.error('[EmailService] 验证验证码失败:', error.message);
    return { success: false, error: error.message };
  }
};

// 发送系统通知邮件
const sendSystemNotification = async (to, subject, content) => {
  try {
    const html = `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #1890ff; text-align: center;">LiveBot 系统通知</h2>
        <div style="background: #f5f5f5; padding: 30px; border-radius: 8px; margin: 20px 0;">
          ${content}
        </div>
        <div style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
          <p>此邮件由系统自动发送，请勿回复</p>
        </div>
      </div>
    `;
    
    const text = `LiveBot 系统通知\n\n${content.replace(/<[^>]*>/g, '')}`;
    
    return await sendEmail(to, subject, html, text);
  } catch (error) {
    console.error('[EmailService] 发送系统通知失败:', error.message);
    return { success: false, error: error.message };
  }
};

// 测试邮件连接
const testConnection = async (config) => {
  try {
    const testTransporter = nodemailer.createTransport({
      host: config.host,
      port: parseInt(config.port),
      secure: config.secure === '1' || config.secure === true,
      auth: {
        user: config.user,
        pass: config.pass
      }
    });

    await testTransporter.verify();
    console.log('[EmailService] 邮件服务器连接测试成功');
    return { success: true };
  } catch (error) {
    console.error('[EmailService] 邮件服务器连接测试失败:', error.message);
    return { success: false, error: error.message };
  }
};

// 更新配置并重新初始化
const updateConfigAndReload = async () => {
  try {
    await initTransporter();
    return { success: true };
  } catch (error) {
    console.error('[EmailService] 重新加载配置失败:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  initTransporter,
  getEmailConfig,
  getAllEmailConfigs,
  getActiveEmailConfig,
  getEmailConfigById,
  saveEmailConfig,
  deleteEmailConfig,
  setDefaultConfig,
  sendEmail,
  sendVerificationCode,
  verifyCode,
  sendSystemNotification,
  testConnection,
  updateConfigAndReload
};
