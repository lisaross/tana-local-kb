/**
 * Core SQLite table definitions for Tana knowledge base
 * 
 * This file contains the SQL DDL statements for creating all database tables
 * optimized for performance with 1M+ nodes and fast graph operations.
 */

// Primary nodes table - stores all Tana nodes
export const NODES_TABLE = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id) > 0 AND length(id) <= 100),
  name TEXT NOT NULL CHECK(length(name) <= 1000),
  content TEXT NOT NULL DEFAULT '' CHECK(length(content) <= 1000000),
  doc_type TEXT CHECK(length(doc_type) <= 100),
  owner_id TEXT CHECK(length(owner_id) <= 100),
  created_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(created_at) IS NOT NULL),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(updated_at) IS NOT NULL),
  node_type TEXT NOT NULL CHECK(node_type IN ('node', 'field', 'reference')),
  is_system_node BOOLEAN NOT NULL DEFAULT FALSE,
  fields_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(fields_json) AND length(fields_json) <= 100000),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json) AND length(metadata_json) <= 100000),
  
  -- Foreign key constraints
  FOREIGN KEY (owner_id) REFERENCES nodes(id) ON DELETE SET NULL
) STRICT;
`

// Hierarchical relationships table - parent-child with ordering
export const NODE_HIERARCHY_TABLE = `
CREATE TABLE IF NOT EXISTS node_hierarchy (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  parent_id TEXT NOT NULL CHECK(length(parent_id) <= 100),
  child_id TEXT NOT NULL CHECK(length(child_id) <= 100),
  position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(created_at) IS NOT NULL),
  
  -- Foreign key constraints
  FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES nodes(id) ON DELETE CASCADE,
  
  -- Prevent self-referencing and duplicate relationships
  CHECK(parent_id != child_id),
  UNIQUE(parent_id, child_id)
) STRICT;
`

// Reference relationships table - many-to-many node references
export const NODE_REFERENCES_TABLE = `
CREATE TABLE IF NOT EXISTS node_references (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  source_id TEXT NOT NULL CHECK(length(source_id) <= 100),
  target_id TEXT NOT NULL CHECK(length(target_id) <= 100),
  reference_type TEXT NOT NULL DEFAULT 'reference' CHECK(length(reference_type) <= 50),
  context TEXT CHECK(length(context) <= 1000),
  created_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(created_at) IS NOT NULL),
  
  -- Foreign key constraints
  FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE,
  
  -- Prevent self-referencing and duplicate typed references
  CHECK(source_id != target_id),
  UNIQUE(source_id, target_id, reference_type)
) STRICT;
`

// Full-text search virtual table using FTS5
export const NODE_SEARCH_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS node_search USING fts5(
  id UNINDEXED,
  name,
  content,
  tags,
  tokenize = 'porter unicode61 remove_diacritics 1'
);
`

// Node statistics and analytics table
export const NODE_STATS_TABLE = `
CREATE TABLE IF NOT EXISTS node_stats (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  node_id TEXT NOT NULL UNIQUE CHECK(length(node_id) <= 100),
  access_count INTEGER NOT NULL DEFAULT 0 CHECK(access_count >= 0),
  reference_count INTEGER NOT NULL DEFAULT 0 CHECK(reference_count >= 0),
  child_count INTEGER NOT NULL DEFAULT 0 CHECK(child_count >= 0),
  depth_level INTEGER NOT NULL DEFAULT 0 CHECK(depth_level >= 0 AND depth_level <= 100),
  last_accessed TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(last_accessed) IS NOT NULL),
  computed_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(computed_at) IS NOT NULL),
  
  -- Foreign key constraints
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
) STRICT;
`

// Import tracking table for data lineage
export const IMPORTS_TABLE = `
CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  filename TEXT NOT NULL CHECK(length(filename) > 0 AND length(filename) <= 500),
  file_hash TEXT NOT NULL CHECK(length(file_hash) = 64), -- SHA-256 hash
  node_count INTEGER NOT NULL DEFAULT 0 CHECK(node_count >= 0),
  started_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(started_at) IS NOT NULL),
  completed_at TEXT CHECK(datetime(completed_at) IS NOT NULL OR completed_at IS NULL),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT CHECK(length(error_message) <= 10000),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json) AND length(metadata_json) <= 100000),
  
  UNIQUE(file_hash)
) STRICT;
`

// Node-import association table
export const NODE_IMPORTS_TABLE = `
CREATE TABLE IF NOT EXISTS node_imports (
  node_id TEXT NOT NULL CHECK(length(node_id) <= 100),
  import_id TEXT NOT NULL CHECK(length(import_id) <= 100),
  created_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(created_at) IS NOT NULL),
  
  -- Foreign key constraints
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE,
  
  PRIMARY KEY (node_id, import_id)
) STRICT;
`

// Schema version tracking table
export const SCHEMA_VERSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_versions (
  version INTEGER PRIMARY KEY NOT NULL CHECK(version > 0),
  description TEXT NOT NULL CHECK(length(description) > 0 AND length(description) <= 500),
  applied_at TEXT NOT NULL DEFAULT (datetime('now')) CHECK(datetime(applied_at) IS NOT NULL),
  checksum TEXT NOT NULL CHECK(length(checksum) = 64) -- SHA-256 hash
) STRICT;
`

// Triggers for maintaining data integrity and statistics

// Update timestamps trigger for nodes
export const NODES_UPDATE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS nodes_update_timestamp
AFTER UPDATE ON nodes
BEGIN
  UPDATE nodes SET updated_at = datetime('now') WHERE id = NEW.id;
END;
`

// Maintain child count in node_stats
export const HIERARCHY_INSERT_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS hierarchy_insert_stats
AFTER INSERT ON node_hierarchy
BEGIN
  INSERT OR IGNORE INTO node_stats (node_id) VALUES (NEW.parent_id);
  UPDATE node_stats 
  SET child_count = child_count + 1,
      computed_at = datetime('now')
  WHERE node_id = NEW.parent_id;
END;
`

export const HIERARCHY_DELETE_TRIGGER = `
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
`

// Maintain reference count in node_stats
export const REFERENCES_INSERT_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS references_insert_stats
AFTER INSERT ON node_references
BEGIN
  INSERT OR IGNORE INTO node_stats (node_id) VALUES (NEW.target_id);
  UPDATE node_stats 
  SET reference_count = reference_count + 1,
      computed_at = datetime('now')
  WHERE node_id = NEW.target_id;
END;
`

export const REFERENCES_DELETE_TRIGGER = `
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
`

// Maintain FTS search table
export const FTS_INSERT_TRIGGER = `
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
`

export const FTS_UPDATE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS fts_update
AFTER UPDATE ON nodes
BEGIN
  UPDATE node_search 
  SET name = NEW.name,
      content = NEW.content,
      tags = COALESCE(json_extract(NEW.fields_json, '$.tags'), '')
  WHERE id = NEW.id;
END;
`

export const FTS_DELETE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS fts_delete
AFTER DELETE ON nodes
BEGIN
  DELETE FROM node_search WHERE id = OLD.id;
END;
`

// Prevent circular references in hierarchy
export const HIERARCHY_CIRCULAR_CHECK = `
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
`

// Array of all table creation statements in dependency order
export const TABLE_DEFINITIONS = [
  NODES_TABLE,
  NODE_HIERARCHY_TABLE,
  NODE_REFERENCES_TABLE,
  NODE_SEARCH_TABLE,
  NODE_STATS_TABLE,
  IMPORTS_TABLE,
  NODE_IMPORTS_TABLE,
  SCHEMA_VERSIONS_TABLE,
] as const

// Array of all trigger creation statements
export const TRIGGER_DEFINITIONS = [
  NODES_UPDATE_TRIGGER,
  HIERARCHY_INSERT_TRIGGER,
  HIERARCHY_DELETE_TRIGGER,
  REFERENCES_INSERT_TRIGGER,
  REFERENCES_DELETE_TRIGGER,
  FTS_INSERT_TRIGGER,
  FTS_UPDATE_TRIGGER,
  FTS_DELETE_TRIGGER,
  HIERARCHY_CIRCULAR_CHECK,
] as const

// SQLite PRAGMA settings for optimal performance
export const PERFORMANCE_PRAGMAS = {
  // Enable WAL mode for better concurrency
  journal_mode: 'WAL',
  
  // Optimize for faster writes
  synchronous: 'NORMAL',
  
  // Increase cache size (32MB)
  cache_size: '-32000',
  
  // Enable foreign key constraints
  foreign_keys: 'ON',
  
  // Optimize page size for SSD storage
  page_size: '4096',
  
  // Auto-vacuum to maintain performance
  auto_vacuum: 'INCREMENTAL',
  
  // Memory-mapped I/O for better performance
  mmap_size: '268435456', // 256MB
  
  // Optimize temporary storage
  temp_store: 'MEMORY',
  
  // Increase WAL checkpoint threshold
  wal_autocheckpoint: '2000',
} as const

// Database initialization function
export function createDatabaseSchema(): string[] {
  const statements: string[] = []
  
  // Apply PRAGMA settings
  Object.entries(PERFORMANCE_PRAGMAS).forEach(([pragma, value]) => {
    statements.push(`PRAGMA ${pragma} = ${value};`)
  })
  
  // Create tables
  statements.push(...TABLE_DEFINITIONS)
  
  // Create triggers
  statements.push(...TRIGGER_DEFINITIONS)
  
  return statements
}

// Export all definitions
export {
  PERFORMANCE_PRAGMAS as PRAGMAS,
  TABLE_DEFINITIONS as TABLES,
  TRIGGER_DEFINITIONS as TRIGGERS,
}