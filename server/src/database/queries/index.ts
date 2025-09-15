/**
 * Database queries export index
 * 
 * Central export point for all database query operations including
 * graph traversal, search, and analytical queries.
 */

// Core query modules
export * from './graph-traversal.js'
export * from './search.js'

// Re-export types for convenience
export type {
  NodePath,
  PathFindingOptions,
  ClusterAnalysis,
  TraversalOptions,
  TraversalResult,
  PathAnalysis,
  GraphAnalysisResult,
  SearchOptions,
  AdvancedSearchOptions,
  EnhancedSearchResult,
  SearchMetrics,
  FacetedSearchResult,
  FilterOptions,
  PaginationOptions,
  PaginatedResult,
} from '../types/index.js'

import type { DatabaseConnection } from '../types/index.js'
import { GraphTraversal, createGraphTraversal } from './graph-traversal.js'
import { SearchOperations, createSearchOperations } from './search.js'

/**
 * Combined query operations manager
 */
export class QueryOperations {
  public readonly graph: GraphTraversal
  public readonly search: SearchOperations

  constructor(db: DatabaseConnection) {
    this.graph = createGraphTraversal(db)
    this.search = createSearchOperations(db)
  }

  /**
   * Unified search and traversal operation
   * Combines text search with graph exploration for comprehensive results
   */
  async unifiedSearch(params: {
    query?: string
    startNodeId?: string
    searchOptions?: {
      includeFullText?: boolean
      includeGraphTraversal?: boolean
      includeSimilarity?: boolean
      maxResults?: number
    }
    traversalOptions?: {
      maxDepth?: number
      includeReferences?: boolean
      direction?: 'up' | 'down' | 'both'
    }
    weights?: {
      textSearch?: number
      graphTraversal?: number
      similarity?: number
    }
  }): Promise<{
    results: Array<{
      node: any
      score: number
      source: 'text' | 'graph' | 'similarity'
      context?: string
    }>
    metrics: {
      textResults: number
      graphResults: number
      similarityResults: number
      totalTime: number
    }
  }> {
    const startTime = Date.now()
    const config = {
      searchOptions: {
        includeFullText: true,
        includeGraphTraversal: true,
        includeSimilarity: false,
        maxResults: 50,
        ...params.searchOptions,
      },
      traversalOptions: {
        maxDepth: 3,
        includeReferences: true,
        direction: 'both' as const,
        ...params.traversalOptions,
      },
      weights: {
        textSearch: 0.5,
        graphTraversal: 0.3,
        similarity: 0.2,
        ...params.weights,
      },
    }

    const allResults = new Map<string, {
      node: any
      score: number
      source: 'text' | 'graph' | 'similarity'
      context?: string
    }>()

    let textResults = 0
    let graphResults = 0
    let similarityResults = 0

    // 1. Full-text search if query provided
    if (params.query && config.searchOptions.includeFullText) {
      try {
        const searchResult = await this.search.fullTextSearch(params.query, {
          maxResults: Math.floor(config.searchOptions.maxResults * 0.6),
        })
        
        for (const result of searchResult.data) {
          allResults.set(result.node.id, {
            node: result.node,
            score: result.relevanceScore * config.weights.textSearch,
            source: 'text',
            context: result.snippet,
          })
          textResults++
        }
      } catch (error) {
        console.warn('Text search failed:', error)
      }
    }

    // 2. Graph traversal if start node provided
    if (params.startNodeId && config.searchOptions.includeGraphTraversal) {
      try {
        const traversalResult = await this.graph.breadthFirstTraversal(params.startNodeId, {
          maxDepth: config.traversalOptions.maxDepth,
          includeReferences: config.traversalOptions.includeReferences,
          visitLimit: Math.floor(config.searchOptions.maxResults * 0.4),
        })

        for (const nodeWithDepth of traversalResult.nodes) {
          const existing = allResults.get(nodeWithDepth.id)
          const graphScore = (1.0 / (nodeWithDepth.depth + 1)) * config.weights.graphTraversal
          
          if (existing) {
            existing.score += graphScore
            existing.context += ` | Graph: depth ${nodeWithDepth.depth}`
          } else {
            allResults.set(nodeWithDepth.id, {
              node: nodeWithDepth,
              score: graphScore,
              source: 'graph',
              context: `Related at depth ${nodeWithDepth.depth}`,
            })
          }
          graphResults++
        }
      } catch (error) {
        console.warn('Graph traversal failed:', error)
      }
    }

    // 3. Similarity search if enabled and reference node available
    if (config.searchOptions.includeSimilarity && params.startNodeId) {
      try {
        const similarityResult = await this.search.similaritySearch(params.startNodeId, {
          maxResults: Math.floor(config.searchOptions.maxResults * 0.3),
          threshold: 0.2,
        })

        for (const result of similarityResult) {
          const existing = allResults.get(result.node.id)
          const simScore = result.relevanceScore * config.weights.similarity
          
          if (existing) {
            existing.score += simScore
            existing.context += ` | Similar`
          } else {
            allResults.set(result.node.id, {
              node: result.node,
              score: simScore,
              source: 'similarity',
              context: 'Content similarity',
            })
          }
          similarityResults++
        }
      } catch (error) {
        console.warn('Similarity search failed:', error)
      }
    }

    // Sort by combined score and limit results
    const finalResults = Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, config.searchOptions.maxResults)

    return {
      results: finalResults,
      metrics: {
        textResults,
        graphResults,
        similarityResults,
        totalTime: Date.now() - startTime,
      },
    }
  }

  /**
   * Smart node discovery based on patterns and relationships
   */
  async discoverNodes(params: {
    seedNodeIds?: string[]
    patterns?: {
      nodeTypes?: string[]
      minConnections?: number
      hasSpecificFields?: string[]
      contentPatterns?: string[]
    }
    exploration?: {
      maxDepth?: number
      expandHighlyConnected?: boolean
      followStrongReferences?: boolean
    }
    filters?: {
      excludeVisited?: boolean
      minRelevanceScore?: number
      diversityBoost?: boolean
    }
  }): Promise<{
    discovered: Array<{
      node: any
      discoveryPath: string[]
      discoveryReason: string
      confidence: number
    }>
    patterns: Array<{
      pattern: string
      nodes: string[]
      strength: number
    }>
  }> {
    const discovered = new Map<string, {
      node: any
      discoveryPath: string[]
      discoveryReason: string
      confidence: number
    }>()
    
    const visited = new Set<string>()
    const seedNodes = params.seedNodeIds || []

    // Start with seed nodes
    for (const seedId of seedNodes) {
      visited.add(seedId)
    }

    // Expand from seed nodes
    const queue = seedNodes.map(id => ({ nodeId: id, path: [id], depth: 0 }))
    const maxDepth = params.exploration?.maxDepth ?? 3

    while (queue.length > 0) {
      const { nodeId, path, depth } = queue.shift()!
      
      if (depth >= maxDepth) continue

      // Get connected nodes
      const connections = await this.getNodeConnections(nodeId)
      
      for (const connection of connections) {
        if (visited.has(connection.id)) continue
        
        visited.add(connection.id)
        
        // Evaluate if this node matches discovery patterns
        const evaluation = await this.evaluateNodeForDiscovery(connection, params.patterns)
        
        if (evaluation.matches) {
          discovered.set(connection.id, {
            node: connection,
            discoveryPath: [...path, connection.id],
            discoveryReason: evaluation.reason,
            confidence: evaluation.confidence,
          })

          // Add to queue for further exploration
          if (evaluation.confidence > 0.5) {
            queue.push({
              nodeId: connection.id,
              path: [...path, connection.id],
              depth: depth + 1,
            })
          }
        }
      }
    }

    // Discover patterns in the found nodes
    const patterns = await this.discoverPatterns(Array.from(discovered.values()))

    return {
      discovered: Array.from(discovered.values())
        .sort((a, b) => b.confidence - a.confidence),
      patterns,
    }
  }

  /**
   * Analyze query performance and suggest optimizations
   */
  async analyzeQueryPerformance(queryType: string, queryParams: any): Promise<{
    performance: {
      estimatedTime: number
      complexity: 'low' | 'medium' | 'high'
      bottlenecks: string[]
      recommendations: string[]
    }
    optimization: {
      suggestedIndexes: string[]
      queryRewrite?: string
      cachingStrategy?: string
    }
  }> {
    const analysis = {
      performance: {
        estimatedTime: 0,
        complexity: 'low' as const,
        bottlenecks: [] as string[],
        recommendations: [] as string[],
      },
      optimization: {
        suggestedIndexes: [] as string[],
        queryRewrite: undefined as string | undefined,
        cachingStrategy: undefined as string | undefined,
      },
    }

    // Analyze based on query type
    switch (queryType) {
      case 'fullTextSearch':
        analysis.performance.estimatedTime = this.estimateSearchTime(queryParams)
        analysis.performance.complexity = queryParams.query?.length > 50 ? 'high' : 'medium'
        
        if (!queryParams.query) {
          analysis.performance.bottlenecks.push('Empty search query')
        }
        
        analysis.optimization.suggestedIndexes.push('node_search_fts')
        analysis.optimization.cachingStrategy = 'query-result-cache'
        break

      case 'graphTraversal':
        analysis.performance.estimatedTime = this.estimateTraversalTime(queryParams)
        analysis.performance.complexity = queryParams.maxDepth > 5 ? 'high' : 'medium'
        
        if (queryParams.maxDepth > 10) {
          analysis.performance.bottlenecks.push('Deep traversal may be slow')
          analysis.performance.recommendations.push('Consider limiting depth to 5-7 levels')
        }
        
        analysis.optimization.suggestedIndexes.push('idx_hierarchy_parent', 'idx_hierarchy_child')
        break

      case 'similaritySearch':
        analysis.performance.estimatedTime = this.estimateSimilarityTime(queryParams)
        analysis.performance.complexity = 'high'
        
        analysis.performance.bottlenecks.push('Requires comparison with many nodes')
        analysis.performance.recommendations.push('Use pre-computed similarity indexes')
        analysis.optimization.cachingStrategy = 'similarity-cache'
        break
    }

    return analysis
  }

  /**
   * Get health metrics for query operations
   */
  async getQueryHealth(): Promise<{
    searchIndex: {
      status: 'healthy' | 'degraded' | 'failed'
      lastRebuild?: Date
      size: number
      hitRate: number
    }
    graphConnectivity: {
      status: 'healthy' | 'degraded' | 'failed'
      largestComponent: number
      avgPathLength: number
      orphanedNodes: number
    }
    performance: {
      avgSearchTime: number
      avgTraversalTime: number
      slowQueries: number
      errorRate: number
    }
  }> {
    // This would integrate with actual monitoring systems
    return {
      searchIndex: {
        status: 'healthy',
        size: 0, // Would get from FTS index stats
        hitRate: 0.85,
      },
      graphConnectivity: {
        status: 'healthy',
        largestComponent: 0, // Would calculate from graph analysis
        avgPathLength: 0,
        orphanedNodes: 0,
      },
      performance: {
        avgSearchTime: 0,
        avgTraversalTime: 0,
        slowQueries: 0,
        errorRate: 0,
      },
    }
  }

  /**
   * Helper methods
   */
  private async getNodeConnections(nodeId: string): Promise<any[]> {
    // Get all connected nodes (children, parents, references)
    const children = await this.graph.db.query(`
      SELECT n.* FROM nodes n 
      JOIN node_hierarchy h ON n.id = h.child_id 
      WHERE h.parent_id = ?
    `, [nodeId])

    const parents = await this.graph.db.query(`
      SELECT n.* FROM nodes n 
      JOIN node_hierarchy h ON n.id = h.parent_id 
      WHERE h.child_id = ?
    `, [nodeId])

    const references = await this.graph.db.query(`
      SELECT n.* FROM nodes n 
      JOIN node_references r ON n.id = r.target_id 
      WHERE r.source_id = ?
    `, [nodeId])

    return [...children, ...parents, ...references]
  }

  private async evaluateNodeForDiscovery(
    node: any,
    patterns?: any
  ): Promise<{ matches: boolean; reason: string; confidence: number }> {
    let confidence = 0.5
    const reasons: string[] = []

    // Check node type patterns
    if (patterns?.nodeTypes && patterns.nodeTypes.includes(node.node_type)) {
      confidence += 0.2
      reasons.push('matches-node-type')
    }

    // Check content patterns
    if (patterns?.contentPatterns) {
      for (const pattern of patterns.contentPatterns) {
        if (node.content.toLowerCase().includes(pattern.toLowerCase())) {
          confidence += 0.15
          reasons.push(`matches-content-pattern:${pattern}`)
        }
      }
    }

    // Check connection requirements
    if (patterns?.minConnections) {
      const connections = await this.getNodeConnections(node.id)
      if (connections.length >= patterns.minConnections) {
        confidence += 0.15
        reasons.push('highly-connected')
      }
    }

    return {
      matches: confidence > 0.5,
      reason: reasons.join(', ') || 'general-discovery',
      confidence: Math.min(confidence, 1.0),
    }
  }

  private async discoverPatterns(
    discoveredNodes: Array<{ node: any; discoveryPath: string[]; discoveryReason: string; confidence: number }>
  ): Promise<Array<{ pattern: string; nodes: string[]; strength: number }>> {
    const patterns: Array<{ pattern: string; nodes: string[]; strength: number }> = []

    // Group by discovery reason
    const reasonGroups = new Map<string, string[]>()
    for (const discovered of discoveredNodes) {
      const reason = discovered.discoveryReason
      if (!reasonGroups.has(reason)) {
        reasonGroups.set(reason, [])
      }
      reasonGroups.get(reason)!.push(discovered.node.id)
    }

    // Convert groups to patterns
    for (const [reason, nodeIds] of reasonGroups) {
      if (nodeIds.length >= 2) { // Only patterns with multiple nodes
        patterns.push({
          pattern: reason,
          nodes: nodeIds,
          strength: nodeIds.length / discoveredNodes.length,
        })
      }
    }

    return patterns.sort((a, b) => b.strength - a.strength)
  }

  private estimateSearchTime(params: any): number {
    // Simple heuristic based on query complexity
    const baseTime = 10 // ms
    const queryLength = params.query?.length || 0
    const complexity = queryLength > 50 ? 3 : queryLength > 20 ? 2 : 1
    
    return baseTime * complexity
  }

  private estimateTraversalTime(params: any): number {
    const baseTime = 5 // ms per node
    const depth = params.maxDepth || 3
    const estimatedNodes = Math.pow(2, depth) // Exponential growth assumption
    
    return baseTime * Math.min(estimatedNodes, 1000) // Cap at reasonable number
  }

  private estimateSimilarityTime(params: any): number {
    // Similarity search is generally expensive
    return 50 + (params.maxResults || 20) * 2
  }
}

/**
 * Create combined query operations manager
 */
export function createQueryOperations(db: DatabaseConnection): QueryOperations {
  return new QueryOperations(db)
}

/**
 * Convenience function to create all query managers
 */
export function createQueryManagers(db: DatabaseConnection) {
  return {
    graph: createGraphTraversal(db),
    search: createSearchOperations(db),
    combined: createQueryOperations(db),
  }
}

/**
 * Default export for common usage
 */
export default {
  createQueries: createQueryOperations,
  createManagers: createQueryManagers,
}