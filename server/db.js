import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Ensure DATE (OID 1082) is returned as raw 'YYYY-MM-DD' string without timezone shifting
pg.types.setTypeParser(1082, (val) => val);

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const isLocal = !connectionString || /localhost|127\.0\.0\.1/.test(connectionString);

export const pool = new Pool({
  connectionString: connectionString || 'postgres://postgres:postgres@localhost:5432/pawcare',
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL) {
      console.log('Executed query', { text: text.slice(0, 100), duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('Database query error:', { text, error: err.message });
    throw err;
  }
};

export const getClient = async () => {
  return await pool.connect();
};

export const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export async function testDbConnection() {
  try {
    const res = await query('SELECT NOW() as now, version()');
    console.log('Connected to Neon/PostgreSQL database:', res.rows[0].now);
    return true;
  } catch (err) {
    console.warn('Database connection warning (check DATABASE_URL in .env):', err.message);
    return false;
  }
}
