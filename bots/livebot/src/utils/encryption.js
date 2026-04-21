const crypto = require('crypto');

// 加密密钥，应该从环境变量中获取
const SECRET_KEY = process.env.ENCRYPTION_KEY || 'your-secret-key-for-encryption';
const IV_LENGTH = 16; // 初始化向量长度

/**
 * 将字符串转换为 32 字节密钥（用于 AES-256）
 * @param {string} str - 输入字符串
 * @returns {Buffer} 32字节密钥
 */
function getKeyBytes(str) {
  const key = Buffer.alloc(32);
  const strBuffer = Buffer.from(str);
  for (let i = 0; i < 32; i++) {
    key[i] = strBuffer[i % strBuffer.length];
  }
  return key;
}

/**
 * 加密数据
 * @param {string} text - 要加密的文本
 * @returns {string} 加密后的文本
 */
function encrypt(text) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getKeyBytes(SECRET_KEY);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    console.error('加密失败:', error);
    return text; // 加密失败时返回原文本
  }
}

/**
 * 解密数据
 * @param {string} text - 要解密的文本
 * @returns {string} 解密后的文本
 */
function decrypt(text) {
  try {
    // 检查是否为加密格式（包含冒号分隔的IV和密文）
    if (!text || !text.includes(':')) {
      return text; // 不是加密格式，直接返回原文
    }

    const textParts = text.split(':');
    if (textParts.length < 2) {
      return text; // 格式不正确，返回原文
    }

    const ivHex = textParts.shift();
    const encryptedHex = textParts.join(':');

    // 验证IV长度是否为32个字符（16字节）
    if (ivHex.length !== 32) {
      return text; // IV长度不正确，可能是明文
    }

    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const key = getKeyBytes(SECRET_KEY);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('解密失败:', error);
    return text; // 解密失败时返回原文本
  }
}

/**
 * 加密环境配置中的敏感字段
 * @param {object} environment - 环境配置对象
 * @returns {object} 加密后的环境配置对象
 */
function encryptEnvironment(environment) {
  const sensitiveFields = ['bot_token', 'authorization', 'github_token'];
  const encryptedEnv = { ...environment };
  
  sensitiveFields.forEach(field => {
    if (encryptedEnv[field]) {
      encryptedEnv[field] = encrypt(encryptedEnv[field]);
    }
  });
  
  return encryptedEnv;
}

/**
 * 解密环境配置中的敏感字段
 * @param {object} environment - 加密的环境配置对象
 * @returns {object} 解密后的环境配置对象
 */
function decryptEnvironment(environment) {
  const sensitiveFields = ['bot_token', 'authorization', 'github_token'];
  const decryptedEnv = { ...environment };
  
  sensitiveFields.forEach(field => {
    if (decryptedEnv[field]) {
      decryptedEnv[field] = decrypt(decryptedEnv[field]);
    }
  });
  
  return decryptedEnv;
}

module.exports = {
  encrypt,
  decrypt,
  encryptEnvironment,
  decryptEnvironment
};