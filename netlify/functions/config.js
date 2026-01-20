// Provide public Supabase config to frontend for direct uploads
// Only exposes the anon key (safe for client-side use)

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Get Supabase URL and anon key from environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Supabase config not available',
        message: 'Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify environment variables'
      })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      supabaseUrl: supabaseUrl,
      supabaseAnonKey: supabaseAnonKey,
      storageBucket: 'code-files'
    })
  };
};
