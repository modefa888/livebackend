const mysql = require('mysql2/promise');
const environment = process.env.ENVIRONMENT || 'local';

const MYSQL_CONFIG = {
  host: process.env[`${environment.toUpperCase()}_MYSQL_HOST`],
  port: parseInt(process.env[`${environment.toUpperCase()}_MYSQL_PORT`], 10),
  user: process.env[`${environment.toUpperCase()}_MYSQL_USER`],
  password: process.env[`${environment.toUpperCase()}_MYSQL_PASSWORD`],
  database: process.env[`${environment.toUpperCase()}_MYSQL_DATABASE`],
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(MYSQL_CONFIG);

module.exports = {
  pool,
  MYSQL_CONFIG
};
