const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for server-side operations

// Create Supabase client
let supabase;
let initError = null;

function getSupabase() {
  if (initError) {
    throw initError;
  }
  
  if (!supabase) {
    if (!supabaseUrl || !supabaseKey) {
      initError = new Error('Missing Supabase environment variables: SUPABASE_URL or SUPABASE_SERVICE_KEY. Please set them in Netlify Dashboard > Site Settings > Environment Variables.');
      throw initError;
    }
    
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
    } catch (err) {
      initError = new Error(`Failed to create Supabase client: ${err.message}`);
      throw initError;
    }
  }
  return supabase;
}

// Storage bucket name for files
const STORAGE_BUCKET = 'code-files';

// ===== Database Operations (Text Content) =====

// Get all code snippets (metadata only for files, full content for text)
async function getAllSnippets() {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('code_snippets')
    .select('*')
    .order('id', { ascending: false });
  
  if (error) throw error;
  
  return data.map(row => mapRowToSnippet(row));
}

// Get snippet count
async function getSnippetCount() {
  const supabase = getSupabase();
  
  const { count, error } = await supabase
    .from('code_snippets')
    .select('*', { count: 'exact', head: true });
  
  if (error) throw error;
  return count || 0;
}

// Get snippets with pagination
async function getSnippetsPaginated(limit, offset, lightweight = false) {
  const supabase = getSupabase();
  
  // Select columns based on lightweight mode
  const columns = lightweight
    ? 'id, title, password, timestamp, hidden, is_encrypted, content_type, file_name, file_type, storage_path'
    : '*';
  
  const { data, error } = await supabase
    .from('code_snippets')
    .select(columns)
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (error) throw error;
  
  return data.map(row => mapRowToSnippet(row, lightweight));
}

// Get single snippet by ID
async function getSnippetById(id) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('code_snippets')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  
  return data ? mapRowToSnippet(data) : null;
}

// Save single snippet
async function saveSnippet(snippet) {
  const supabase = getSupabase();
  
  const row = {
    id: snippet.id,
    title: snippet.title,
    code: snippet.contentType === 'text' ? (snippet.code || snippet.content || '') : null,
    password: snippet.password,
    timestamp: snippet.timestamp,
    hidden: snippet.hidden || false,
    is_encrypted: snippet.isEncrypted || false,
    content_type: snippet.contentType || 'text',
    file_name: snippet.fileName || null,
    file_type: snippet.fileType || null,
    storage_path: snippet.storagePath || null
  };
  
  const { data, error } = await supabase
    .from('code_snippets')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  
  if (error) throw error;
  return mapRowToSnippet(data);
}

// Delete snippet by ID
async function deleteSnippet(id) {
  const supabase = getSupabase();
  
  // First get the snippet to check if it has a storage path
  const { data: snippet } = await supabase
    .from('code_snippets')
    .select('storage_path')
    .eq('id', id)
    .single();
  
  // Delete from storage if it has a file
  if (snippet?.storage_path) {
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([snippet.storage_path]);
  }
  
  // Delete from database
  const { error } = await supabase
    .from('code_snippets')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  return true;
}

// Save all snippets (replace all - for sync)
async function saveAllSnippets(snippets) {
  const supabase = getSupabase();
  
  // Get existing snippets to clean up storage
  const { data: existing } = await supabase
    .from('code_snippets')
    .select('id, storage_path');
  
  // Delete all existing from database
  const { error: deleteError } = await supabase
    .from('code_snippets')
    .delete()
    .neq('id', 0); // Delete all (id != 0 is always true)
  
  if (deleteError) throw deleteError;
  
  // Insert new snippets (text only - files handled separately)
  const textSnippets = snippets.filter(s => s.contentType === 'text' || !s.contentType);
  
  if (textSnippets.length > 0) {
    const rows = textSnippets.map(snippet => ({
      id: snippet.id,
      title: snippet.title,
      code: snippet.code || snippet.content || '',
      password: snippet.password,
      timestamp: snippet.timestamp,
      hidden: snippet.hidden || false,
      is_encrypted: snippet.isEncrypted || false,
      content_type: 'text',
      file_name: null,
      file_type: null,
      storage_path: null
    }));
    
    const { error: insertError } = await supabase
      .from('code_snippets')
      .insert(rows);
    
    if (insertError) throw insertError;
  }
  
  return true;
}

// ===== Storage Operations (Images/PDFs) =====

// Upload file to Supabase Storage
async function uploadFile(fileData, fileName, fileType, snippetId) {
  const supabase = getSupabase();
  
  // Sanitize filename (remove special chars that might cause issues)
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Create storage path: files/{snippetId}/{fileName}
  const storagePath = `files/${snippetId}/${safeFileName}`;
  
  // Convert base64 data URL to buffer
  let base64Data;
  if (fileData.includes(',')) {
    base64Data = fileData.split(',')[1]; // Remove data:mime;base64, prefix
  } else {
    base64Data = fileData; // Already just base64
  }
  
  const buffer = Buffer.from(base64Data, 'base64');
  
  console.log(`Uploading file: ${storagePath}, size: ${buffer.length} bytes`);
  
  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: fileType,
      upsert: true
    });
  
  if (error) {
    console.error('Storage upload error:', error);
    // Provide helpful error message
    if (error.message.includes('Bucket not found')) {
      throw new Error(`Storage bucket "${STORAGE_BUCKET}" not found. Create it in Supabase Dashboard > Storage.`);
    }
    if (error.message.includes('not allowed') || error.message.includes('policy')) {
      throw new Error(`Storage permission denied. Check bucket policies in Supabase Dashboard > Storage > ${STORAGE_BUCKET} > Policies.`);
    }
    throw error;
  }
  
  return storagePath;
}

// Get signed URL for file download
async function getFileUrl(storagePath) {
  const supabase = getSupabase();
  
  // Get signed URL valid for 1 hour
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600); // 1 hour expiry
  
  if (error) throw error;
  
  return data.signedUrl;
}

// Get public URL for file (if bucket is public)
function getPublicUrl(storagePath) {
  const supabase = getSupabase();
  
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);
  
  return data.publicUrl;
}

// Delete file from storage
async function deleteFile(storagePath) {
  const supabase = getSupabase();
  
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([storagePath]);
  
  if (error) throw error;
  return true;
}

// ===== Helper Functions =====

function mapRowToSnippet(row, lightweight = false) {
  const snippet = {
    id: row.id,
    title: row.title,
    password: row.password,
    timestamp: row.timestamp,
    hidden: row.hidden,
    isEncrypted: row.is_encrypted,
    contentType: row.content_type || 'text',
    fileName: row.file_name,
    fileType: row.file_type,
    storagePath: row.storage_path
  };
  
  // Include content for text snippets (not lightweight mode)
  if (!lightweight && row.content_type === 'text' && row.code !== undefined) {
    snippet.code = row.code;
    snippet.content = row.code;
  }
  
  // Mark as needing content load for files or lightweight mode
  if (lightweight || (row.content_type !== 'text' && row.storage_path)) {
    snippet.contentLoaded = false;
  }
  
  return snippet;
}

module.exports = {
  getSupabase,
  getAllSnippets,
  getSnippetCount,
  getSnippetsPaginated,
  getSnippetById,
  saveSnippet,
  deleteSnippet,
  saveAllSnippets,
  uploadFile,
  getFileUrl,
  getPublicUrl,
  deleteFile,
  STORAGE_BUCKET
};
