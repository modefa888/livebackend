let pool = null
let $ = null

const setPool = (_pool, _$) => {
  pool = _pool
  $ = _$
}

// 获取所有模块权限配置
const getModulePermissions = async () => {
  try {
    const [rows] = await pool.execute('SELECT * FROM module_permissions ORDER BY id')
    return rows
  } catch (error) {
    $.log(`获取模块权限配置失败: ${error.message}`, 'error')
    return []
  }
}

// 根据用户权限等级获取可用的模块权限
const getModulePermissionsForUser = async (permissionLevel) => {
  try {
    const columnName = `permission_level_${permissionLevel}`
    const [rows] = await pool.execute(
      `SELECT id, module, path, description FROM module_permissions WHERE ${columnName} = 1 ORDER BY id`
    )
    return rows
  } catch (error) {
    $.log(`获取用户模块权限失败: ${error.message}`, 'error')
    return []
  }
}

// 更新模块权限配置
const updateModulePermission = async (id, level1, level2, level3) => {
  try {
    await pool.execute(
      'UPDATE module_permissions SET permission_level_1 = ?, permission_level_2 = ?, permission_level_3 = ? WHERE id = ?',
      [level1, level2, level3, id]
    )
    return true
  } catch (error) {
    $.log(`更新模块权限配置失败: ${error.message}`, 'error')
    return false
  }
}

// 添加新模块权限配置
const addModulePermission = async (module, path, level1, level2, level3, description) => {
  try {
    await pool.execute(
      'INSERT INTO module_permissions (module, path, permission_level_1, permission_level_2, permission_level_3, description) VALUES (?, ?, ?, ?, ?, ?)',
      [module, path, level1, level2, level3, description]
    )
    return true
  } catch (error) {
    $.log(`添加模块权限配置失败: ${error.message}`, 'error')
    return false
  }
}

// 删除模块权限配置
const deleteModulePermission = async (id) => {
  try {
    await pool.execute('DELETE FROM module_permissions WHERE id = ?', [id])
    return true
  } catch (error) {
    $.log(`删除模块权限配置失败: ${error.message}`, 'error')
    return false
  }
}

module.exports = {
  setPool,
  getModulePermissions,
  getModulePermissionsForUser,
  updateModulePermission,
  addModulePermission,
  deleteModulePermission
}