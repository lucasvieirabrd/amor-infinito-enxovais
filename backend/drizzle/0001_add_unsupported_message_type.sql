-- Migration: add 'unsupported' to messages.type enum
-- Run manually if drizzle-kit push is not available:
ALTER TABLE messages MODIFY COLUMN type ENUM('text','template','image','audio','video','document','unknown','unsupported') NOT NULL DEFAULT 'text';
