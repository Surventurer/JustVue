const { Pool } = require('pg');

// Validate required environment variables
const requiredEnvVars = ['DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
}

// Aiven PostgreSQL configuration - all values from environment variables
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  ssl: process.env.DB_CA_CERT 
    ? {
        rejectUnauthorized: true,
        ca: process.env.DB_CA_CERT.replace(/\\n/g, '\n'), // Handle escaped newlines
      }
    : {
        rejectUnauthorized: false, // Fallback for services that don't need explicit CA
      },
  connectionTimeoutMillis: 10000, // 10 second timeout
  idleTimeoutMillis: 30000,
};

// Log config for debugging (without sensitive data)
console.log('DB Config:', {
  user: config.user,
  host: config.host,
  port: config.port,
  database: config.database,
  hasCert: !!process.env.DB_CA_CERT,
  sslMode: process.env.DB_CA_CERT ? 'verify-ca' : 'require'
});

// Create a connection pool
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool(config);
    
    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected pool error:', err);
    });
  }
  return pool;
}

// Get all code snippets
async function getAllSnippets() {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM code_snippets ORDER BY id DESC'
  );
  // Map database fields to match frontend expectations
  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    code: row.code,
    content: row.code, // Map code to content for new structure
    password: row.password,
    timestamp: row.timestamp,
    hidden: row.hidden,
    isEncrypted: row.is_encrypted,
    contentType: row.content_type || 'text',
    fileName: row.file_name,
    fileType: row.file_type
  }));
}

// Save all snippets (replace existing data)
async function saveAllSnippets(snippets) {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Delete all existing snippets
    await client.query('DELETE FROM code_snippets');
    
    // Insert new snippets
    for (const snippet of snippets) {
      // Support both old 'code' and new 'content' properties
      const codeValue = snippet.code || snippet.content || '';
      const contentType = snippet.contentType || 'text';
      const fileName = snippet.fileName || null;
      const fileType = snippet.fileType || null;
      
      await client.query(
        `INSERT INTO code_snippets (id, title, code, password, timestamp, hidden, is_encrypted, content_type, file_name, file_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          snippet.id,
          snippet.title,
          codeValue,
          snippet.password,
          snippet.timestamp,
          snippet.hidden || false,
          snippet.isEncrypted || false,
          contentType,
          fileName,
          fileType
        ]
      );
    }
    
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getAllSnippets,
  saveAllSnippets
};
