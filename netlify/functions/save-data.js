const { 
  saveSnippet, 
  saveAllSnippets, 
  deleteSnippet,
  uploadFile 
} = require('./db');

exports.handler = async function(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Handle DELETE request
  if (event.httpMethod === 'DELETE') {
    try {
      const params = event.queryStringParameters || {};
      const id = params.id ? parseInt(params.id, 10) : null;
      
      if (!id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing snippet ID' })
        };
      }
      
      await deleteSnippet(id);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Snippet deleted' })
      };
    } catch (error) {
      console.error('Error deleting snippet:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to delete snippet', details: error.message })
      };
    }
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
    
    // Handle single snippet save (with file upload support)
    if (data.snippet) {
      const snippet = data.snippet;
      
      // Check if file was already uploaded directly to storage (has storagePath, no content)
      if (snippet.storagePath && !snippet.content) {
        // File already uploaded directly by browser - just save metadata
        const savedSnippet = await saveSnippet({
          ...snippet,
          content: null,
          code: null
        });
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Metadata saved (file already uploaded)',
            snippet: savedSnippet
          })
        };
      }
      
      // If it's a file (image/PDF) with content, upload to storage first
      if ((snippet.contentType === 'image' || snippet.contentType === 'pdf') && snippet.content) {
        const storagePath = await uploadFile(
          snippet.content,
          snippet.fileName || `file-${snippet.id}`,
          snippet.fileType || 'application/octet-stream',
          snippet.id
        );
        
        // Save metadata to database (without content, just storage path)
        const savedSnippet = await saveSnippet({
          ...snippet,
          storagePath: storagePath,
          content: null, // Don't store file content in DB
          code: null
        });
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'File uploaded and saved',
            snippet: savedSnippet
          })
        };
      }
      
      // Text content - save directly to database
      const savedSnippet = await saveSnippet(snippet);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Snippet saved',
          snippet: savedSnippet
        })
      };
    }
    
    // Handle batch save (array of snippets - text only)
    if (Array.isArray(data)) {
      // Filter to only text snippets for batch save
      const textSnippets = data.filter(s => !s.contentType || s.contentType === 'text');
      
      await saveAllSnippets(textSnippets);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: `Saved ${textSnippets.length} text snippets`
        })
      };
    }
    
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid data format. Expected {snippet: ...} or array of snippets.' })
    };
    
  } catch (error) {
    console.error('Error saving data:', error);
    
    // Provide helpful error messages
    let errorMessage = 'Failed to save data';
    if (error.message.includes('Supabase environment')) {
      errorMessage = 'Database not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Netlify environment variables.';
    } else if (error.message.includes('Invalid API key')) {
      errorMessage = 'Invalid Supabase API key. Check SUPABASE_SERVICE_KEY.';
    } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
      errorMessage = 'Database table not found. Run the schema SQL in Supabase.';
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage, details: error.message })
    };
  }
};
