const express = require('express');
const router = express.Router();
const db = require('../config/db');
const crypto = require('crypto');

// 加密/解密配置 - 与Python代码保持一致
const ENCRYPTION_KEY = Buffer.from('\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10');
const IV = Buffer.from('\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10');
const BLOCK_SIZE = 16;

// 加密函数 - 与Python代码保持一致
function aes_encrypt(text) {
  try {
    // 将原始数据转换为字节类型
    const dataBytes = Buffer.from(text, 'utf8');
    // 对数据进行填充，确保长度是块大小（16字节）的整数倍
    const padding = BLOCK_SIZE - (dataBytes.length % BLOCK_SIZE);
    const paddedData = Buffer.concat([dataBytes, Buffer.alloc(padding, 0x00)]);
    // 创建AES加密对象，使用CBC模式
    const cipher = crypto.createCipheriv('aes-128-cbc', ENCRYPTION_KEY, IV);
    cipher.setAutoPadding(false); // 禁用自动填充，使用手动填充
    const encryptedData = Buffer.concat([cipher.update(paddedData), cipher.final()]);
    // 使用base64编码
    return encryptedData.toString('base64');
  } catch (error) {
    console.error('加密失败:', error);
    return text;
  }
}

// 解密函数 - 与Python代码保持一致
function aes_decrypt(encryptedData) {
  try {
    if (!encryptedData) return '';
    // 对base64编码的加密数据进行解码
    const encryptedBytes = Buffer.from(encryptedData, 'base64');
    // 创建AES解密对象，使用CBC模式
    const decipher = crypto.createDecipheriv('aes-128-cbc', ENCRYPTION_KEY, IV);
    decipher.setAutoPadding(false); // 禁用自动填充，使用手动填充
    const decryptedData = Buffer.concat([decipher.update(encryptedBytes), decipher.final()]);
    // 去除填充的数据，还原出原始数据
    const unpaddedData = decryptedData.toString('utf8').replace(/\0+$/, '');
    return unpaddedData;
  } catch (error) {
    console.error('解密失败:', error);
    return encryptedData;
  }
}

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

// 保存数据
router.post('/save-data', authenticateToken, async (req, res) => {
  try {
    const { pageTitle, pageHref, pageImg, m3u8List } = req.body;

    // 加密数据
    const encrypted_page_title = aes_encrypt(pageTitle);
    const encrypted_page_href = aes_encrypt(pageHref);
    const encrypted_page_img = pageImg ? aes_encrypt(pageImg) : aes_encrypt('');
    const encrypted_m3u8_list = m3u8List && Array.isArray(m3u8List) && m3u8List.length > 0 
      ? aes_encrypt(JSON.stringify(m3u8List)) 
      : aes_encrypt('');

    // 检查是否已存在相同标题的数据
    const [existing] = await db.execute(
      'SELECT COUNT(*) FROM site_info WHERE page_title = ?',
      [encrypted_page_title]
    );

    if (existing[0]['COUNT(*)'] > 0) {
      return res.status(409).json({ message: '数据已存在' });
    }

    // 插入数据
    await db.execute(
      'INSERT INTO site_info (page_title, page_href, page_img, m3u8_list) VALUES (?, ?, ?, ?)',
      [encrypted_page_title, encrypted_page_href, encrypted_page_img, encrypted_m3u8_list]
    );

    res.status(200).json({ message: '数据保存成功' });
  } catch (error) {
    console.error('保存数据失败:', error);
    res.status(500).json({ message: '数据保存失败' });
  }
});

// 按页查询数据（支持搜索）
router.get('/query-data-by-page', authenticateToken, async (req, res) => {
  try {
    const page_num = parseInt(req.query.page) || 1;
    const page_size = parseInt(req.query.size) || 10;
    const keyword = req.query.keyword || '';
    const offset = (page_num - 1) * page_size;

    const [results] = await db.execute(
      'SELECT id, page_title, page_href, page_img, m3u8_list, view_count, stars, create_time, local_img_path FROM site_info ORDER BY id DESC'
    );

    let data_list = results.map(row => {
      const decryptedM3u8List = aes_decrypt(row.m3u8_list);
      let m3u8_list = [];
      try {
        m3u8_list = decryptedM3u8List ? JSON.parse(decryptedM3u8List) : [];
      } catch {
        m3u8_list = [];
      }
      return {
        id: row.id,
        page_title: aes_decrypt(row.page_title),
        page_href: aes_decrypt(row.page_href),
        page_img: aes_decrypt(row.page_img),
        m3u8_list: m3u8_list,
        view_count: row.view_count,
        stars: row.stars,
        create_time: row.create_time,
        local_img_path: row.local_img_path || ''
      };
    });

    if (keyword) {
      data_list = data_list.filter(item => 
        item.page_title.toLowerCase().includes(keyword.toLowerCase())
      );
    }

    const total_count = data_list.length;

    data_list = data_list.slice(offset, offset + page_size);

    res.status(200).json({
      code: 200,
      message: '查询成功',
      data: data_list,
      total_count: total_count,
      current_page_count: data_list.length
    });
  } catch (error) {
    console.error('查询数据失败:', error);
    res.status(500).json({
      code: 500,
      message: '查询数据失败',
      data: [],
      total_count: 0,
      current_page_count: 0
    });
  }
});

// 根据ID删除数据
router.delete('/delete-data', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        code: 400,
        message: '缺少必要参数id，请提供要删除的数据的id'
      });
    }

    // 删除数据
    await db.execute('DELETE FROM site_info WHERE id = ?', [id]);

    res.status(200).json({
      code: 200,
      message: '数据删除成功'
    });
  } catch (error) {
    console.error('删除数据失败:', error);
    res.status(500).json({
      code: 500,
      message: '数据删除失败'
    });
  }
});

// 根据pageHref删除数据
router.delete('/delete-data-by-pageHref', authenticateToken, async (req, res) => {
  try {
    const { pageHref } = req.body;

    if (!pageHref) {
      return res.status(400).json({
        code: 400,
        message: '缺少必要参数pageHref，请提供要删除的数据对应的pageHref'
      });
    }

    // 加密pageHref
    const encrypted_page_href = aes_encrypt(pageHref);

    // 删除数据
    await db.execute('DELETE FROM site_info WHERE page_href = ?', [encrypted_page_href]);

    res.status(200).json({
      code: 200,
      message: '根据pageHref删除数据成功'
    });
  } catch (error) {
    console.error('根据pageHref删除数据失败:', error);
    res.status(500).json({
      code: 500,
      message: '根据pageHref删除数据失败'
    });
  }
});

// 检查数据是否存在
router.get('/check-data-exists-by-pageHref', authenticateToken, async (req, res) => {
  try {
    const { pageHref } = req.query;

    if (!pageHref) {
      return res.status(400).json({
        code: 400,
        message: '缺少必要参数pageHref，请提供要检查的数据对应的pageHref'
      });
    }

    // 加密pageHref
    const encrypted_page_href = aes_encrypt(pageHref);

    // 检查数据是否存在并获取m3u8_list
    const [result] = await db.execute(
      'SELECT m3u8_list FROM site_info WHERE page_href = ?',
      [encrypted_page_href]
    );

    if (result.length > 0) {
      const decryptedM3u8List = aes_decrypt(result[0].m3u8_list);
      let m3u8List = [];
      try {
        m3u8List = decryptedM3u8List ? JSON.parse(decryptedM3u8List) : [];
      } catch {
        m3u8List = [];
      }
      return res.status(200).json({ exists: 1, m3u8List: m3u8List });
    }

    res.status(408).send();
  } catch (error) {
    console.error('检查数据是否存在失败:', error);
    res.status(500).send();
  }
});

// POST方式删除数据（兼容uploadSite.js）
router.post('/delete-by-href', authenticateToken, async (req, res) => {
  try {
    const { pageHref } = req.body;

    if (!pageHref) {
      return res.status(400).json({
        code: 400,
        message: '缺少必要参数pageHref，请提供要删除的数据对应的pageHref'
      });
    }

    // 解码URL编码的pageHref
    const decodedPageHref = decodeURIComponent(pageHref);
    // 加密pageHref
    const encrypted_page_href = aes_encrypt(decodedPageHref);

    // 删除数据
    await db.execute('DELETE FROM site_info WHERE page_href = ?', [encrypted_page_href]);

    res.status(200).json({
      code: 200,
      message: '数据删除成功'
    });
  } catch (error) {
    console.error('删除数据失败:', error);
    res.status(500).json({
      code: 500,
      message: '删除数据失败'
    });
  }
});

// 兼容 uploadSite.js 的接口别名
router.get('/check_existence', authenticateToken, async (req, res) => {
  try {
    const { pageHref } = req.query;

    if (!pageHref) {
      return res.status(400).json({
        code: 400,
        message: '缺少必要参数pageHref'
      });
    }

    const encrypted_page_href = aes_encrypt(pageHref);

    const [result] = await db.execute(
      'SELECT m3u8_list FROM site_info WHERE page_href = ?',
      [encrypted_page_href]
    );

    if (result.length > 0) {
      const decryptedM3u8List = aes_decrypt(result[0].m3u8_list);
      let m3u8List = [];
      try {
        m3u8List = decryptedM3u8List ? JSON.parse(decryptedM3u8List) : [];
      } catch {
        m3u8List = [];
      }
      return res.status(200).json({ exists: true, m3u8List: m3u8List });
    }

    res.status(404).json({ exists: false });
  } catch (error) {
    console.error('检查数据是否存在失败:', error);
    res.status(500).json({ exists: false });
  }
});

router.post('/save_data', authenticateToken, async (req, res) => {
  try {
    const { pageTitle, pageHref, pageImg, m3u8List } = req.body;

    const encrypted_page_title = aes_encrypt(pageTitle);
    const encrypted_page_href = aes_encrypt(pageHref);
    const encrypted_page_img = pageImg ? aes_encrypt(pageImg) : aes_encrypt('');
    const encrypted_m3u8_list = m3u8List && Array.isArray(m3u8List) && m3u8List.length > 0 
      ? aes_encrypt(JSON.stringify(m3u8List)) 
      : aes_encrypt('');

    const [existing] = await db.execute(
      'SELECT COUNT(*) FROM site_info WHERE page_href = ?',
      [encrypted_page_href]
    );

    if (existing[0]['COUNT(*)'] > 0) {
      await db.execute(
        'UPDATE site_info SET page_title = ?, page_img = ?, m3u8_list = ? WHERE page_href = ?',
        [encrypted_page_title, encrypted_page_img, encrypted_m3u8_list, encrypted_page_href]
      );
      return res.status(200).json({ message: '数据更新成功' });
    }

    await db.execute(
      'INSERT INTO site_info (page_title, page_href, page_img, m3u8_list) VALUES (?, ?, ?, ?)',
      [encrypted_page_title, encrypted_page_href, encrypted_page_img, encrypted_m3u8_list]
    );

    res.status(200).json({ message: '数据保存成功' });
  } catch (error) {
    console.error('保存数据失败:', error);
    res.status(500).json({ message: '数据保存失败' });
  }
});

router.post('/delete_by_href', authenticateToken, async (req, res) => {
  try {
    const { pageHref } = req.body;

    if (!pageHref) {
      return res.status(400).json({
        code: 400,
        message: '缺少必要参数pageHref'
      });
    }

    const decodedPageHref = decodeURIComponent(pageHref);
    const encrypted_page_href = aes_encrypt(decodedPageHref);

    await db.execute('DELETE FROM site_info WHERE page_href = ?', [encrypted_page_href]);

    res.status(200).json({ message: '数据删除成功' });
  } catch (error) {
    console.error('删除数据失败:', error);
    res.status(500).json({ message: '删除数据失败' });
  }
});

module.exports = router;