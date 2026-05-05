const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const db = require('../config/db')
const fs = require('fs')
const path = require('path')

const HTML_DIR = path.join(__dirname, '../public/html')

// 获取所有页面（管理员）
router.get('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未授权' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0 || users[0].permissionLevel < 2) {
      return res.status(403).json({ error: '权限不足' })
    }

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
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未授权' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0 || users[0].permissionLevel < 2) {
      return res.status(403).json({ error: '权限不足' })
    }

    const { title, path: pagePath, content, require_login, status } = req.body
    
    if (!title || !pagePath || !content) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    const [existingPages] = await db.execute('SELECT id FROM pages WHERE path = ?', [pagePath])
    if (existingPages.length > 0) {
      return res.status(400).json({ error: '页面路径已存在' })
    }

    const filename = `${pagePath}.html`
    const filepath = path.join(HTML_DIR, filename)
    await fs.promises.writeFile(filepath, content, 'utf-8')

    const [result] = await db.execute(
      'INSERT INTO pages (title, path, content, require_login, status) VALUES (?, ?, ?, ?, ?)',
      [title, pagePath, filename, require_login || 0, status || 1]
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
    const { title, path: pagePath, content, require_login, status } = req.body
    
    if (!title || !pagePath || !content) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    const [existingPages] = await db.execute('SELECT id, content FROM pages WHERE id = ?', [id])
    if (existingPages.length === 0) {
      return res.status(404).json({ error: '页面不存在' })
    }

    const [pathCheck] = await db.execute('SELECT id FROM pages WHERE path = ? AND id != ?', [pagePath, id])
    if (pathCheck.length > 0) {
      return res.status(400).json({ error: '页面路径已存在' })
    }

    const oldFilename = existingPages[0].content
    const newFilename = `${pagePath}.html`
    
    if (oldFilename !== newFilename) {
      const oldFilepath = path.join(HTML_DIR, oldFilename)
      if (fs.existsSync(oldFilepath)) {
        await fs.promises.unlink(oldFilepath)
      }
    }
    
    const filepath = path.join(HTML_DIR, newFilename)
    await fs.promises.writeFile(filepath, content, 'utf-8')

    await db.execute(
      'UPDATE pages SET title = ?, path = ?, content = ?, require_login = ?, status = ? WHERE id = ?',
      [title, pagePath, newFilename, require_login || 0, status || 1, id]
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
    
    const [existingPages] = await db.execute('SELECT id, content FROM pages WHERE id = ?', [id])
    if (existingPages.length === 0) {
      return res.status(404).json({ error: '页面不存在' })
    }

    const filename = existingPages[0].content
    const filepath = path.join(HTML_DIR, filename)
    if (fs.existsSync(filepath)) {
      await fs.promises.unlink(filepath)
    }

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
    const { path: pagePath } = req.params
    
    const [pages] = await db.execute('SELECT * FROM pages WHERE path = ? AND status = 1', [pagePath])
    if (pages.length === 0) {
      return res.status(404).json({ error: '页面不存在或已禁用' })
    }

    const page = pages[0]
    
    if (page.require_login) {
      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        return res.status(401).json({ error: '需要登录' })
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
        await db.execute(
          'INSERT INTO page_access_logs (page_id, user_id, ip, user_agent) VALUES (?, ?, ?, ?)',
          [page.id, decoded.id, req.ip, req.headers['user-agent'] || '']
        )
      } catch (error) {
        return res.status(401).json({ error: '无效的token' })
      }
    } else {
      await db.execute(
        'INSERT INTO page_access_logs (page_id, user_id, ip, user_agent) VALUES (?, ?, ?, ?)',
        [page.id, null, req.ip, req.headers['user-agent'] || '']
      )
    }

    const filepath = path.join(HTML_DIR, page.content)
    let content = ''
    if (fs.existsSync(filepath)) {
      content = await fs.promises.readFile(filepath, 'utf-8')
    }

    res.json({ success: true, page: { id: page.id, title: page.title, content: content, created_at: page.created_at, updated_at: page.updated_at } })
  } catch (error) {
    console.error('访问页面失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 获取单个页面详情（用于编辑）
router.get('/:id', async (req, res) => {
  try {
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
    
    const [pages] = await db.execute('SELECT * FROM pages WHERE id = ?', [id])
    if (pages.length === 0) {
      return res.status(404).json({ error: '页面不存在' })
    }

    const page = pages[0]
    const filepath = path.join(HTML_DIR, page.content)
    let content = ''
    if (fs.existsSync(filepath)) {
      content = await fs.promises.readFile(filepath, 'utf-8')
    }

    res.json({ success: true, page: { ...page, content: content } })
  } catch (error) {
    console.error('获取页面详情失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 获取页面访问日志（管理员）
router.get('/logs', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未授权' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0 || users[0].permissionLevel < 2) {
      return res.status(403).json({ error: '权限不足' })
    }

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
