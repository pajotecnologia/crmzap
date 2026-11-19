require('dotenv').config();

const DATABASE_URL = (process.env.DATABASE_URL || '').replace(/\s+/g, '');

const host = process.env.DB_HOST || 'localhost';
const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
const useSsl =
  process.env.DB_SSL === 'true' || (process.env.DB_SSL !== 'false' && !isLocalHost && !DATABASE_URL);
const urlUsesSsl = DATABASE_URL
  ? process.env.DB_SSL !== 'false' && !/localhost|127\.0\.0\.1/.test(DATABASE_URL)
  : false;

const pool = {
  max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
  min: parseInt(process.env.DB_POOL_MIN, 10) || 0,
  acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 60000,
  idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
};

const sslOptions = { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } };

function buildConfig() {
  if (DATABASE_URL) {
    process.env.DATABASE_URL = DATABASE_URL;
    return {
      use_env_variable: 'DATABASE_URL',
      dialect: process.env.DB_DIALECT || 'postgres',
      logging: false,
      pool,
      ...(urlUsesSsl ? sslOptions : {}),
    };
  }
  return {
    dialect: process.env.DB_DIALECT || 'postgres',
    host,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    logging: false,
    pool,
    ...(useSsl ? sslOptions : {}),
  };
}

module.exports = {
  development: buildConfig(),
  test: buildConfig(),
  production: buildConfig(),
};
