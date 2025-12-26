const fs = require('fs');
const path = require('path');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const dbPath = path.join(__dirname, '../../database.json');
    
    if (!fs.existsSync(dbPath)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify([])
      };
    }

    const data = fs.readFileSync(dbPath, 'utf8');
    
    return {
      statusCode: 200,
      headers,
      body: data
    };
  } catch (error) {
    console.error('Error reading database:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to read database' })
    };
  }
};
