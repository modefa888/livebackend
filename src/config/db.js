// 禁用 dotenv 提示信息
process.env.DOTENV_SILENCE = 'true';

const mysql = require('mysql2/promise');

// 获取当前环境
const environment = process.env.ENVIRONMENT || 'local';
console.log(`当前环境: ${environment}`);

// 根据环境选择配置
let config;
if (environment === 'local') {
  config = {
    host: process.env.LOCAL_MYSQL_HOST,
    port: process.env.LOCAL_MYSQL_PORT,
    user: process.env.LOCAL_MYSQL_USER,
    password: process.env.LOCAL_MYSQL_PASSWORD,
    database: process.env.LOCAL_MYSQL_DATABASE
  };
  // 打印本地环境变量
  console.log('环境变量加载情况:');
  console.log(`🗄️  LOCAL_MYSQL_HOST: ${process.env.LOCAL_MYSQL_HOST} | 📡 LOCAL_MYSQL_PORT: ${process.env.LOCAL_MYSQL_PORT} | 👤 LOCAL_MYSQL_USER: ${process.env.LOCAL_MYSQL_USER} | 📦 LOCAL_MYSQL_DATABASE: ${process.env.LOCAL_MYSQL_DATABASE}`);
} else {
  config = {
    host: process.env.SERVER_MYSQL_HOST,
    port: process.env.SERVER_MYSQL_PORT,
    user: process.env.SERVER_MYSQL_USER,
    password: process.env.SERVER_MYSQL_PASSWORD,
    database: process.env.SERVER_MYSQL_DATABASE
  };
  // 打印服务器环境变量
  console.log('环境变量加载情况:');
  console.log(`🗄️  SERVER_MYSQL_HOST: ${process.env.SERVER_MYSQL_HOST} | 📡 SERVER_MYSQL_PORT: ${process.env.SERVER_MYSQL_PORT} | 👤 SERVER_MYSQL_USER: ${process.env.SERVER_MYSQL_USER} | 📦 SERVER_MYSQL_DATABASE: ${process.env.SERVER_MYSQL_DATABASE}`);
}

// 创建数据库连接池
const pool = mysql.createPool({
  ...config,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;