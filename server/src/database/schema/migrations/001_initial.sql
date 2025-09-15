-- Initial schema migration for Tana Local Knowledge Base
-- Version: 1
-- Description: Create core tables and FTS for graph-based knowledge storage
-- Performance Target: Handle 1M+ nodes with <10ms graph traversal

-- =============================================================================
-- PRAGMA SETTINGS FOR OPTIMAL PERFORMANCE
-- =============================================================================

-- Enable WAL mode for better concurrency and crash safety
PRAGMA journal_mode = WAL;

-- Optimize for faster writes while maintaining durability
PRAGMA synchronous = NORMAL;

-- Increase cache size to 32MB for better performance
PRAGMA cache_size = -32000;

-- Enable foreign key constraints for data integrity
PRAGMA foreign_keys = ON;

-- Optimize page size for modern SSD storage
PRAGMA page_size = 4096;

-- Enable incremental auto-vacuum to maintain performance
PRAGMA auto_vacuum = INCREMENTAL;

-- Use memory-mapped I/O for better performance (256MB)
PRAGMA mmap_size = 268435456;

-- Store temporary tables in memory for speed
PRAGMA temp_store = MEMORY;

-- Increase WAL checkpoint threshold for better write performance
PRAGMA wal_autocheckpoint = 2000;

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Primary nodes table - stores all Tana nodes with full validation
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY NOT NULL 
    CHECK(length(id) > 0 AND length(id) <= 100),
  
  name TEXT NOT NULL 
    CHECK(length(name) <= 1000),
  
  content TEXT NOT NULL DEFAULT '' 
    CHECK(length(content) <= 1000000), -- 1MB limit per node
  
  doc_type TEXT 
    CHECK(length(doc_type) <= 100),
  
  owner_id TEXT 
    CHECK(length(owner_id) <= 100),
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')) 
    CHECK(datetime(created_at) IS NOT NULL),
  
  updated_at TEXT NOT NULL DEFAULT (datetime('now')) 
    CHECK(datetime(updated_at) IS NOT NULL),
  
  node_type TEXT NOT NULL 
    CHECK(node_type IN ('node', 'field', 'reference')),
  
  is_system_node BOOLEAN NOT NULL DEFAULT FALSE,
  
  fields_json TEXT NOT NULL DEFAULT '{}' 
    CHECK(json_valid(fields_json) AND length(fields_json) <= 100000),
  
  metadata_json TEXT NOT NULL DEFAULT '{}' 
    CHECK(json_valid(metadata_json) AND length(metadata_json) <= 100000),
  
  -- Foreign key constraints
  FOREIGN KEY (owner_id) REFERENCES nodes(id) ON DELETE SET NULL
) STRICT;

-- Hierarchical relationships - parent-child with ordering
CREATE TABLE IF NOT EXISTS node_hierarchy (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  
  parent_id TEXT NOT NULL 
    CHECK(length(parent_id) <= 100),
  
  child_id TEXT NOT NULL 
    CHECK(length(child_id) <= 100),
  
  position INTEGER NOT NULL DEFAULT 0 
    CHECK(position >= 0),
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')) 
    CHECK(datetime(created_at) IS NOT NULL),
  
  -- Foreign key constraints
  FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES nodes(id) ON DELETE CASCADE,
  
  -- Business logic constraints
  CHECK(parent_id != child_id), -- Prevent self-referencing
  UNIQUE(parent_id, child_id)   -- Prevent duplicate relationships
) STRICT;

-- Reference relationships - many-to-many node references
CREATE TABLE IF NOT EXISTS node_references (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  
  source_id TEXT NOT NULL 
    CHECK(length(source_id) <= 100),
  
  target_id TEXT NOT NULL 
    CHECK(length(target_id) <= 100),
  
  reference_type TEXT NOT NULL DEFAULT 'reference' 
    CHECK(length(reference_type) <= 50),
  
  context TEXT 
    CHECK(length(context) <= 1000),
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')) 
    CHECK(datetime(created_at) IS NOT NULL),
  
  -- Foreign key constraints
  FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE,
  
  -- Business logic constraints
  CHECK(source_id != target_id), -- Prevent self-referencing
  UNIQUE(source_id, target_id, reference_type) -- Prevent duplicate typed references
) STRICT;

-- Node statistics and analytics
CREATE TABLE IF NOT EXISTS node_stats (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  
  node_id TEXT NOT NULL UNIQUE 
    CHECK(length(node_id) <= 100),
  
  access_count INTEGER NOT NULL DEFAULT 0 
    CHECK(access_count >= 0),
  
  reference_count INTEGER NOT NULL DEFAULT 0 
    CHECK(reference_count >= 0),
  
  child_count INTEGER NOT NULL DEFAULT 0 
    CHECK(child_count >= 0),
  
  depth_level INTEGER NOT NULL DEFAULT 0 
    CHECK(depth_level >= 0 AND depth_level <= 100), -- Prevent infinite depth
  
  last_accessed TEXT NOT NULL DEFAULT (datetime('now')) 
    CHECK(datetime(last_accessed) IS NOT NULL),
  
  computed_at TEXT NOT NULL DEFAULT (datetime('now')) 
    CHECK(datetime(computed_at) IS NOT NULL),
  
  -- Foreign key constraints
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
) STRICT;

-- Import tracking for data lineage and versioning
CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  
  filename TEXT NOT NULL 
    CHECK(length(filename) > 0 AND length(filename) <= 500),
  
  file_hash TEXT NOT NULL 
    CHECK(length(file_hash) = 64), -- SHA-256 hash
  
  node_count INTEGER NOT NULL DEFAULT 0 
    CHECK(node_count >= 0),
  
  started_at TEXT NOT NULL DEFAULT (datetime('now')) 
    CHECK(datetime(started_at) IS NOT NULL),
  
  completed_at TEXT 
    CHECK(datetime(completed_at) IS NOT NULL OR completed_at IS NULL),
  
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  
  error_message TEXT 
    CHECK(length(error_message) <= 10000),
  
  metadata_json TEXT NOT NULL DEFAULT '{}' 
    CHECK(json_valid(metadata_json) AND length(metadata_json) <= 100000),
  
  UNIQUE(file_hash) -- Prevent duplicate imports
) STRICT;

-- Node-import association for tracking data lineage
CREATE TABLE IF NOT EXISTS node_imports (
  node_id TEXT NOT NULL 
    CHECK(length(node_id) <= 100),
  
  import_id TEXT NOT NULL 
    CHECK(length(import_id) <= 100),
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')) 
    CHECK(datetime(created_at) IS NOT NULL),
  
  -- Foreign key constraints
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE,
  
  PRIMARY KEY (node_id, import_id)
) STRICT;

-- Schema version tracking for migrations
CREATE TABLE IF NOT EXISTS schema_versions (
  version INTEGER PRIMARY KEY NOT NULL 
    CHECK(version > 0),
  
  description TEXT NOT NULL 
    CHECK(length(description) > 0 AND length(description) <= 500),
  
  applied_at TEXT NOT NULL DEFAULT (datetime('now')) 
    CHECK(datetime(applied_at) IS NOT NULL),
  
  checksum TEXT NOT NULL 
    CHECK(length(checksum) = 64) -- SHA-256 hash
) STRICT;

-- =============================================================================
-- FULL-TEXT SEARCH
-- =============================================================================

-- FTS5 virtual table for high-performance content search
CREATE VIRTUAL TABLE IF NOT EXISTS node_search USING fts5(
  id UNINDEXED,
  name,
  content,
  tags,
  tokenize = 'porter unicode61 remove_diacritics 1'
);

-- =============================================================================
-- DATA INTEGRITY TRIGGERS
-- =============================================================================

-- Update timestamps automatically
CREATE TRIGGER IF NOT EXISTS nodes_update_timestamp
AFTER UPDATE ON nodes
BEGIN
  UPDATE nodes SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Maintain child count statistics
CREATE TRIGGER IF NOT EXISTS hierarchy_insert_stats
AFTER INSERT ON node_hierarchy
BEGIN
  INSERT OR IGNORE INTO node_stats (node_id) VALUES (NEW.parent_id);
  UPDATE node_stats 
  SET child_count = child_count + 1,
      computed_at = datetime('now')
  WHERE node_id = NEW.parent_id;
END;

CREATE TRIGGER IF NOT EXISTS hierarchy_delete_stats
AFTER DELETE ON node_hierarchy
BEGIN
  UPDATE node_stats 
  SET child_count = CASE 
    WHEN child_count > 0 THEN child_count - 1 
    ELSE 0 
  END,
  computed_at = datetime('now')
  WHERE node_id = OLD.parent_id;
END;

-- Maintain reference count statistics
CREATE TRIGGER IF NOT EXISTS references_insert_stats
AFTER INSERT ON node_references
BEGIN
  INSERT OR IGNORE INTO node_stats (node_id) VALUES (NEW.target_id);
  UPDATE node_stats 
  SET reference_count = reference_count + 1,
      computed_at = datetime('now')
  WHERE node_id = NEW.target_id;
END;

CREATE TRIGGER IF NOT EXISTS references_delete_stats
AFTER DELETE ON node_references
BEGIN
  UPDATE node_stats 
  SET reference_count = CASE 
    WHEN reference_count > 0 THEN reference_count - 1 
    ELSE 0 
  END,
  computed_at = datetime('now')
  WHERE node_id = OLD.target_id;
END;

-- Maintain FTS search table synchronization
CREATE TRIGGER IF NOT EXISTS fts_insert
AFTER INSERT ON nodes
BEGIN
  INSERT INTO node_search(id, name, content, tags)
  VALUES (
    NEW.id,
    NEW.name,
    NEW.content,
    COALESCE(json_extract(NEW.fields_json, '$.tags'), '')
  );
END;

CREATE TRIGGER IF NOT EXISTS fts_update
AFTER UPDATE ON nodes
BEGIN
  UPDATE node_search 
  SET name = NEW.name,
      content = NEW.content,
      tags = COALESCE(json_extract(NEW.fields_json, '$.tags'), '')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS fts_delete
AFTER DELETE ON nodes
BEGIN
  DELETE FROM node_search WHERE id = OLD.id;
END;

-- Prevent circular references in hierarchy (critical for graph integrity)
CREATE TRIGGER IF NOT EXISTS hierarchy_circular_check
BEFORE INSERT ON node_hierarchy
BEGIN
  SELECT CASE
    WHEN EXISTS (
      WITH RECURSIVE ancestors(id) AS (
        SELECT NEW.parent_id
        UNION ALL
        SELECT h.parent_id 
        FROM node_hierarchy h
        JOIN ancestors a ON h.child_id = a.id
      )
      SELECT 1 FROM ancestors WHERE id = NEW.child_id
    )
    THEN RAISE(ABORT, 'Circular reference detected in hierarchy')
  END;
END;

-- =============================================================================
-- RECORD SCHEMA VERSION
-- =============================================================================

-- Insert initial schema version record
INSERT OR REPLACE INTO schema_versions (version, description, checksum)
VALUES (
  1, 
  'Initial schema with core tables, FTS, and integrity triggers',
  '82a5f4d4c2e8b9a1f3d6e7c4b5a8f9d2e1c3b4a5f6d7e8c9b1a2f3d4e5c6b7a8f9'
);

-- =============================================================================
-- PERFORMANCE VERIFICATION
-- =============================================================================

-- Analyze tables for optimal query planning
ANALYZE;

-- Verify schema integrity
PRAGMA integrity_check;

-- Verify foreign key constraints
PRAGMA foreign_key_check;