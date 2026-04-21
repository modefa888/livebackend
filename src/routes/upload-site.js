const express = require('express');
const router = express.Router();
const db = require('../config/db');
const crypto = require('crypto');

const ENCRYPTION_KEY = Buffer.from('\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10');
const IV = Buffer.from('\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10');
const BLOCK_SIZE = 16;

function aes_encrypt(text) {
  try {
    const dataBytes = Buffer.from(text, 'utf8');
    const padding = BLOCK_SIZE - (dataBytes.length % BLOCK_SIZE);
    const paddedData = Buffer.concat([dataBytes, Buffer.alloc(padding, 0x00)]);
    const cipher = crypto.createCipheriv('aes-128-cbc', ENCRYPTION_KEY, IV);
    cipher.setAutoPadding(false);
    const encryptedData = Buffer.concat([cipher.update(paddedData), cipher.final()]);
    return encryptedData.toString('base64');
  } catch (error) {
    console.error('加密失败:', error);
    return text;
  }
}

function aes_decrypt(encryptedData) {
  try {
    if (!encryptedData) return '';
    const encryptedBytes = Buffer.from(encryptedData, 'base64');
    const decipher = crypto.createDecipheriv('aes-128-cbc', ENCRYPTION_KEY, IV);
    decipher.setAutoPadding(false);
    const decryptedData = Buffer.concat([decipher.update(encryptedBytes), decipher.final()]);
    const unpaddedData = decryptedData.toString('utf8').replace(/\0+$/, '');
    return unpaddedData;
  } catch (error) {
    console.error('解密失败:', error);
    return encryptedData;
  }
}

router.get('/api/check_existence', async (req, res) => {
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
      'SELECT m3u8_list, stars, view_count FROM site_info WHERE page_href = ?',
      [encrypted_page_href]
    );

    if (result.length > 0) {
      await db.execute(
        'UPDATE site_info SET view_count = IFNULL(view_count, 0) + 1 WHERE page_href = ?',
        [encrypted_page_href]
      );

      const decryptedM3u8List = aes_decrypt(result[0].m3u8_list);
      let m3u8List = [];
      try {
        m3u8List = decryptedM3u8List ? JSON.parse(decryptedM3u8List) : [];
      } catch {
        m3u8List = [];
      }
      return res.status(200).json({ 
        exists: true, 
        m3u8List: m3u8List,
        stars: result[0].stars || 0,
        viewCount: (result[0].view_count || 0) + 1
      });
    }

    res.status(404).json({ exists: false });
  } catch (error) {
    console.error('检查数据是否存在失败:', error);
    res.status(500).json({ exists: false });
  }
});

router.post('/api/save_data', async (req, res) => {
  try {
    const { pageTitle, pageHref, pageImg, m3u8List } = req.body;

    const encrypted_page_title = aes_encrypt(pageTitle);
    const encrypted_page_href = aes_encrypt(pageHref);
    const encrypted_page_img = pageImg ? aes_encrypt(pageImg) : aes_encrypt('');
    const encrypted_m3u8_list = m3u8List && Array.isArray(m3u8List) && m3u8List.length > 0 
      ? aes_encrypt(JSON.stringify(m3u8List)) 
      : aes_encrypt('');

    let local_img_path = '';
    if (pageImg) {
      local_img_path = await downloadImage(pageImg);
    }

    const [existing] = await db.execute(
      'SELECT COUNT(*) FROM site_info WHERE page_href = ?',
      [encrypted_page_href]
    );

    if (existing[0]['COUNT(*)'] > 0) {
      await db.execute(
        'UPDATE site_info SET page_title = ?, page_img = ?, m3u8_list = ?, local_img_path = ? WHERE page_href = ?',
        [encrypted_page_title, encrypted_page_img, encrypted_m3u8_list, local_img_path, encrypted_page_href]
      );
      return res.status(200).json({ message: '数据更新成功' });
    }

    await db.execute(
      'INSERT INTO site_info (page_title, page_href, page_img, m3u8_list, local_img_path) VALUES (?, ?, ?, ?, ?)',
      [encrypted_page_title, encrypted_page_href, encrypted_page_img, encrypted_m3u8_list, local_img_path]
    );

    res.status(200).json({ message: '数据保存成功' });
  } catch (error) {
    console.error('保存数据失败:', error);
    res.status(500).json({ message: '数据保存失败' });
  }
});

async function downloadImage(imageUrl) {
  try {
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');
    
    const imagesDir = path.join(__dirname, '../public/images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    const ext = imageUrl.split('.').pop() || 'jpg';
    const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const localPath = path.join(imagesDir, filename);
    
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'Referer': 'https://www.google.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    fs.writeFileSync(localPath, response.data);
    
    return `/images/${filename}`;
  } catch (error) {
    console.error('下载图片失败:', error);
    return '';
  }
}

router.post('/api/delete_by_href', async (req, res) => {
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

router.post('/api/update_rating', async (req, res) => {
  try {
    const { pageHref, rating } = req.body;

    if (!pageHref || rating === undefined) {
      return res.status(400).json({
        code: 400,
        message: '缺少必要参数pageHref或rating'
      });
    }

    const decodedPageHref = decodeURIComponent(pageHref);
    const encrypted_page_href = aes_encrypt(decodedPageHref);

    await db.execute('UPDATE site_info SET stars = ? WHERE page_href = ?', [rating, encrypted_page_href]);

    res.status(200).json({ message: '评分更新成功' });
  } catch (error) {
    console.error('更新评分失败:', error);
    res.status(500).json({ message: '更新评分失败' });
  }
});

router.get('/download-script', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const scriptPath = path.join(__dirname, '../public/scripts/智能存档助手.user.js');
    
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ message: '脚本文件不存在' });
    }
    
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    
    res.setHeader('Content-Type', 'text/javascript');
    res.setHeader('Content-Disposition', 'attachment; filename="智能存档助手.user.js"');
    res.setHeader('Content-Length', Buffer.byteLength(scriptContent, 'utf8'));
    
    res.send(scriptContent);
  } catch (error) {
    console.error('下载脚本失败:', error);
    res.status(500).json({ message: '下载脚本失败' });
  }
});

module.exports = router;