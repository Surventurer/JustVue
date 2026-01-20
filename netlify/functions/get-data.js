const { 
  getAllSnippets, 
  getSnippetCount, 
  getSnippetsPaginated, 
  getSnippetById,
  getFileUrl
} = require('./db');

exports.handler = async function(event, context) {
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
    const params = event.queryStringParameters || {};
    const page = parseInt(params.page, 10) || 0;
    const limit = parseInt(params.limit, 10) || 50;
    const countOnly = params.countOnly === 'true';
    const lightweight = params.lightweight === 'true';
    const snippetId = params.id ? parseInt(params.id, 10) : null;
    const getUrl = params.getUrl === 'true'; // Get signed URL for file
    
    // Fetch single snippet by ID
    if (snippetId) {
      const snippet = await getSnippetById(snippetId);
      
      if (!snippet) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Snippet not found' })
        };
      }
      
      // If it's a file and URL is requested, get signed URL
      if (getUrl && snippet.storagePath) {
        const fileUrl = await getFileUrl(snippet.storagePath);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ...snippet,
            fileUrl: fileUrl
          })
        };
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(snippet)
      };
    }
    
    // Return count only
    if (countOnly) {
      const count = await getSnippetCount();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ count })
      };
    }
    
    // Get paginated snippets
    const offset = page * limit;
    const snippets = await getSnippetsPaginated(limit, offset, lightweight);
    const totalCount = await getSnippetCount();
    const hasMore = offset + snippets.length < totalCount;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        snippets,
        pagination: {
          page,
          limit,
          totalCount,
          hasMore,
          totalPages: Math.ceil(totalCount / limit)
        }
      })
    };
    
  } catch (error) {
    console.error('Error reading data:', error.message);
    console.error('Error stack:', error.stack);
    
    let errorMessage = 'Failed to read data';
    if (error.message.includes('Invalid API key')) {
      errorMessage = 'Invalid Supabase API key. Check SUPABASE_SERVICE_KEY.';
    } else if (error.message.includes('not found')) {
      errorMessage = 'Database table not found. Run the schema migration.';
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: errorMessage, 
        details: error.message 
      })
    };
  }
};
