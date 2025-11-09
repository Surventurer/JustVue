// Netlify serverless function to provide GitHub token securely
exports.handler = async function(event, context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Get token from environment variable
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'GitHub token not configured',
        message: 'Please add GITHUB_TOKEN to Netlify environment variables' 
      })
    };
  }

  // Return the token
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ 
      token: githubToken,
      success: true
    })
  };
};
