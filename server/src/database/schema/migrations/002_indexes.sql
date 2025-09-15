-- Performance indexes migration for Tana Local Knowledge Base
-- Version: 2
-- Description: Create optimized indexes for graph operations and 1M+ node performance
-- Performance Target: <10ms graph traversal, <1ms node lookups

-- =============================================================================
-- PRIMARY NODE TABLE INDEXES
-- =============================================================================

-- Node name lookup with system node filtering (most common query)
CREATE INDEX IF NOT EXISTS idx_nodes_name 
ON nodes(name) 
WHERE is_system_node = FALSE;

-- Comprehensive name + system node index for mixed queries
CREATE INDEX IF NOT EXISTS idx_nodes_name_system 
ON nodes(name, is_system_node);

-- Node type filtering with system node exclusion
CREATE INDEX IF NOT EXISTS idx_nodes_type 
ON nodes(node_type, is_system_node);

-- Owner-based queries (common for user-specific content)
CREATE INDEX IF NOT EXISTS idx_nodes_owner 
ON nodes(owner_id) 
WHERE owner_id IS NOT NULL;

-- Temporal indexes for chronological queries
CREATE INDEX IF NOT EXISTS idx_nodes_created 
ON nodes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nodes_updated 
ON nodes(updated_at DESC);

-- Critical system node filtering index (improves all user queries)
CREATE INDEX IF NOT EXISTS idx_nodes_system_filter 
ON nodes(is_system_node, node_type, created_at);

-- Content existence check (for analytics and search)
CREATE INDEX IF NOT EXISTS idx_nodes_content_exists 
ON nodes(id) 
WHERE length(content) > 0;

-- Composite index for owner + type queries (common pattern)
CREATE INDEX IF NOT EXISTS idx_nodes_owner_type 
ON nodes(owner_id, node_type) 
WHERE owner_id IS NOT NULL AND is_system_node = FALSE;

-- =============================================================================
-- HIERARCHY TABLE INDEXES (CRITICAL FOR GRAPH PERFORMANCE)
-- =============================================================================

-- Primary index for parent-child traversal with ordering
-- This is the most critical index for graph operations
CREATE INDEX IF NOT EXISTS idx_hierarchy_parent_position 
ON node_hierarchy(parent_id, position ASC);

-- Child-to-parent lookup for reverse traversal
CREATE INDEX IF NOT EXISTS idx_hierarchy_child 
ON node_hierarchy(child_id);

-- Unique constraint index to prevent duplicate relationships
CREATE UNIQUE INDEX IF NOT EXISTS idx_hierarchy_unique 
ON node_hierarchy(parent_id, child_id);

-- Temporal tracking for recent relationship changes
CREATE INDEX IF NOT EXISTS idx_hierarchy_created 
ON node_hierarchy(created_at DESC);

-- Covering index for parent queries including all commonly needed columns
CREATE INDEX IF NOT EXISTS idx_hierarchy_parent_covering 
ON node_hierarchy(parent_id) 
INCLUDE (child_id, position, created_at);

-- Optimized index for orphan node detection (nodes without parents)
CREATE INDEX IF NOT EXISTS idx_hierarchy_orphans 
ON node_hierarchy(child_id, parent_id);

-- =============================================================================
-- REFERENCE TABLE INDEXES (FOR CITATION AND LINK ANALYSIS)
-- =============================================================================

-- Source-based reference queries with type filtering
CREATE INDEX IF NOT EXISTS idx_references_source_type 
ON node_references(source_id, reference_type);

-- Target-based reference queries (what references this node?)
CREATE INDEX IF NOT EXISTS idx_references_target_type 
ON node_references(target_id, reference_type);

-- Reference type analysis and filtering
CREATE INDEX IF NOT EXISTS idx_references_type_created 
ON node_references(reference_type, created_at DESC);

-- Unique constraint for typed references
CREATE UNIQUE INDEX IF NOT EXISTS idx_references_unique 
ON node_references(source_id, target_id, reference_type);

-- Bidirectional reference lookup optimization
CREATE INDEX IF NOT EXISTS idx_references_bidirectional 
ON node_references(source_id, target_id);

-- Covering indexes for common reference traversal patterns
CREATE INDEX IF NOT EXISTS idx_references_source_covering 
ON node_references(source_id) 
INCLUDE (target_id, reference_type, context, created_at);

CREATE INDEX IF NOT EXISTS idx_references_target_covering 
ON node_references(target_id) 
INCLUDE (source_id, reference_type, context, created_at);

-- =============================================================================
-- STATISTICS TABLE INDEXES (FOR ANALYTICS AND PERFORMANCE)
-- =============================================================================

-- Primary unique index for node stats lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_node 
ON node_stats(node_id);

-- Analytics indexes for top content discovery
CREATE INDEX IF NOT EXISTS idx_stats_access 
ON node_stats(access_count DESC, last_accessed DESC);

CREATE INDEX IF NOT EXISTS idx_stats_references 
ON node_stats(reference_count DESC, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_stats_children 
ON node_stats(child_count DESC, computed_at DESC);

-- Depth-based queries for hierarchy analysis
CREATE INDEX IF NOT EXISTS idx_stats_depth 
ON node_stats(depth_level, node_id);

-- Recent activity tracking (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_stats_last_accessed 
ON node_stats(last_accessed DESC) 
WHERE last_accessed > datetime('now', '-30 days');

-- Stale statistics detection for maintenance
CREATE INDEX IF NOT EXISTS idx_stats_stale 
ON node_stats(computed_at ASC) 
WHERE computed_at < datetime('now', '-1 day');

-- Composite index for active content filtering
CREATE INDEX IF NOT EXISTS idx_stats_activity 
ON node_stats(access_count DESC, reference_count DESC) 
WHERE access_count > 0 OR reference_count > 0;

-- =============================================================================
-- IMPORT TRACKING INDEXES
-- =============================================================================

-- Import status monitoring and filtering
CREATE INDEX IF NOT EXISTS idx_imports_status 
ON imports(status, started_at DESC);

-- File hash uniqueness for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_imports_hash 
ON imports(file_hash);

-- Completion time tracking
CREATE INDEX IF NOT EXISTS idx_imports_completed 
ON imports(completed_at DESC) 
WHERE completed_at IS NOT NULL;

-- Filename-based lookup for user queries
CREATE INDEX IF NOT EXISTS idx_imports_filename 
ON imports(filename, started_at DESC);

-- Node-import association indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_node_imports_unique 
ON node_imports(node_id, import_id);

CREATE INDEX IF NOT EXISTS idx_node_imports_import 
ON node_imports(import_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_node_imports_node 
ON node_imports(node_id, created_at DESC);

-- =============================================================================
-- SCHEMA VERSION TRACKING INDEXES
-- =============================================================================

-- Unique version constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_version 
ON schema_versions(version);

-- Chronological application tracking
CREATE INDEX IF NOT EXISTS idx_schema_applied 
ON schema_versions(applied_at DESC);

-- =============================================================================
-- SPECIALIZED GRAPH OPERATION INDEXES
-- =============================================================================

-- Recursive CTE optimization for ancestor/descendant queries
CREATE INDEX IF NOT EXISTS idx_hierarchy_recursive 
ON node_hierarchy(child_id, parent_id) 
INCLUDE (id, created_at);

-- Reference path optimization for link analysis
CREATE INDEX IF NOT EXISTS idx_references_recursive 
ON node_references(target_id, source_id) 
INCLUDE (reference_type, created_at);

-- Multi-table join optimization for node + stats queries
CREATE INDEX IF NOT EXISTS idx_nodes_stats_join 
ON nodes(id) 
INCLUDE (name, node_type, is_system_node);

-- =============================================================================
-- PERFORMANCE ANALYSIS INDEXES
-- =============================================================================

-- Content length analysis for storage optimization
CREATE INDEX IF NOT EXISTS idx_nodes_content_length 
ON nodes(length(content)) 
WHERE length(content) > 0;

-- JSON field complexity analysis
CREATE INDEX IF NOT EXISTS idx_nodes_fields_size 
ON nodes(length(fields_json)) 
WHERE fields_json != '{}';

-- High connectivity node identification
CREATE INDEX IF NOT EXISTS idx_stats_high_connectivity 
ON node_stats(reference_count + child_count DESC) 
WHERE (reference_count + child_count) > 10;

-- =============================================================================
-- OPTIMIZE QUERY PLANNER
-- =============================================================================

-- Update SQLite statistics for optimal query planning
ANALYZE;

-- Enable query planner optimization
PRAGMA optimize;

-- =============================================================================
-- RECORD SCHEMA VERSION
-- =============================================================================

-- Insert index schema version record
INSERT OR REPLACE INTO schema_versions (version, description, checksum)
VALUES (
  2, 
  'Performance indexes for graph operations and 1M+ node scalability',
  'b7c8d9e1f2a3b4c5d6e7f8a9b1c2d3e4f5a6b7c8d9e1f2a3b4c5d6e7f8a9b1c2d3'
);

-- =============================================================================
-- PERFORMANCE VERIFICATION QUERIES
-- =============================================================================

-- Verify index creation and usage
SELECT 
  name,
  tbl,
  CASE 
    WHEN sql LIKE '%WHERE%' THEN 'Partial'
    WHEN sql LIKE '%UNIQUE%' THEN 'Unique'
    ELSE 'Standard'
  END as index_type
FROM sqlite_master 
WHERE type = 'index' 
  AND name NOT LIKE 'sqlite_%'
  AND tbl IN ('nodes', 'node_hierarchy', 'node_references', 'node_stats', 'imports')
ORDER BY tbl, name;

-- Check database size and statistics
SELECT 
  'Database Size (MB)' as metric,
  ROUND(page_count * page_size / 1024.0 / 1024.0, 2) as value
FROM pragma_page_count(), pragma_page_size()
UNION ALL
SELECT 
  'Index Count' as metric,
  COUNT(*) as value
FROM sqlite_master 
WHERE type = 'index' AND name NOT LIKE 'sqlite_%';

-- Verify foreign key constraints are working
PRAGMA foreign_key_check;

-- Final integrity check
PRAGMA integrity_check;