/**
 * Graph traversal operations for Tana knowledge base
 * 
 * This module provides sophisticated graph traversal algorithms optimized for
 * large knowledge graphs, including pathfinding, clustering, and analysis.
 */

import type { 
  DatabaseConnection,
  NodeRecord,
  NodePath,
  PathFindingOptions,
  ClusterAnalysis,
  FilterOptions
} from '../types/index.js'
import { DatabaseError } from '../types/database-types.js'
import { QUERY_PATTERNS, DB_CONSTRAINTS } from '../types/schema.js'

/**
 * Traversal direction options
 */
export type TraversalDirection = 'down' | 'up' | 'both'

/**
 * Advanced traversal options
 */
export interface TraversalOptions {
  maxDepth?: number
  direction?: TraversalDirection
  includeReferences?: boolean
  includeSystemNodes?: boolean
  nodeFilter?: (node: NodeRecord) => boolean
  edgeFilter?: (parent: NodeRecord, child: NodeRecord) => boolean
  visitLimit?: number
  breadthFirst?: boolean
}

/**
 * Traversal result with path information
 */
export interface TraversalResult {
  nodes: Array<NodeRecord & { depth: number; path: string[] }>
  totalVisited: number
  maxDepthReached: number
  truncated: boolean
}

/**
 * Path analysis result
 */
export interface PathAnalysis {
  shortestPath: NodePath | null
  alternativePaths: NodePath[]
  commonAncestors: string[]
  pathStrengths: Record<string, number>
}

/**
 * Graph metrics for analysis
 */
export interface GraphAnalysisResult {
  nodeCount: number
  edgeCount: number
  diameter: number
  avgPathLength: number
  clustering: ClusterAnalysis[]
  centralityScores: Record<string, number>
  communities: Array<{ nodes: string[]; strength: number }>
}

/**
 * Default traversal options
 */
const DEFAULT_TRAVERSAL_OPTIONS: Required<TraversalOptions> = {
  maxDepth: 10,
  direction: 'down',
  includeReferences: false,
  includeSystemNodes: false,
  nodeFilter: () => true,
  edgeFilter: () => true,
  visitLimit: 1000,
  breadthFirst: true,
}

/**
 * Graph traversal operations class
 */
export class GraphTraversal {
  constructor(private db: DatabaseConnection) {}

  /**
   * Breadth-first traversal from a starting node
   */
  async breadthFirstTraversal(
    startNodeId: string,
    options?: Partial<TraversalOptions>
  ): Promise<TraversalResult> {
    const config = { ...DEFAULT_TRAVERSAL_OPTIONS, ...options, breadthFirst: true }
    return this.performTraversal(startNodeId, config)
  }

  /**
   * Depth-first traversal from a starting node
   */
  async depthFirstTraversal(
    startNodeId: string,
    options?: Partial<TraversalOptions>
  ): Promise<TraversalResult> {
    const config = { ...DEFAULT_TRAVERSAL_OPTIONS, ...options, breadthFirst: false }
    return this.performTraversal(startNodeId, config)
  }

  /**
   * Get all descendants of a node with depth information
   */
  async getDescendants(
    nodeId: string,
    maxDepth: number = 10,
    includeSystemNodes: boolean = false
  ): Promise<Array<NodeRecord & { depth: number }>> {
    if (!nodeId) {
      throw new DatabaseError('Node ID is required')
    }

    const systemFilter = includeSystemNodes ? '' : 'AND n.is_system_node = 0'

    const descendants = this.db.query<NodeRecord & { depth: number }>(`
      WITH RECURSIVE descendants(id, child_id, depth) AS (
        SELECT parent_id, child_id, 0 FROM node_hierarchy WHERE parent_id = ?
        UNION ALL
        SELECT h.parent_id, h.child_id, depth + 1 
        FROM node_hierarchy h
        JOIN descendants d ON h.parent_id = d.child_id
        WHERE depth < ?
      )
      SELECT n.*, d.depth FROM nodes n 
      JOIN descendants d ON n.id = d.child_id
      ${systemFilter}
      ORDER BY d.depth ASC, n.name ASC
    `, [nodeId, maxDepth])

    return descendants
  }

  /**
   * Get all ancestors of a node with depth information
   */
  async getAncestors(
    nodeId: string,
    maxDepth: number = 10
  ): Promise<Array<NodeRecord & { depth: number }>> {
    if (!nodeId) {
      throw new DatabaseError('Node ID is required')
    }

    const ancestors = this.db.query<NodeRecord & { depth: number }>(`
      WITH RECURSIVE ancestors(id, parent_id, depth) AS (
        SELECT child_id, parent_id, 0 FROM node_hierarchy WHERE child_id = ?
        UNION ALL
        SELECT h.child_id, h.parent_id, depth + 1 
        FROM node_hierarchy h
        JOIN ancestors a ON h.child_id = a.parent_id
        WHERE depth < ?
      )
      SELECT n.*, a.depth FROM nodes n 
      JOIN ancestors a ON n.id = a.parent_id
      ORDER BY a.depth DESC
    `, [nodeId, maxDepth])

    return ancestors
  }

  /**
   * Find shortest path between two nodes
   */
  async findShortestPath(
    sourceId: string,
    targetId: string,
    options?: PathFindingOptions
  ): Promise<NodePath | null> {
    if (!sourceId || !targetId) {
      throw new DatabaseError('Both source and target IDs are required')
    }

    if (sourceId === targetId) {
      return {
        source: sourceId,
        target: targetId,
        path: [sourceId],
        distance: 0,
        pathType: 'hierarchy',
      }
    }

    const config = {
      maxDepth: options?.maxDepth ?? 10,
      includeReferences: options?.includeReferences ?? false,
      excludeNodeTypes: options?.excludeNodeTypes ?? [],
    }

    // Try hierarchy-only path first
    const hierarchyPath = await this.findHierarchyPath(sourceId, targetId, config.maxDepth)
    
    if (hierarchyPath) {
      return hierarchyPath
    }

    // If no hierarchy path and references are enabled, try reference path
    if (config.includeReferences) {
      return this.findReferencePath(sourceId, targetId, config.maxDepth)
    }

    return null
  }

  /**
   * Find all paths between two nodes
   */
  async findAllPaths(
    sourceId: string,
    targetId: string,
    maxPaths: number = 5,
    maxDepth: number = 6
  ): Promise<NodePath[]> {
    if (!sourceId || !targetId) {
      throw new DatabaseError('Both source and target IDs are required')
    }

    const paths: NodePath[] = []

    // Use a modified BFS to find multiple paths
    const queue: Array<{ currentId: string; path: string[]; depth: number }> = [
      { currentId: sourceId, path: [sourceId], depth: 0 }
    ]
    const visited = new Set<string>()

    while (queue.length > 0 && paths.length < maxPaths) {
      const { currentId, path, depth } = queue.shift()!

      if (depth >= maxDepth) continue

      // Get all connected nodes (children and references)
      const connections = await this.getConnectedNodes(currentId, true)

      for (const connected of connections) {
        if (path.includes(connected.id)) continue // Avoid cycles

        const newPath = [...path, connected.id]

        if (connected.id === targetId) {
          paths.push({
            source: sourceId,
            target: targetId,
            path: newPath,
            distance: newPath.length - 1,
            pathType: 'mixed',
          })
        } else if (!visited.has(connected.id)) {
          queue.push({
            currentId: connected.id,
            path: newPath,
            depth: depth + 1,
          })
          visited.add(connected.id)
        }
      }
    }

    return paths.sort((a, b) => a.distance - b.distance)
  }

  /**
   * Analyze paths between two nodes
   */
  async analyzePaths(sourceId: string, targetId: string): Promise<PathAnalysis> {
    const shortestPath = await this.findShortestPath(sourceId, targetId, { includeReferences: true })
    const allPaths = await this.findAllPaths(sourceId, targetId, 10, 8)
    
    // Find common ancestors
    const sourceAncestors = await this.getAncestors(sourceId)
    const targetAncestors = await this.getAncestors(targetId)
    
    const commonAncestors = sourceAncestors
      .filter(sa => targetAncestors.some(ta => ta.id === sa.id))
      .map(a => a.id)

    // Calculate path strengths (based on reference types and hierarchy depth)
    const pathStrengths: Record<string, number> = {}
    for (const path of allPaths) {
      pathStrengths[path.path.join('->')] = this.calculatePathStrength(path)
    }

    return {
      shortestPath,
      alternativePaths: allPaths.slice(1), // Exclude shortest path
      commonAncestors,
      pathStrengths,
    }
  }

  /**
   * Find nodes within a specific distance from a starting node
   */
  async findNodesWithinDistance(
    startNodeId: string,
    maxDistance: number,
    includeReferences: boolean = false
  ): Promise<Array<NodeRecord & { distance: number; pathType: 'hierarchy' | 'reference' }>> {
    if (!startNodeId) {
      throw new DatabaseError('Start node ID is required')
    }

    const results: Array<NodeRecord & { distance: number; pathType: 'hierarchy' | 'reference' }> = []
    const visited = new Set<string>([startNodeId])
    const queue: Array<{ nodeId: string; distance: number; pathType: 'hierarchy' | 'reference' }> = [
      { nodeId: startNodeId, distance: 0, pathType: 'hierarchy' }
    ]

    while (queue.length > 0) {
      const { nodeId, distance, pathType } = queue.shift()!

      if (distance >= maxDistance) continue

      // Get hierarchy connections
      const children = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_CHILDREN, [nodeId])
      for (const child of children) {
        if (!visited.has(child.id)) {
          visited.add(child.id)
          results.push({ ...child, distance: distance + 1, pathType: 'hierarchy' })
          queue.push({ nodeId: child.id, distance: distance + 1, pathType: 'hierarchy' })
        }
      }

      // Get reference connections if enabled
      if (includeReferences) {
        const referenced = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_REFERENCES_FROM, [nodeId])
        for (const ref of referenced) {
          if (!visited.has(ref.id)) {
            visited.add(ref.id)
            results.push({ ...ref, distance: distance + 1, pathType: 'reference' })
            queue.push({ nodeId: ref.id, distance: distance + 1, pathType: 'reference' })
          }
        }
      }
    }

    return results.sort((a, b) => a.distance - b.distance)
  }

  /**
   * Detect communities/clusters in the graph
   */
  async detectCommunities(
    minClusterSize: number = 3,
    maxClusters: number = 10
  ): Promise<Array<{ nodes: string[]; strength: number; centralNode?: string }>> {
    // Get all nodes with their connections
    const nodes = this.db.query<NodeRecord>('SELECT * FROM nodes WHERE is_system_node = 0')
    const nodeConnections = new Map<string, Set<string>>()

    // Build adjacency information
    for (const node of nodes) {
      nodeConnections.set(node.id, new Set())
    }

    // Add hierarchy connections
    const hierarchyEdges = this.db.query<{ parent_id: string; child_id: string }>(`
      SELECT parent_id, child_id FROM node_hierarchy
    `)
    for (const edge of hierarchyEdges) {
      nodeConnections.get(edge.parent_id)?.add(edge.child_id)
      nodeConnections.get(edge.child_id)?.add(edge.parent_id)
    }

    // Add reference connections
    const referenceEdges = this.db.query<{ source_id: string; target_id: string }>(`
      SELECT source_id, target_id FROM node_references
    `)
    for (const edge of referenceEdges) {
      nodeConnections.get(edge.source_id)?.add(edge.target_id)
      nodeConnections.get(edge.target_id)?.add(edge.source_id)
    }

    // Simple community detection using connected components
    const visited = new Set<string>()
    const communities: Array<{ nodes: string[]; strength: number; centralNode?: string }> = []

    for (const node of nodes) {
      if (visited.has(node.id)) continue

      const community = this.expandCommunity(node.id, nodeConnections, visited)
      
      if (community.length >= minClusterSize) {
        const strength = this.calculateCommunityStrength(community, nodeConnections)
        const centralNode = this.findCentralNode(community, nodeConnections)
        
        communities.push({
          nodes: community,
          strength,
          centralNode,
        })
      }

      if (communities.length >= maxClusters) break
    }

    return communities.sort((a, b) => b.strength - a.strength)
  }

  /**
   * Calculate centrality scores for nodes
   */
  async calculateCentralityScores(
    algorithm: 'degree' | 'betweenness' | 'closeness' = 'degree'
  ): Promise<Record<string, number>> {
    switch (algorithm) {
      case 'degree':
        return this.calculateDegreeCentrality()
      case 'betweenness':
        return this.calculateBetweennessCentrality()
      case 'closeness':
        return this.calculateClosenessCentrality()
      default:
        throw new DatabaseError(`Unknown centrality algorithm: ${algorithm}`)
    }
  }

  /**
   * Get graph diameter (longest shortest path)
   */
  async getGraphDiameter(sampleSize: number = 100): Promise<number> {
    // Sample nodes for performance on large graphs
    const nodes = this.db.query<{ id: string }>(`
      SELECT id FROM nodes 
      WHERE is_system_node = 0 
      ORDER BY RANDOM() 
      LIMIT ?
    `, [sampleSize])

    let maxDistance = 0

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const path = await this.findShortestPath(nodes[i].id, nodes[j].id)
        if (path) {
          maxDistance = Math.max(maxDistance, path.distance)
        }
      }
    }

    return maxDistance
  }

  /**
   * Core traversal implementation
   */
  private async performTraversal(
    startNodeId: string,
    options: Required<TraversalOptions>
  ): Promise<TraversalResult> {
    if (!startNodeId) {
      throw new DatabaseError('Start node ID is required')
    }

    const visited = new Set<string>()
    const results: Array<NodeRecord & { depth: number; path: string[] }> = []
    let maxDepthReached = 0
    let truncated = false

    // Initialize queue/stack based on traversal type
    const queue: Array<{ nodeId: string; depth: number; path: string[] }> = [
      { nodeId: startNodeId, depth: 0, path: [startNodeId] }
    ]

    while (queue.length > 0 && results.length < options.visitLimit) {
      const { nodeId, depth, path } = options.breadthFirst ? queue.shift()! : queue.pop()!

      if (depth > options.maxDepth || visited.has(nodeId)) {
        continue
      }

      visited.add(nodeId)
      maxDepthReached = Math.max(maxDepthReached, depth)

      // Get the node data
      const [node] = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_NODE_BY_ID, [nodeId])
      if (!node) continue

      // Apply node filter
      if (!options.nodeFilter(node)) continue

      // Skip system nodes if not included
      if (!options.includeSystemNodes && node.is_system_node) continue

      results.push({ ...node, depth, path })

      // Get connected nodes based on direction
      const connections = await this.getConnectedNodes(
        nodeId,
        options.includeReferences,
        options.direction
      )

      for (const connected of connections) {
        if (!visited.has(connected.id) && !path.includes(connected.id)) {
          // Apply edge filter
          if (options.edgeFilter(node, connected)) {
            queue.push({
              nodeId: connected.id,
              depth: depth + 1,
              path: [...path, connected.id],
            })
          }
        }
      }
    }

    if (queue.length > 0) {
      truncated = true
    }

    return {
      nodes: results,
      totalVisited: visited.size,
      maxDepthReached,
      truncated,
    }
  }

  /**
   * Get connected nodes based on direction and reference inclusion
   */
  private async getConnectedNodes(
    nodeId: string,
    includeReferences: boolean,
    direction: TraversalDirection = 'down'
  ): Promise<NodeRecord[]> {
    const connections: NodeRecord[] = []

    // Get hierarchy connections
    if (direction === 'down' || direction === 'both') {
      const children = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_CHILDREN, [nodeId])
      connections.push(...children)
    }

    if (direction === 'up' || direction === 'both') {
      const parents = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_PARENTS, [nodeId])
      connections.push(...parents)
    }

    // Get reference connections
    if (includeReferences) {
      const referenced = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_REFERENCES_FROM, [nodeId])
      const referencedBy = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_REFERENCES_TO, [nodeId])
      connections.push(...referenced, ...referencedBy)
    }

    // Remove duplicates
    const seen = new Set<string>()
    return connections.filter(node => {
      if (seen.has(node.id)) return false
      seen.add(node.id)
      return true
    })
  }

  /**
   * Find hierarchy-based path between nodes
   */
  private async findHierarchyPath(
    sourceId: string,
    targetId: string,
    maxDepth: number
  ): Promise<NodePath | null> {
    // Check if target is descendant of source
    const descendants = await this.getDescendants(sourceId, maxDepth)
    const descendant = descendants.find(d => d.id === targetId)
    
    if (descendant) {
      // Build path by tracing back through hierarchy
      const path = await this.buildHierarchyPath(sourceId, targetId)
      if (path) {
        return {
          source: sourceId,
          target: targetId,
          path,
          distance: path.length - 1,
          pathType: 'hierarchy',
        }
      }
    }

    // Check if source is descendant of target
    const ancestors = await this.getAncestors(sourceId, maxDepth)
    const ancestor = ancestors.find(a => a.id === targetId)
    
    if (ancestor) {
      const path = await this.buildHierarchyPath(targetId, sourceId)
      if (path) {
        return {
          source: sourceId,
          target: targetId,
          path: path.reverse(),
          distance: path.length - 1,
          pathType: 'hierarchy',
        }
      }
    }

    return null
  }

  /**
   * Find reference-based path between nodes
   */
  private async findReferencePath(
    sourceId: string,
    targetId: string,
    maxDepth: number
  ): Promise<NodePath | null> {
    // Simple BFS through references
    const queue = [{ nodeId: sourceId, path: [sourceId], depth: 0 }]
    const visited = new Set([sourceId])

    while (queue.length > 0) {
      const { nodeId, path, depth } = queue.shift()!

      if (depth >= maxDepth) continue

      const referenced = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_REFERENCES_FROM, [nodeId])
      
      for (const ref of referenced) {
        if (ref.id === targetId) {
          return {
            source: sourceId,
            target: targetId,
            path: [...path, ref.id],
            distance: path.length,
            pathType: 'reference',
          }
        }

        if (!visited.has(ref.id)) {
          visited.add(ref.id)
          queue.push({
            nodeId: ref.id,
            path: [...path, ref.id],
            depth: depth + 1,
          })
        }
      }
    }

    return null
  }

  /**
   * Build hierarchy path between nodes
   */
  private async buildHierarchyPath(sourceId: string, targetId: string): Promise<string[] | null> {
    const path = this.db.query<{ path: string }>(`
      WITH RECURSIVE path_finder(node_id, path) AS (
        SELECT ?, ?
        UNION ALL
        SELECT h.child_id, path || ',' || h.child_id
        FROM node_hierarchy h
        JOIN path_finder p ON h.parent_id = p.node_id
        WHERE h.child_id = ?
      )
      SELECT path FROM path_finder WHERE node_id = ?
    `, [sourceId, sourceId, targetId, targetId])

    if (path.length > 0) {
      return path[0].path.split(',')
    }

    return null
  }

  /**
   * Calculate path strength based on connection types
   */
  private calculatePathStrength(path: NodePath): number {
    let strength = 1.0

    // Shorter paths are stronger
    strength *= Math.max(0.1, 1.0 / path.distance)

    // Hierarchy paths are stronger than reference paths
    if (path.pathType === 'hierarchy') {
      strength *= 1.5
    } else if (path.pathType === 'reference') {
      strength *= 1.0
    } else {
      strength *= 0.8 // Mixed paths are weaker
    }

    return strength
  }

  /**
   * Expand community using connected components
   */
  private expandCommunity(
    startNodeId: string,
    connections: Map<string, Set<string>>,
    visited: Set<string>
  ): string[] {
    const community: string[] = []
    const queue = [startNodeId]
    visited.add(startNodeId)

    while (queue.length > 0) {
      const nodeId = queue.shift()!
      community.push(nodeId)

      const nodeConnections = connections.get(nodeId) || new Set()
      for (const connectedId of nodeConnections) {
        if (!visited.has(connectedId)) {
          visited.add(connectedId)
          queue.push(connectedId)
        }
      }
    }

    return community
  }

  /**
   * Calculate community strength based on internal connections
   */
  private calculateCommunityStrength(
    community: string[],
    connections: Map<string, Set<string>>
  ): number {
    let internalConnections = 0
    let totalPossibleConnections = community.length * (community.length - 1) / 2

    for (let i = 0; i < community.length; i++) {
      const nodeConnections = connections.get(community[i]) || new Set()
      for (let j = i + 1; j < community.length; j++) {
        if (nodeConnections.has(community[j])) {
          internalConnections++
        }
      }
    }

    return totalPossibleConnections > 0 ? internalConnections / totalPossibleConnections : 0
  }

  /**
   * Find central node in a community
   */
  private findCentralNode(
    community: string[],
    connections: Map<string, Set<string>>
  ): string | undefined {
    let maxConnections = 0
    let centralNode: string | undefined

    for (const nodeId of community) {
      const nodeConnections = connections.get(nodeId) || new Set()
      const communityConnections = community.filter(id => nodeConnections.has(id)).length
      
      if (communityConnections > maxConnections) {
        maxConnections = communityConnections
        centralNode = nodeId
      }
    }

    return centralNode
  }

  /**
   * Calculate degree centrality for all nodes
   */
  private async calculateDegreeCentrality(): Promise<Record<string, number>> {
    const results = this.db.query<{ node_id: string; degree: number }>(`
      SELECT 
        n.id as node_id,
        (COALESCE(h_out.count, 0) + COALESCE(h_in.count, 0) + 
         COALESCE(r_out.count, 0) + COALESCE(r_in.count, 0)) as degree
      FROM nodes n
      LEFT JOIN (
        SELECT parent_id, COUNT(*) as count 
        FROM node_hierarchy 
        GROUP BY parent_id
      ) h_out ON n.id = h_out.parent_id
      LEFT JOIN (
        SELECT child_id, COUNT(*) as count 
        FROM node_hierarchy 
        GROUP BY child_id
      ) h_in ON n.id = h_in.child_id
      LEFT JOIN (
        SELECT source_id, COUNT(*) as count 
        FROM node_references 
        GROUP BY source_id
      ) r_out ON n.id = r_out.source_id
      LEFT JOIN (
        SELECT target_id, COUNT(*) as count 
        FROM node_references 
        GROUP BY target_id
      ) r_in ON n.id = r_in.target_id
      WHERE n.is_system_node = 0
    `)

    return Object.fromEntries(results.map(r => [r.node_id, r.degree]))
  }

  /**
   * Calculate betweenness centrality (simplified version)
   */
  private async calculateBetweennessCentrality(): Promise<Record<string, number>> {
    // This is a simplified version - full betweenness centrality is computationally expensive
    const nodes = this.db.query<{ id: string }>('SELECT id FROM nodes WHERE is_system_node = 0 LIMIT 50')
    const centrality: Record<string, number> = {}

    // Initialize all nodes with 0
    for (const node of nodes) {
      centrality[node.id] = 0
    }

    // For performance, only sample paths between random node pairs
    for (let i = 0; i < Math.min(nodes.length, 20); i++) {
      for (let j = i + 1; j < Math.min(nodes.length, 20); j++) {
        const path = await this.findShortestPath(nodes[i].id, nodes[j].id)
        if (path) {
          // Increment betweenness for intermediate nodes
          for (let k = 1; k < path.path.length - 1; k++) {
            centrality[path.path[k]]++
          }
        }
      }
    }

    return centrality
  }

  /**
   * Calculate closeness centrality
   */
  private async calculateClosenessCentrality(): Promise<Record<string, number>> {
    const nodes = this.db.query<{ id: string }>('SELECT id FROM nodes WHERE is_system_node = 0 LIMIT 50')
    const centrality: Record<string, number> = {}

    for (const node of nodes) {
      let totalDistance = 0
      let reachableNodes = 0

      for (const other of nodes) {
        if (node.id !== other.id) {
          const path = await this.findShortestPath(node.id, other.id)
          if (path) {
            totalDistance += path.distance
            reachableNodes++
          }
        }
      }

      centrality[node.id] = reachableNodes > 0 ? reachableNodes / totalDistance : 0
    }

    return centrality
  }
}

/**
 * Create graph traversal operations instance
 */
export function createGraphTraversal(db: DatabaseConnection): GraphTraversal {
  return new GraphTraversal(db)
}

/**
 * Utility functions for graph analysis
 */
export const graphUtils = {
  /**
   * Calculate graph density
   */
  calculateDensity(nodeCount: number, edgeCount: number): number {
    if (nodeCount <= 1) return 0
    const maxPossibleEdges = nodeCount * (nodeCount - 1) / 2
    return edgeCount / maxPossibleEdges
  },

  /**
   * Detect if graph is connected
   */
  isConnected(traversalResult: TraversalResult, totalNodes: number): boolean {
    return traversalResult.nodes.length === totalNodes
  },

  /**
   * Calculate average clustering coefficient
   */
  calculateAverageClusteringCoefficient(communities: Array<{ nodes: string[]; strength: number }>): number {
    if (communities.length === 0) return 0
    const totalStrength = communities.reduce((sum, c) => sum + c.strength, 0)
    return totalStrength / communities.length
  },

  /**
   * Find articulation points (nodes whose removal disconnects the graph)
   */
  findArticulationPoints(
    nodes: NodeRecord[],
    edges: Array<{ source: string; target: string }>
  ): string[] {
    // Simplified implementation - would need more sophisticated algorithm for large graphs
    const articulation: string[] = []
    const adjacency = new Map<string, Set<string>>()

    // Build adjacency list
    for (const node of nodes) {
      adjacency.set(node.id, new Set())
    }
    for (const edge of edges) {
      adjacency.get(edge.source)?.add(edge.target)
      adjacency.get(edge.target)?.add(edge.source)
    }

    // Check each node by temporarily removing it
    for (const node of nodes) {
      const originalConnections = adjacency.get(node.id)!
      
      // Temporarily remove node
      adjacency.delete(node.id)
      for (const [nodeId, connections] of adjacency) {
        connections.delete(node.id)
      }

      // Count connected components
      const visited = new Set<string>()
      let components = 0
      
      for (const [nodeId] of adjacency) {
        if (!visited.has(nodeId)) {
          components++
          // DFS to mark connected component
          const stack = [nodeId]
          while (stack.length > 0) {
            const current = stack.pop()!
            if (visited.has(current)) continue
            visited.add(current)
            const connections = adjacency.get(current) || new Set()
            for (const connected of connections) {
              if (!visited.has(connected)) {
                stack.push(connected)
              }
            }
          }
        }
      }

      // Restore node
      adjacency.set(node.id, originalConnections)
      for (const connected of originalConnections) {
        adjacency.get(connected)?.add(node.id)
      }

      // If removing this node increased components, it's an articulation point
      if (components > 1) {
        articulation.push(node.id)
      }
    }

    return articulation
  },
}