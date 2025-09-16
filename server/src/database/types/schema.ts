/**
 * Database schema TypeScript types for Tana knowledge base
 * 
 * This file defines the database table structures and their TypeScript representations
 * optimized for graph operations, performance, and Bun's SQLite integration.
 */

// Core node table - stores the primary node data
export interface NodeRecord {
  id: string                    // Primary key, matches TanaNode.id
  name: string                  // Node title/name (indexed for search)
  content: string               // Full text content (FTS enabled)
  doc_type: string | null       // Tana document type
  owner_id: string | null       // Node owner reference
  created_at: string            // ISO timestamp (SQLite DATETIME)
  updated_at: string            // Last modification timestamp
  node_type: 'node' | 'field' | 'reference'  // Tana node type
  is_system_node: boolean       // System node flag (indexed)
  fields_json: string           // JSON string of node fields
  metadata_json: string         // JSON string of additional metadata
}

// Hierarchical relationships - parent-child with order
export interface NodeHierarchyRecord {
  id: string                    // Auto-generated primary key
  parent_id: string             // Foreign key to nodes.id
  child_id: string              // Foreign key to nodes.id
  position: number              // Order within parent (0-based)
  created_at: string            // When relationship was created
}

// Reference relationships - node references (many-to-many)
export interface NodeReferenceRecord {
  id: string                    // Auto-generated primary key
  source_id: string             // Node making the reference
  target_id: string             // Node being referenced
  reference_type: string        // Type of reference (e.g., 'mention', 'link', 'tag')
  context: string | null        // Optional context for the reference
  created_at: string            // When reference was created
}

// Full-text search virtual table (FTS5)
export interface NodeSearchRecord {
  rowid: number                 // FTS5 rowid
  id: string                    // Node ID
  name: string                  // Node name for search
  content: string               // Node content for search
  tags: string                  // Comma-separated tags for search
}

// Performance tracking and analytics
export interface NodeStatsRecord {
  id: string                    // Auto-generated primary key
  node_id: string               // Foreign key to nodes.id
  access_count: number          // Number of times accessed
  reference_count: number       // Number of incoming references
  child_count: number           // Number of direct children
  depth_level: number           // Depth in hierarchy (0 = root)
  last_accessed: string         // Last access timestamp
  computed_at: string           // When stats were computed
}

// Import tracking for data lineage
export interface ImportRecord {
  id: string                    // Auto-generated primary key
  filename: string              // Original import filename
  file_hash: string             // SHA-256 hash of import file
  node_count: number            // Number of nodes imported
  started_at: string            // Import start time
  completed_at: string | null   // Import completion time
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null  // Error details if failed
  metadata_json: string         // Import metadata and statistics
}

// Node-import relationship tracking
export interface NodeImportRecord {
  node_id: string               // Foreign key to nodes.id
  import_id: string             // Foreign key to imports.id
  created_at: string            // When association was created
}

// Database schema version tracking
export interface SchemaVersionRecord {
  version: number               // Schema version number
  description: string           // Version description
  applied_at: string           // When migration was applied
  checksum: string             // Migration file checksum
}

// TypeScript utility types for database operations
export type NodeInsert = Omit<NodeRecord, 'updated_at'>
export type NodeUpdate = Partial<Omit<NodeRecord, 'id' | 'created_at'>>

export type HierarchyInsert = Omit<NodeHierarchyRecord, 'id' | 'created_at'>
export type ReferenceInsert = Omit<NodeReferenceRecord, 'id' | 'created_at'>

// Query result types for common operations
export interface NodeWithRelations extends NodeRecord {
  children?: NodeRecord[]
  parents?: NodeRecord[]
  references?: NodeRecord[]
  referenced_by?: NodeRecord[]
}

export interface NodeHierarchyPath {
  node_id: string
  path: string[]               // Array of ancestor IDs from root to node
  depth: number
}

export interface SearchResult {
  node: NodeRecord
  rank: number                 // FTS5 rank score
  snippet: string              // Highlighted search snippet
  match_type: 'name' | 'content' | 'tag'
}

// Graph analytics types
export interface GraphMetrics {
  total_nodes: number
  total_relationships: number
  avg_children_per_node: number
  max_depth: number
  orphaned_nodes: number
  circular_references: number
  most_referenced_nodes: Array<{
    node_id: string
    name: string
    reference_count: number
  }>
}

// Database configuration and constraints
export const DB_CONSTRAINTS = {
  MAX_NAME_LENGTH: 1000,
  MAX_CONTENT_LENGTH: 1000000,   // 1MB per node
  MAX_JSON_SIZE: 100000,         // 100KB for JSON fields
  MAX_HIERARCHY_DEPTH: 100,      // Prevent infinite recursion
  MAX_REFERENCES_PER_NODE: 10000, // Performance limit
  BATCH_SIZE: 1000,              // Default batch operation size
} as const

// Index definitions for query optimization
export const INDEX_DEFINITIONS = {
  // Primary indexes
  nodes_name_idx: 'CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name)',
  nodes_type_idx: 'CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type)',
  nodes_system_idx: 'CREATE INDEX IF NOT EXISTS idx_nodes_system ON nodes(is_system_node)',
  nodes_owner_idx: 'CREATE INDEX IF NOT EXISTS idx_nodes_owner ON nodes(owner_id)',
  nodes_created_idx: 'CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at)',
  
  // Hierarchy indexes
  hierarchy_parent_idx: 'CREATE INDEX IF NOT EXISTS idx_hierarchy_parent ON node_hierarchy(parent_id)',
  hierarchy_child_idx: 'CREATE INDEX IF NOT EXISTS idx_hierarchy_child ON node_hierarchy(child_id)',
  hierarchy_position_idx: 'CREATE INDEX IF NOT EXISTS idx_hierarchy_position ON node_hierarchy(parent_id, position)',
  hierarchy_composite_idx: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_hierarchy_unique ON node_hierarchy(parent_id, child_id)',
  
  // Reference indexes
  references_source_idx: 'CREATE INDEX IF NOT EXISTS idx_references_source ON node_references(source_id)',
  references_target_idx: 'CREATE INDEX IF NOT EXISTS idx_references_target ON node_references(target_id)',
  references_type_idx: 'CREATE INDEX IF NOT EXISTS idx_references_type ON node_references(reference_type)',
  references_composite_idx: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_references_unique ON node_references(source_id, target_id, reference_type)',
  
  // Stats indexes
  stats_node_idx: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_node ON node_stats(node_id)',
  stats_access_idx: 'CREATE INDEX IF NOT EXISTS idx_stats_access ON node_stats(access_count DESC)',
  stats_references_idx: 'CREATE INDEX IF NOT EXISTS idx_stats_references ON node_stats(reference_count DESC)',
  
  // Import tracking indexes
  imports_status_idx: 'CREATE INDEX IF NOT EXISTS idx_imports_status ON imports(status)',
  imports_completed_idx: 'CREATE INDEX IF NOT EXISTS idx_imports_completed ON imports(completed_at)',
  node_imports_composite_idx: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_node_imports_unique ON node_imports(node_id, import_id)',
} as const

// Common query patterns for performance optimization
export const QUERY_PATTERNS = {
  // Node queries
  GET_NODE_BY_ID: 'SELECT * FROM nodes WHERE id = ?',
  GET_NODES_BY_TYPE: 'SELECT * FROM nodes WHERE node_type = ? AND is_system_node = FALSE',
  GET_SYSTEM_NODES: 'SELECT * FROM nodes WHERE is_system_node = TRUE',
  
  // Hierarchy queries
  GET_CHILDREN: `
    SELECT n.* FROM nodes n 
    JOIN node_hierarchy h ON n.id = h.child_id 
    WHERE h.parent_id = ? 
    ORDER BY h.position ASC
  `,
  GET_PARENTS: `
    SELECT n.* FROM nodes n 
    JOIN node_hierarchy h ON n.id = h.parent_id 
    WHERE h.child_id = ?
  `,
  GET_ANCESTORS: `
    WITH RECURSIVE ancestors(id, parent_id, level) AS (
      SELECT child_id, parent_id, 0 FROM node_hierarchy WHERE child_id = ?
      UNION ALL
      SELECT h.child_id, h.parent_id, level + 1 
      FROM node_hierarchy h
      JOIN ancestors a ON h.child_id = a.parent_id
      WHERE level < 100
    )
    SELECT n.*, a.level FROM nodes n 
    JOIN ancestors a ON n.id = a.parent_id
    ORDER BY a.level DESC
  `,
  GET_DESCENDANTS: `
    WITH RECURSIVE descendants(id, child_id, level) AS (
      SELECT parent_id, child_id, 0 FROM node_hierarchy WHERE parent_id = ?
      UNION ALL
      SELECT h.parent_id, h.child_id, level + 1 
      FROM node_hierarchy h
      JOIN descendants d ON h.parent_id = d.child_id
      WHERE level < 100
    )
    SELECT n.*, d.level FROM nodes n 
    JOIN descendants d ON n.id = d.child_id
    ORDER BY d.level ASC
  `,
  
  // Reference queries
  GET_REFERENCES_FROM: `
    SELECT n.* FROM nodes n 
    JOIN node_references r ON n.id = r.target_id 
    WHERE r.source_id = ?
  `,
  GET_REFERENCES_TO: `
    SELECT n.* FROM nodes n 
    JOIN node_references r ON n.id = r.source_id 
    WHERE r.target_id = ?
  `,
  
  // Search queries
  SEARCH_NODES: `
    SELECT n.*, s.rank, snippet(node_search, 1, '<mark>', '</mark>', '...', 32) as snippet
    FROM node_search s
    JOIN nodes n ON s.id = n.id
    WHERE node_search MATCH ?
    ORDER BY s.rank
  `,
  
  // Analytics queries
  GET_NODE_STATS: 'SELECT * FROM node_stats WHERE node_id = ?',
  GET_TOP_REFERENCED: 'SELECT * FROM node_stats ORDER BY reference_count DESC LIMIT ?',
  GET_RECENTLY_ACCESSED: 'SELECT * FROM node_stats ORDER BY last_accessed DESC LIMIT ?',
} as const

// Note: Additional database types are in database-types.ts