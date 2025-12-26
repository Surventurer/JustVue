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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    
    if (!Array.isArray(data)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid data format' })
      };
    }

    const dbPath = path.join(__dirname, '../../database.json');
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Data saved successfully' })
    };
  } catch (error) {
    console.error('Error saving database:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to save database' })
    };
  }
};
