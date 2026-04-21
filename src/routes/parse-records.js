const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.post('/', async (req, res) => {
  try {
    const {
      share_url,
      parse_url,
      parse_status,
      parse_message,
      content_type,
      video_url,
      image_count,
      image_urls,
      title,
      chat_id,
      send_status,
      send_message
    } = req.body;

    const [result] = await db.execute(
      `INSERT INTO video_parse_records 
       (share_url, parse_url, parse_status, parse_message, content_type, 
        video_url, image_count, image_urls, title, chat_id, send_status, send_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [share_url, parse_url, parse_status, parse_message, content_type,
       video_url, image_count || 0, image_urls, title, chat_id, send_status || 0, send_message]
    );

    res.status(200).json({
      success: true,
      message: '记录保存成功',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('保存解析记录失败:', error);
    res.status(500).json({
      success: false,
      message: '保存失败',
      error: error.message
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    const [countResult] = await db.execute(
      'SELECT COUNT(*) as total FROM video_parse_records'
    );
    const total = countResult[0].total;

    const [rows] = await db.execute(
      `SELECT * FROM video_parse_records 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error('查询解析记录失败:', error);
    res.status(500).json({
      success: false,
      message: '查询失败',
      error: error.message
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [rows] = await db.execute(
      'SELECT * FROM video_parse_records WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '记录不存在'
      });
    }

    res.status(200).json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('查询解析记录失败:', error);
    res.status(500).json({
      success: false,
      message: '查询失败',
      error: error.message
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [result] = await db.execute(
      'DELETE FROM video_parse_records WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '记录不存在'
      });
    }

    res.status(200).json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除解析记录失败:', error);
    res.status(500).json({
      success: false,
      message: '删除失败',
      error: error.message
    });
  }
});

module.exports = router;