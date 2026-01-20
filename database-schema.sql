-- =====================================================
-- JustVue - Supabase Database Schema
-- =====================================================
-- Run this in the Supabase SQL Editor

-- Create the code_snippets table
CREATE TABLE IF NOT EXISTS code_snippets (
    id BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    code TEXT,  -- Only used for text content, NULL for files
    password TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    hidden BOOLEAN DEFAULT FALSE,
    is_encrypted BOOLEAN DEFAULT FALSE,
    content_type VARCHAR(50) DEFAULT 'text',  -- 'text', 'image', 'pdf'
    file_name TEXT,
    file_type VARCHAR(100),
    storage_path TEXT,  -- Path in Supabase Storage for files
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_code_snippets_id ON code_snippets(id DESC);
CREATE INDEX IF NOT EXISTS idx_code_snippets_content_type ON code_snippets(content_type);

-- Enable Row Level Security (optional - if you want public access, skip this)
-- ALTER TABLE code_snippets ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations (for public access)
-- CREATE POLICY "Allow all" ON code_snippets FOR ALL USING (true);

-- =====================================================
-- Supabase Storage Setup
-- =====================================================
-- 
-- 1. Go to Supabase Dashboard > Storage
-- 2. Create a new bucket called "code-files"
-- 3. Set it to PUBLIC if you want direct URL access
--    OR keep it PRIVATE for signed URLs (more secure)
-- 
-- For PUBLIC bucket:
--   - Files can be accessed directly via URL
--   - Good for non-sensitive images/PDFs
-- 
-- For PRIVATE bucket (recommended):
--   - Files require signed URLs (expire after 1 hour)
--   - More secure for sensitive documents
--
-- =====================================================

-- =====================================================
-- Environment Variables for Netlify
-- =====================================================
-- Set these in Netlify > Site Settings > Environment Variables:
--
-- SUPABASE_URL=https://your-project-id.supabase.co
-- SUPABASE_SERVICE_KEY=your-service-role-key
--
-- Get these from:
-- Supabase Dashboard > Settings > API
-- - URL: Project URL
-- - Service Key: service_role key (NOT anon key)
--
-- =====================================================

-- =====================================================
-- Migration from Aiven/PostgreSQL
-- =====================================================
-- If migrating from existing data:
--
-- 1. Export existing data as JSON
-- 2. For text snippets: Insert directly into code_snippets
-- 3. For files (images/PDFs):
--    a. Upload to Supabase Storage
--    b. Insert metadata with storage_path
--
-- Example migration query for text snippets:
-- INSERT INTO code_snippets (id, title, code, password, timestamp, hidden, is_encrypted, content_type)
-- SELECT id, title, code, password, timestamp, hidden, is_encrypted, 
--        COALESCE(content_type, 'text')
-- FROM old_code_snippets
-- WHERE content_type = 'text' OR content_type IS NULL;
--
-- =====================================================
