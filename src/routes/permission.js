const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const db = require('../config/db')

// 获取所有模块权限配置
router.get('/', async (req, res) => {
  try {
    // 检查用户权限
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未授权' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0 || users[0].permissionLevel < 3) {
      return res.status(403).json({ error: '权限不足' })
    }

    // 查询模块权限配置
    const [permissions] = await db.execute('SELECT * FROM module_permissions ORDER BY id')
    res.json(permissions)
  } catch (error) {
    console.error('获取权限配置失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 更新模块权限配置
router.put('/', async (req, res) => {
  try {
    // 检查用户权限
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未授权' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0 || users[0].permissionLevel < 3) {
      return res.status(403).json({ error: '权限不足' })
    }

    const { permissions } = req.body
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: '权限配置格式错误' })
    }

    // 更新权限配置
    for (const permission of permissions) {
      await db.execute(
        'UPDATE module_permissions SET permission_level_1 = ?, permission_level_2 = ?, permission_level_3 = ? WHERE id = ?',
        [permission.permission_level_1, permission.permission_level_2, permission.permission_level_3, permission.id]
      )
    }

    res.json({ success: true, message: '权限配置更新成功' })
  } catch (error) {
    console.error('更新权限配置失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// 获取用户可用的模块权限
router.get('/user', async (req, res) => {
  try {
    // 检查用户权限
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: '未授权' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')
    
    const [users] = await db.execute('SELECT id, userId, username, permissionLevel FROM users WHERE id = ?', [decoded.id])
    
    if (users.length === 0) {
      return res.status(403).json({ error: '权限不足' })
    }

    const user = users[0]
    const columnName = `permission_level_${user.permissionLevel}`
    
    // 查询用户可用的模块权限
    const [permissions] = await db.execute(
      `SELECT id, module, path, description FROM module_permissions WHERE ${columnName} = 1 ORDER BY id`
    )
    res.json(permissions)
  } catch (error) {
    console.error('获取用户权限失败:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

module.exports = router