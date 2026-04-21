const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const db = require('../config/db')

// 获取所有页面（管理员）
router.get('/', async (req, res) => {
  try {
    // 检查用户权限
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未授权' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0 || users[0].permissionLevel < 2) {
      return res.status(403).json({ error: '权限不足' })
    }

    // 查询所有页面及其访问次数（按用户去重）
    const [pages] = await db.execute(`
      SELECT p.*, COUNT(DISTINCT pl.user_id) as visit_count
      FROM pages p
      LEFT JOIN page_access_logs pl ON p.id = pl.page_id
      GROUP BY p.id
      ORDER BY p.id DESC
    `)
    res.json(pages)
  } catch (error) {
    console.error('获取页面列表失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 创建页面（管理员）
router.post('/', async (req, res) => {
  try {
    // 检查用户权限
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未授权' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0 || users[0].permissionLevel < 2) {
      return res.status(403).json({ error: '权限不足' })
    }

    const { title, path, content, require_login, status } = req.body
    
    // 验证参数
    if (!title || !path || !content) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    // 检查路径是否已存在
    const [existingPages] = await db.execute('SELECT id FROM pages WHERE path = ?', [path])
    if (existingPages.length > 0) {
      return res.status(400).json({ error: '页面路径已存在' })
    }

    // 创建页面
    const [result] = await db.execute(
      'INSERT INTO pages (title, path, content, require_login, status) VALUES (?, ?, ?, ?, ?)',
      [title, path, content, require_login || 0, status || 1]
    )

    res.json({ success: true, id: result.insertId, message: '页面创建成功' })
  } catch (error) {
    console.error('创建页面失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 更新页面（管理员）
router.put('/:id', async (req, res) => {
  try {
    // 检查用户权限
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未授权' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0 || users[0].permissionLevel < 2) {
      return res.status(403).json({ error: '权限不足' })
    }

    const { id } = req.params
    const { title, path, content, require_login, status } = req.body
    
    // 验证参数
    if (!title || !path || !content) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    // 检查页面是否存在
    const [existingPages] = await db.execute('SELECT id FROM pages WHERE id = ?', [id])
    if (existingPages.length === 0) {
      return res.status(404).json({ error: '页面不存在' })
    }

    // 检查路径是否已被其他页面使用
    const [pathCheck] = await db.execute('SELECT id FROM pages WHERE path = ? AND id != ?', [path, id])
    if (pathCheck.length > 0) {
      return res.status(400).json({ error: '页面路径已存在' })
    }

    // 更新页面
    await db.execute(
      'UPDATE pages SET title = ?, path = ?, content = ?, require_login = ?, status = ? WHERE id = ?',
      [title, path, content, require_login || 0, status || 1, id]
    )

    res.json({ success: true, message: '页面更新成功' })
  } catch (error) {
    console.error('更新页面失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 删除页面（管理员）
router.delete('/:id', async (req, res) => {
  try {
    // 检查用户权限
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未授权' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0 || users[0].permissionLevel < 2) {
      return res.status(403).json({ error: '权限不足' })
    }

    const { id } = req.params
    
    // 检查页面是否存在
    const [existingPages] = await db.execute('SELECT id FROM pages WHERE id = ?', [id])
    if (existingPages.length === 0) {
      return res.status(404).json({ error: '页面不存在' })
    }

    // 删除页面
    await db.execute('DELETE FROM pages WHERE id = ?', [id])

    res.json({ success: true, message: '页面删除成功' })
  } catch (error) {
    console.error('删除页面失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 访问页面（公开接口）
router.get('/view/:path', async (req, res) => {
  try {
    const { path } = req.params
    
    // 查询页面
    const [pages] = await db.execute('SELECT * FROM pages WHERE path = ? AND status = 1', [path])
    if (pages.length === 0) {
      return res.status(404).json({ error: '页面不存在或已禁用' })
    }

    const page = pages[0]
    
    // 检查是否需要登录
    if (page.require_login) {
      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        return res.status(401).json({ error: '需要登录' })
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
        // 记录访问日志
        await db.execute(
          'INSERT INTO page_access_logs (page_id, user_id, ip, user_agent) VALUES (?, ?, ?, ?)',
          [page.id, decoded.id, req.ip, req.headers['user-agent'] || '']
        )
      } catch (error) {
        return res.status(401).json({ error: '无效的token' })
      }
    } else {
      // 记录访问日志（未登录用户）
      await db.execute(
        'INSERT INTO page_access_logs (page_id, user_id, ip, user_agent) VALUES (?, ?, ?, ?)',
        [page.id, null, req.ip, req.headers['user-agent'] || '']
      )
    }

    res.json({ success: true, page: { id: page.id, title: page.title, content: page.content, created_at: page.created_at, updated_at: page.updated_at } })
  } catch (error) {
    console.error('访问页面失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 获取页面访问日志（管理员）
router.get('/logs', async (req, res) => {
  try {
    // 检查用户权限
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未授权' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0 || users[0].permissionLevel < 2) {
      return res.status(403).json({ error: '权限不足' })
    }

    // 查询访问日志
    const [logs] = await db.execute(
      'SELECT pal.*, p.title as page_title, u.username as user_name FROM page_access_logs pal LEFT JOIN pages p ON pal.page_id = p.id LEFT JOIN users u ON pal.user_id = u.id ORDER BY pal.created_at DESC LIMIT 100'
    )
    res.json(logs)
  } catch (error) {
    console.error('获取访问日志失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

module.exports = router