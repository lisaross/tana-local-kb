/**
 * Performance indexes for Tana knowledge base SQLite schema
 * 
 * This file defines optimized indexes for fast graph operations,
 * search performance, and handling 1M+ nodes efficiently.
 */

// Primary node table indexes for common access patterns
export const NODE_INDEXES = {
  // Basic node lookups and filtering
  name: `CREATE INDEX IF NOT EXISTS idx_nodes_name 
         ON nodes(name) 
         WHERE is_system_node = FALSE`,
  
  name_system: `CREATE INDEX IF NOT EXISTS idx_nodes_name_system 
                ON nodes(name, is_system_node)`,
  
  type: `CREATE INDEX IF NOT EXISTS idx_nodes_type 
         ON nodes(node_type, is_system_node)`,
  
  owner: `CREATE INDEX IF NOT EXISTS idx_nodes_owner 
          ON nodes(owner_id) 
          WHERE owner_id IS NOT NULL`,
  
  // Temporal indexes for chronological queries
  created: `CREATE INDEX IF NOT EXISTS idx_nodes_created 
            ON nodes(created_at DESC)`,
  
  updated: `CREATE INDEX IF NOT EXISTS idx_nodes_updated 
            ON nodes(updated_at DESC)`,
  
  // System node filtering (critical for performance)
  system_filter: `CREATE INDEX IF NOT EXISTS idx_nodes_system_filter 
                   ON nodes(is_system_node, node_type, created_at)`,
  
  // Content-based partial index for non-empty content
  content_exists: `CREATE INDEX IF NOT EXISTS idx_nodes_content_exists 
                   ON nodes(id) 
                   WHERE length(content) > 0`,
  
  // Composite index for owner + type queries
  owner_type: `CREATE INDEX IF NOT EXISTS idx_nodes_owner_type 
               ON nodes(owner_id, node_type) 
               WHERE owner_id IS NOT NULL AND is_system_node = FALSE`,
} as const

// Hierarchy table indexes for fast graph traversal
export const HIERARCHY_INDEXES = {
  // Primary traversal indexes
  parent_position: `CREATE INDEX IF NOT EXISTS idx_hierarchy_parent_position 
                    ON node_hierarchy(parent_id, position ASC)`,
  
  child_lookup: `CREATE INDEX IF NOT EXISTS idx_hierarchy_child 
                 ON node_hierarchy(child_id)`,
  
  // Composite unique constraint for relationship integrity
  unique_relationship: `CREATE UNIQUE INDEX IF NOT EXISTS idx_hierarchy_unique 
                        ON node_hierarchy(parent_id, child_id)`,
  
  // Temporal index for recent relationships
  created: `CREATE INDEX IF NOT EXISTS idx_hierarchy_created 
            ON node_hierarchy(created_at DESC)`,
  
  // Covering index for parent-child queries with position
  parent_covering: `CREATE INDEX IF NOT EXISTS idx_hierarchy_parent_covering 
                    ON node_hierarchy(parent_id) 
                    INCLUDE (child_id, position, created_at)`,
  
  // Index for finding root nodes (nodes with no parents)
  orphan_detection: `CREATE INDEX IF NOT EXISTS idx_hierarchy_orphans 
                     ON node_hierarchy(child_id, parent_id)`,
} as const

// Reference table indexes for citation and link analysis
export const REFERENCE_INDEXES = {
  // Source-based lookups (what does this node reference?)
  source_type: `CREATE INDEX IF NOT EXISTS idx_references_source_type 
                ON node_references(source_id, reference_type)`,
  
  // Target-based lookups (what references this node?)
  target_type: `CREATE INDEX IF NOT EXISTS idx_references_target_type 
                ON node_references(target_id, reference_type)`,
  
  // Reference type analysis
  type_created: `CREATE INDEX IF NOT EXISTS idx_references_type_created 
                 ON node_references(reference_type, created_at DESC)`,
  
  // Unique constraint for typed references
  unique_typed_reference: `CREATE UNIQUE INDEX IF NOT EXISTS idx_references_unique 
                           ON node_references(source_id, target_id, reference_type)`,
  
  // Bidirectional reference lookup
  bidirectional: `CREATE INDEX IF NOT EXISTS idx_references_bidirectional 
                  ON node_references(source_id, target_id)`,
  
  // Covering index for common reference queries
  source_covering: `CREATE INDEX IF NOT EXISTS idx_references_source_covering 
                    ON node_references(source_id) 
                    INCLUDE (target_id, reference_type, context, created_at)`,
  
  target_covering: `CREATE INDEX IF NOT EXISTS idx_references_target_covering 
                    ON node_references(target_id) 
                    INCLUDE (source_id, reference_type, context, created_at)`,
} as const

// Statistics table indexes for analytics and performance monitoring
export const STATS_INDEXES = {
  // Primary node stats lookup
  node_unique: `CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_node 
                ON node_stats(node_id)`,
  
  // Analytics indexes for top content discovery
  access_count: `CREATE INDEX IF NOT EXISTS idx_stats_access 
                 ON node_stats(access_count DESC, last_accessed DESC)`,
  
  reference_count: `CREATE INDEX IF NOT EXISTS idx_stats_references 
                    ON node_stats(reference_count DESC, computed_at DESC)`,
  
  child_count: `CREATE INDEX IF NOT EXISTS idx_stats_children 
                ON node_stats(child_count DESC, computed_at DESC)`,
  
  // Depth-based queries for hierarchy analysis
  depth_level: `CREATE INDEX IF NOT EXISTS idx_stats_depth 
                ON node_stats(depth_level, node_id)`,
  
  // Recent activity tracking
  last_accessed: `CREATE INDEX IF NOT EXISTS idx_stats_last_accessed 
                  ON node_stats(last_accessed DESC) 
                  WHERE last_accessed > datetime('now', '-30 days')`,
  
  // Stale stats detection for maintenance
  stale_stats: `CREATE INDEX IF NOT EXISTS idx_stats_stale 
                ON node_stats(computed_at ASC) 
                WHERE computed_at < datetime('now', '-1 day')`,
  
  // Composite index for filtered analytics
  activity_composite: `CREATE INDEX IF NOT EXISTS idx_stats_activity 
                       ON node_stats(access_count DESC, reference_count DESC) 
                       WHERE access_count > 0 OR reference_count > 0`,
} as const

// Import tracking indexes for data lineage and management
export const IMPORT_INDEXES = {
  // Import status monitoring
  status_started: `CREATE INDEX IF NOT EXISTS idx_imports_status 
                   ON imports(status, started_at DESC)`,
  
  // File hash uniqueness and deduplication
  file_hash_unique: `CREATE UNIQUE INDEX IF NOT EXISTS idx_imports_hash 
                     ON imports(file_hash)`,
  
  // Completion tracking
  completed: `CREATE INDEX IF NOT EXISTS idx_imports_completed 
              ON imports(completed_at DESC) 
              WHERE completed_at IS NOT NULL`,
  
  // Filename lookup for user queries
  filename: `CREATE INDEX IF NOT EXISTS idx_imports_filename 
             ON imports(filename, started_at DESC)`,
  
  // Node-import association indexes
  node_import_unique: `CREATE UNIQUE INDEX IF NOT EXISTS idx_node_imports_unique 
                       ON node_imports(node_id, import_id)`,
  
  import_nodes: `CREATE INDEX IF NOT EXISTS idx_node_imports_import 
                 ON node_imports(import_id, created_at DESC)`,
  
  node_imports: `CREATE INDEX IF NOT EXISTS idx_node_imports_node 
                 ON node_imports(node_id, created_at DESC)`,
} as const

// Schema version tracking indexes
export const VERSION_INDEXES = {
  version_unique: `CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_version 
                   ON schema_versions(version)`,
  
  applied_chronological: `CREATE INDEX IF NOT EXISTS idx_schema_applied 
                          ON schema_versions(applied_at DESC)`,
} as const

// Specialized indexes for complex graph operations
export const GRAPH_INDEXES = {
  // Path finding optimization - covers common CTE queries
  hierarchy_recursive: `CREATE INDEX IF NOT EXISTS idx_hierarchy_recursive 
                        ON node_hierarchy(child_id, parent_id) 
                        INCLUDE (id, created_at)`,
  
  // Reference path optimization
  reference_recursive: `CREATE INDEX IF NOT EXISTS idx_references_recursive 
                        ON node_references(target_id, source_id) 
                        INCLUDE (reference_type, created_at)`,
  
  // Multi-table join optimization for node + stats
  node_stats_join: `CREATE INDEX IF NOT EXISTS idx_nodes_stats_join 
                    ON nodes(id) 
                    INCLUDE (name, node_type, is_system_node)`,
  
  // Orphan node detection (nodes without parents or children)
  orphan_nodes: `CREATE INDEX IF NOT EXISTS idx_nodes_orphan_detection 
                 ON nodes(id) 
                 WHERE id NOT IN (
                   SELECT DISTINCT parent_id FROM node_hierarchy 
                   UNION 
                   SELECT DISTINCT child_id FROM node_hierarchy
                 )`,
} as const

// Performance analysis indexes for query optimization
export const ANALYSIS_INDEXES = {
  // Content length analysis
  content_length: `CREATE INDEX IF NOT EXISTS idx_nodes_content_length 
                   ON nodes(length(content)) 
                   WHERE length(content) > 0`,
  
  // Field complexity analysis
  fields_complexity: `CREATE INDEX IF NOT EXISTS idx_nodes_fields_size 
                      ON nodes(length(fields_json)) 
                      WHERE fields_json != '{}'`,
  
  // Relationship density analysis
  high_connectivity: `CREATE INDEX IF NOT EXISTS idx_stats_high_connectivity 
                      ON node_stats(reference_count + child_count DESC) 
                      WHERE (reference_count + child_count) > 10`,
} as const

// Combine all index categories
const ALL_INDEXES = {
  ...NODE_INDEXES,
  ...HIERARCHY_INDEXES,
  ...REFERENCE_INDEXES,
  ...STATS_INDEXES,
  ...IMPORT_INDEXES,
  ...VERSION_INDEXES,
  ...GRAPH_INDEXES,
  ...ANALYSIS_INDEXES,
} as const

// Index creation order for dependency management
const INDEX_CREATION_ORDER = [
  // Basic table indexes first
  ...Object.values(NODE_INDEXES),
  ...Object.values(HIERARCHY_INDEXES),
  ...Object.values(REFERENCE_INDEXES),
  ...Object.values(STATS_INDEXES),
  ...Object.values(IMPORT_INDEXES),
  ...Object.values(VERSION_INDEXES),
  
  // Complex and specialized indexes last
  ...Object.values(GRAPH_INDEXES),
  ...Object.values(ANALYSIS_INDEXES),
]

// Index maintenance queries for performance monitoring
export const INDEX_MAINTENANCE = {
  // Analyze all indexes for optimal query planning
  analyzeAll: 'ANALYZE;',
  
  // Reindex specific tables after bulk operations
  reindexNodes: 'REINDEX nodes;',
  reindexHierarchy: 'REINDEX node_hierarchy;',
  reindexReferences: 'REINDEX node_references;',
  reindexStats: 'REINDEX node_stats;',
  reindexFTS: 'REINDEX node_search;',
  
  // Check index usage statistics
  indexUsage: `
    SELECT name, tbl, sql 
    FROM sqlite_master 
    WHERE type = 'index' 
    AND name NOT LIKE 'sqlite_%'
    ORDER BY tbl, name;
  `,
  
  // Find unused indexes (requires query plan analysis)
  unusedIndexes: `
    SELECT name 
    FROM sqlite_master 
    WHERE type = 'index' 
    AND name NOT LIKE 'sqlite_%'
    AND name NOT IN (
      -- This would need to be populated with actually used indexes
      -- from query plan analysis
      SELECT 'placeholder'
    );
  `,
} as const

// Performance recommendations based on index coverage
export const PERFORMANCE_RECOMMENDATIONS = {
  // Queries that should use specific indexes
  expectedIndexUsage: {
    'SELECT * FROM nodes WHERE name = ?': 'idx_nodes_name',
    'SELECT * FROM nodes WHERE node_type = ? AND is_system_node = FALSE': 'idx_nodes_type',
    'SELECT * FROM node_hierarchy WHERE parent_id = ? ORDER BY position': 'idx_hierarchy_parent_position',
    'SELECT * FROM node_references WHERE source_id = ?': 'idx_references_source_covering',
    'SELECT * FROM node_stats WHERE node_id = ?': 'idx_stats_node',
  },
  
  // Index maintenance schedule
  maintenanceSchedule: {
    daily: ['ANALYZE;'],
    weekly: ['REINDEX node_search;'],
    monthly: ['PRAGMA optimize;', 'VACUUM;'],
  },
} as const

// Export consolidated index management
export function createAllIndexes(): string[] {
  return INDEX_CREATION_ORDER
}

export function getIndexMaintenanceQueries(): string[] {
  return Object.values(INDEX_MAINTENANCE).filter(query => 
    typeof query === 'string' && query.trim().length > 0
  )
}

// Export index categories and combined structures
export { ALL_INDEXES, INDEX_CREATION_ORDER }