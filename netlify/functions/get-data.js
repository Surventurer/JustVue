const { getAllSnippets } = require('./db');

exports.handler = async function(event, context) {
  // Prevent function from waiting for empty event loop
  context.callbackWaitsForEmptyEventLoop = false;
  
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
    const snippets = await getAllSnippets();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(snippets)
    };
  } catch (error) {
    console.error('Error reading database:', error.message);
    console.error('Error stack:', error.stack);
    
    // Check for specific error types
    let errorMessage = 'Failed to read database';
    if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      errorMessage = 'Database host not found. Check DB_HOST environment variable.';
    } else if (error.message.includes('authentication')) {
      errorMessage = 'Database authentication failed. Check DB_USER and DB_PASSWORD.';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Database connection timeout. The database may be unavailable.';
    } else if (error.message.includes('certificate')) {
      errorMessage = 'SSL certificate error. Check DB_CA_CERT environment variable.';
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: errorMessage, 
        details: error.message,
        hint: 'Check Netlify function logs for more details'
      })
    };
  }
};
