const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { logOperation } = require('./operation-logs');
const multer = require('multer');
const bcrypt = require('bcryptjs');

// 配置multer存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 临时存储目录
    const tempDir = path.join(__dirname, '../temp')
    if (!fs.existsSync(tempDir)) {
      try {
        fs.mkdirSync(tempDir, { recursive: true })
      } catch (error) {
        console.error('创建临时目录失败:', error)
        return cb(error)
      }
    }
    cb(null, tempDir)
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})

// 文件过滤器：只允许.html文件
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'text/html' || file.originalname.endsWith('.html')) {
    cb(null, true)
  } else {
    cb(new Error('只允许上传HTML文件'), false)
  }
}

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter
})

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

// 扫描本地HTML文件，找出未在数据库中保存的文件（管理员）
router.get('/scan-local-files', async (req, res) => {
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

    // 获取数据库中已保存的文件名
    const [dbPages] = await db.execute('SELECT content FROM pages')
    const dbFiles = new Set(dbPages.map(p => p.content))

    // 扫描本地HTML文件夹
    const files = await fs.promises.readdir(HTML_DIR)
    const htmlFiles = files.filter(file => file.endsWith('.html'))
    
    // 找出未保存的文件
    const unsavedFiles = []
    for (const filename of htmlFiles) {
      if (!dbFiles.has(filename)) {
        const filepath = path.join(HTML_DIR, filename)
        const stats = await fs.promises.stat(filepath)
        const content = await fs.promises.readFile(filepath, 'utf-8')
        
        // 自动生成标题：从文件名或HTML标题标签获取
        let title = filename.replace('.html', '')
        const titleMatch = content.match(/<title>([^<]+)<\/title>/i)
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim()
        }
        
        // 自动生成路径：去除.html后缀，使用文件名作为路径
        const pagePath = filename.replace('.html', '')
        
        unsavedFiles.push({
          filename,
          title,
          path: pagePath,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          content
        })
      }
    }

    res.json({
      success: true,
      unsavedFiles,
      totalFiles: htmlFiles.length,
      savedCount: dbFiles.size,
      unsavedCount: unsavedFiles.length
    })
  } catch (error) {
    console.error('扫描本地文件失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 一键上传HTML文件（管理员）
router.post('/upload', upload.array('files'), async (req, res) => {
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

    const files = req.files
    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的HTML文件' })
    }

    const results = []
    for (const file of files) {
      try {
        // 读取HTML文件内容
        const content = await fs.promises.readFile(file.path, 'utf-8')
        
        // 自动生成标题：从文件名或HTML标题标签获取
        let title = file.originalname.replace('.html', '')
        const titleMatch = content.match(/<title>([^<]+)<\/title>/i)
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim()
        }
        
        // 自动生成路径：去除.html后缀，使用文件名作为路径
        const pagePath = file.originalname.replace('.html', '')
        
        // 检查是否已存在
        const [existingPages] = await db.execute('SELECT id FROM pages WHERE path = ?', [pagePath])
        if (existingPages.length > 0) {
          results.push({ filename: file.originalname, success: false, error: '页面路径已存在' })
          // 清理临时文件
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path)
          }
          continue
        }
        
        // 移动文件到HTML目录
        const destPath = path.join(HTML_DIR, file.originalname)
        if (!fs.existsSync(HTML_DIR)) {
          fs.mkdirSync(HTML_DIR, { recursive: true })
        }
        fs.renameSync(file.path, destPath)
        
        // 保存到数据库
        await db.execute(
          'INSERT INTO pages (title, path, content, require_login, status) VALUES (?, ?, ?, ?, ?)',
          [title, pagePath, file.originalname, 0, 1]
        )
        
        results.push({ filename: file.originalname, success: true, title, path: pagePath })
      } catch (error) {
        console.error(`上传文件 ${file.originalname} 失败:`, error)
        results.push({ filename: file.originalname, success: false, error: error.message || '上传失败' })
        // 清理临时文件
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path)
        }
      }
    }

    // 清理临时目录
    const tempDir = path.join(__dirname, '../temp')
    if (fs.existsSync(tempDir)) {
      const tempFiles = fs.readdirSync(tempDir)
      for (const tempFile of tempFiles) {
        const tempFilePath = path.join(tempDir, tempFile)
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath)
        }
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.length - successCount

    res.json({
      success: true,
      results,
      successCount,
      failCount,
      message: `成功上传 ${successCount} 个文件，失败 ${failCount} 个`
    })
  } catch (error) {
    console.error('上传文件失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 批量添加未保存的文件到数据库（管理员）
router.post('/import-local-files', async (req, res) => {
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

    const { files } = req.body
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: '请选择要导入的文件' })
    }

    const results = []
    for (const file of files) {
      const { filename, title, path: pagePath, content, require_login = false, status = true } = file
      
      try {
        // 检查是否已存在
        const [existingPages] = await db.execute('SELECT id FROM pages WHERE path = ?', [pagePath])
        if (existingPages.length > 0) {
          results.push({ filename, success: false, error: '页面路径已存在' })
          continue
        }

        await db.execute(
          'INSERT INTO pages (title, path, content, require_login, status) VALUES (?, ?, ?, ?, ?)',
          [title, pagePath, filename, require_login ? 1 : 0, status ? 1 : 1]
        )
        
        results.push({ filename, success: true, title, path: pagePath })
      } catch (error) {
        console.error(`导入文件 ${filename} 失败:`, error)
        results.push({ filename, success: false, error: '导入失败' })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.length - successCount

    res.json({
      success: true,
      results,
      successCount,
      failCount,
      message: `成功导入 ${successCount} 个文件，失败 ${failCount} 个`
    })
  } catch (error) {
    console.error('批量导入失败:', error)
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

    await logOperation(req, 'update', '页面', parseInt(id), title || `页面${id}`, `更新页面: ${title || `ID ${id}`}`);

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
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel, password FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0 || users[0].permissionLevel < 2) {
      return res.status(403).json({ error: '权限不足' })
    }

    const { id } = req.params
    const { password } = req.body
    
    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, users[0].password)
    if (!isPasswordValid) {
      return res.status(400).json({ error: '密码错误' })
    }
    
    const [existingPages] = await db.execute('SELECT id, content FROM pages WHERE id = ?', [id])
    if (existingPages.length === 0) {
      return res.status(404).json({ error: '页面不存在' })
    }

    // 只删除数据库记录，不删除物理文件
    await db.execute('DELETE FROM pages WHERE id = ?', [id])

    res.json({ success: true, message: '页面删除成功' })
  } catch (error) {
    console.error('删除页面失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 访问页面（公开接口）- 这个路由要放在最后，避免拦截其他路由
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