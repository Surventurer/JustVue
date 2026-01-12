-- Code Manager Database Schema
-- Run this SQL in your PostgreSQL database (Supabase, Neon, etc.)

CREATE TABLE IF NOT EXISTS code_snippets (
    id BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    code TEXT NOT NULL,
    password TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    hidden BOOLEAN DEFAULT FALSE,
    is_encrypted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    content_type VARCHAR(50) DEFAULT 'text',
    file_name TEXT,
    file_type VARCHAR(100)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_code_snippets_id ON code_snippets(id DESC);

-- MIGRATION: If you already have the table, run this to add new columns:
-- ALTER TABLE code_snippets ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT 'text';
-- ALTER TABLE code_snippets ADD COLUMN IF NOT EXISTS file_name TEXT;
-- ALTER TABLE code_snippets ADD COLUMN IF NOT EXISTS file_type VARCHAR(100);
