const { getSupabase, STORAGE_BUCKET } = require('./db');

// Scheduled function to auto-delete expired snippets
// Runs daily via Netlify Scheduled Functions
exports.handler = async function(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;

  const headers = {
    'Content-Type': 'application/json'
  };

  try {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Find all snippets that have passed their auto_delete_at date
    const { data: expiredSnippets, error: fetchError } = await supabase
      .from('code_snippets')
      .select('id, storage_path')
      .not('auto_delete_at', 'is', null)
      .lte('auto_delete_at', now);

    if (fetchError) throw fetchError;

    if (!expiredSnippets || expiredSnippets.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'No expired snippets to delete', deleted: 0 })
      };
    }

    let deletedCount = 0;

    for (const snippet of expiredSnippets) {
      // Delete from storage if it has a file
      if (snippet.storage_path) {
        try {
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([snippet.storage_path]);
        } catch (storageErr) {
          console.error(`Failed to delete storage for snippet ${snippet.id}:`, storageErr.message);
          // Continue with DB deletion even if storage fails
        }
      }

      // Delete from database
      const { error: deleteError } = await supabase
        .from('code_snippets')
        .delete()
        .eq('id', snippet.id);

      if (deleteError) {
        console.error(`Failed to delete snippet ${snippet.id}:`, deleteError.message);
      } else {
        deletedCount++;
      }
    }

    console.log(`Auto-delete: removed ${deletedCount} expired snippets`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: `Auto-deleted ${deletedCount} expired snippets`,
        deleted: deletedCount,
        total_expired: expiredSnippets.length
      })
    };
  } catch (error) {
    console.error('Auto-delete error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Auto-delete failed', details: error.message })
    };
  }
};
