const { info, error } = require('../utils/logger');
const { pool, MYSQL_CONFIG } = require('./database');

// 从数据库获取 faBuBot 配置
async function getFaBuBotConfig() {
  try {
    info('[faBuBot] 从数据库获取配置');
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute('SELECT config_key, config_value FROM fabubot_configs');
      const config = {};
      rows.forEach(row => {
        config[row.config_key] = row.config_value;
      });
      info(`[faBuBot] 配置获取成功，共 ${rows.length} 项配置`);
      return config;
    } finally {
      conn.release();
    }
  } catch (err) {
    error('[faBuBot] 获取配置失败:', err);
    throw err;
  }
}

// 批量更新 faBuBot 配置
async function updateFaBuBotConfigs(configs) {
  try {
    info(`[faBuBot] 更新配置，共 ${Object.keys(configs).length} 项`);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [key, value] of Object.entries(configs)) {
        await conn.execute(
          'INSERT INTO fabubot_configs (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = ?, updated_at = CURRENT_TIMESTAMP',
          [key, value, value]
        );
      }
      await conn.commit();
      info('[faBuBot] 配置更新成功');
      return true;
    } catch (err) {
      await conn.rollback();
      error('[faBuBot] 配置更新失败:', err);
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    error('[faBuBot] 更新配置失败:', err);
    throw err;
  }
}

module.exports = {
  getFaBuBotConfig,
  updateFaBuBotConfigs,
  pool,
  MYSQL_CONFIG
};
