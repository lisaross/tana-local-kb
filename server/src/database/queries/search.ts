/**
 * Advanced search and filtering operations for Tana knowledge base
 * 
 * This module provides comprehensive search capabilities including full-text search,
 * semantic filtering, graph-based search, and hybrid search combinations.
 */

import type { 
  DatabaseConnection,
  NodeRecord,
  SearchResult,
  SearchOptions,
  FilterOptions,
  PaginationOptions,
  PaginatedResult
} from '../types/index.js'
import { DatabaseError } from '../types/database-types.js'
import { QUERY_PATTERNS } from '../types/schema.js'

/**
 * Advanced search options
 */
export interface AdvancedSearchOptions extends SearchOptions {
  weights?: {
    nameMatch: number      // Weight for name matches (default: 3.0)
    contentMatch: number   // Weight for content matches (default: 1.0)
    tagMatch: number       // Weight for tag matches (default: 2.0)
    hierarchyBoost: number // Boost for nodes with children (default: 1.2)
    referencesBoost: number // Boost for highly referenced nodes (default: 1.1)
  }
  semanticSearch?: boolean // Enable semantic similarity search
  graphContext?: {
    includeRelated: boolean // Include related nodes in results
    relationWeight: number  // Weight for related nodes (default: 0.5)
    maxRelatedDepth: number // Max depth for related nodes (default: 2)
  }
  temporalFilter?: {
    createdAfter?: Date
    createdBefore?: Date
    updatedAfter?: Date
    updatedBefore?: Date
  }
  similarityThreshold?: number // Minimum similarity score (0-1)
}

/**
 * Enhanced search result with additional metadata
 */
export interface EnhancedSearchResult extends SearchResult {
  relevanceScore: number
  matchReasons: string[]
  relatedNodes?: Array<{
    node: NodeRecord
    relationship: 'child' | 'parent' | 'reference' | 'referenced_by'
    distance: number
  }>
  contextSnippets?: string[]
}

/**
 * Search analytics and metrics
 */
export interface SearchMetrics {
  totalResults: number
  searchTime: number
  indexUsage: string[]
  queryComplexity: 'low' | 'medium' | 'high'
  distributionByType: Record<string, number>
  avgRelevanceScore: number
}

/**
 * Faceted search result
 */
export interface FacetedSearchResult {
  results: EnhancedSearchResult[]
  facets: {
    nodeTypes: Array<{ value: string; count: number }>
    owners: Array<{ value: string; count: number }>
    tags: Array<{ value: string; count: number }>
    createdPeriods: Array<{ period: string; count: number }>
    depthLevels: Array<{ level: number; count: number }>
  }
  metrics: SearchMetrics
}

/**
 * Default search weights
 */
const DEFAULT_SEARCH_WEIGHTS = {
  nameMatch: 3.0,
  contentMatch: 1.0,
  tagMatch: 2.0,
  hierarchyBoost: 1.2,
  referencesBoost: 1.1,
}

/**
 * Search operations class
 */
export class SearchOperations {
  constructor(private db: DatabaseConnection) {}

  /**
   * Full-text search with ranking and highlighting
   */
  async fullTextSearch(
    query: string,
    options?: Partial<AdvancedSearchOptions>,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<EnhancedSearchResult>> {
    if (!query || query.trim().length === 0) {
      throw new DatabaseError('Search query is required')
    }

    const startTime = Date.now()
    const config = this.mergeSearchOptions(options)
    
    // Sanitize and prepare search query
    const sanitizedQuery = this.sanitizeSearchQuery(query)
    const searchTerms = this.extractSearchTerms(sanitizedQuery)

    // Build comprehensive search query
    const searchResults = await this.executeFullTextSearch(sanitizedQuery, config)
    
    // Calculate relevance scores and enhance results
    const enhancedResults = await this.enhanceSearchResults(searchResults, searchTerms, config)
    
    // Apply additional filtering
    const filteredResults = this.applyAdvancedFilters(enhancedResults, config)
    
    // Sort by relevance score
    const sortedResults = filteredResults.sort((a, b) => b.relevanceScore - a.relevanceScore)
    
    // Apply pagination
    const page = pagination?.page ?? 1
    const pageSize = pagination?.pageSize ?? 20
    const offset = (page - 1) * pageSize
    const paginatedResults = sortedResults.slice(offset, offset + pageSize)

    // Calculate metrics
    const searchTime = Date.now() - startTime
    const totalPages = Math.ceil(sortedResults.length / pageSize)

    return {
      data: paginatedResults,
      pagination: {
        page,
        pageSize,
        totalItems: sortedResults.length,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    }
  }

  /**
   * Faceted search with multiple dimensions
   */
  async facetedSearch(
    query: string,
    options?: Partial<AdvancedSearchOptions>
  ): Promise<FacetedSearchResult> {
    const startTime = Date.now()
    const config = this.mergeSearchOptions(options)
    
    // Perform main search
    const searchResult = await this.fullTextSearch(query, options, { page: 1, pageSize: 1000 })
    const results = searchResult.data

    // Calculate facets
    const facets = await this.calculateFacets(results, query, config)
    
    // Calculate metrics
    const metrics: SearchMetrics = {
      totalResults: results.length,
      searchTime: Date.now() - startTime,
      indexUsage: ['node_search_fts', 'idx_nodes_name', 'idx_nodes_type'],
      queryComplexity: this.assessQueryComplexity(query, config),
      distributionByType: this.calculateTypeDistribution(results),
      avgRelevanceScore: results.reduce((sum, r) => sum + r.relevanceScore, 0) / results.length || 0,
    }

    return { results, facets, metrics }
  }

  /**
   * Graph-based search using node relationships
   */
  async graphSearch(
    startNodeId: string,
    searchCriteria: {
      maxDepth?: number
      relationshipTypes?: ('hierarchy' | 'reference')[]
      nodeFilter?: Partial<NodeRecord>
      includeAncestors?: boolean
      includeDescendants?: boolean
    }
  ): Promise<EnhancedSearchResult[]> {
    if (!startNodeId) {
      throw new DatabaseError('Start node ID is required for graph search')
    }

    const config = {
      maxDepth: searchCriteria.maxDepth ?? 3,
      relationshipTypes: searchCriteria.relationshipTypes ?? ['hierarchy', 'reference'],
      includeAncestors: searchCriteria.includeAncestors ?? false,
      includeDescendants: searchCriteria.includeDescendants ?? true,
    }

    const results: EnhancedSearchResult[] = []
    const visited = new Set<string>([startNodeId])

    // Search descendants
    if (config.includeDescendants) {
      const descendants = await this.getRelatedNodes(
        startNodeId, 
        'descendants', 
        config.maxDepth,
        config.relationshipTypes
      )
      results.push(...descendants)
      descendants.forEach(d => visited.add(d.node.id))
    }

    // Search ancestors
    if (config.includeAncestors) {
      const ancestors = await this.getRelatedNodes(
        startNodeId,
        'ancestors',
        config.maxDepth,
        config.relationshipTypes
      )
      results.push(...ancestors.filter(a => !visited.has(a.node.id)))
    }

    // Apply node filters
    return this.applyNodeFilters(results, searchCriteria.nodeFilter)
  }

  /**
   * Similarity search based on content and metadata
   */
  async similaritySearch(
    referenceNodeId: string,
    options?: {
      similarityFields?: ('name' | 'content' | 'tags' | 'type')[]
      threshold?: number
      maxResults?: number
      excludeSelf?: boolean
    }
  ): Promise<EnhancedSearchResult[]> {
    const config = {
      similarityFields: options?.similarityFields ?? ['name', 'content', 'tags'],
      threshold: options?.threshold ?? 0.3,
      maxResults: options?.maxResults ?? 20,
      excludeSelf: options?.excludeSelf ?? true,
    }

    // Get reference node
    const [referenceNode] = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_NODE_BY_ID, [referenceNodeId])
    if (!referenceNode) {
      throw new DatabaseError(`Reference node not found: ${referenceNodeId}`)
    }

    // Get candidate nodes
    const candidates = this.db.query<NodeRecord>(`
      SELECT * FROM nodes 
      WHERE is_system_node = 0 
      ${config.excludeSelf ? 'AND id != ?' : ''}
      ORDER BY created_at DESC 
      LIMIT 500
    `, config.excludeSelf ? [referenceNodeId] : [])

    // Calculate similarities
    const similarities: Array<{ node: NodeRecord; score: number }> = []
    
    for (const candidate of candidates) {
      const score = this.calculateSimilarityScore(referenceNode, candidate, config.similarityFields)
      if (score >= config.threshold) {
        similarities.push({ node: candidate, score })
      }
    }

    // Sort by similarity score and limit results
    similarities.sort((a, b) => b.score - a.score)
    const topSimilar = similarities.slice(0, config.maxResults)

    // Convert to enhanced search results
    return topSimilar.map(({ node, score }) => ({
      node,
      rank: score,
      snippet: this.generateSimilaritySnippet(referenceNode, node),
      match_type: 'content',
      relevanceScore: score,
      matchReasons: this.getSimilarityReasons(referenceNode, node, config.similarityFields),
    }))
  }

  /**
   * Multi-modal search combining text, graph, and similarity
   */
  async hybridSearch(
    query: string,
    options?: {
      textWeight?: number
      graphWeight?: number
      similarityWeight?: number
      contextNodeId?: string
      fusionMethod?: 'linear' | 'rank' | 'weighted'
    }
  ): Promise<EnhancedSearchResult[]> {
    const config = {
      textWeight: options?.textWeight ?? 0.6,
      graphWeight: options?.graphWeight ?? 0.2,
      similarityWeight: options?.similarityWeight ?? 0.2,
      fusionMethod: options?.fusionMethod ?? 'weighted' as const,
    }

    // Validate weights sum to 1
    const totalWeight = config.textWeight + config.graphWeight + config.similarityWeight
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new DatabaseError('Search weights must sum to 1.0')
    }

    const allResults = new Map<string, EnhancedSearchResult>()

    // 1. Text search
    const textResults = await this.fullTextSearch(query, { maxResults: 100 })
    for (const result of textResults.data) {
      allResults.set(result.node.id, {
        ...result,
        relevanceScore: result.relevanceScore * config.textWeight,
        matchReasons: [...result.matchReasons, 'text-search'],
      })
    }

    // 2. Graph search (if context node provided)
    if (options?.contextNodeId) {
      const graphResults = await this.graphSearch(options.contextNodeId, { maxDepth: 2 })
      for (const result of graphResults) {
        const existing = allResults.get(result.node.id)
        if (existing) {
          existing.relevanceScore += result.relevanceScore * config.graphWeight
          existing.matchReasons.push('graph-context')
        } else {
          allResults.set(result.node.id, {
            ...result,
            relevanceScore: result.relevanceScore * config.graphWeight,
            matchReasons: ['graph-context'],
          })
        }
      }
    }

    // 3. Semantic similarity (using query as reference)
    const queryNodes = await this.findNodesWithQueryTerms(query)
    for (const queryNode of queryNodes) {
      const similarResults = await this.similaritySearch(queryNode.id, { maxResults: 50 })
      for (const result of similarResults) {
        const existing = allResults.get(result.node.id)
        if (existing) {
          existing.relevanceScore += result.relevanceScore * config.similarityWeight
          existing.matchReasons.push('semantic-similarity')
        } else {
          allResults.set(result.node.id, {
            ...result,
            relevanceScore: result.relevanceScore * config.similarityWeight,
            matchReasons: ['semantic-similarity'],
          })
        }
      }
    }

    // Apply fusion method
    const finalResults = Array.from(allResults.values())
    return this.applyScoreFusion(finalResults, config.fusionMethod)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 50) // Limit final results
  }

  /**
   * Autocomplete search for query suggestions
   */
  async autocomplete(
    partialQuery: string,
    maxSuggestions: number = 10
  ): Promise<Array<{
    suggestion: string
    type: 'node_name' | 'tag' | 'field'
    frequency: number
    preview?: string
  }>> {
    if (!partialQuery || partialQuery.trim().length < 2) {
      return []
    }

    const query = partialQuery.trim().toLowerCase()
    const suggestions: Array<{
      suggestion: string
      type: 'node_name' | 'tag' | 'field'
      frequency: number
      preview?: string
    }> = []

    // Node name suggestions
    const nodeNames = this.db.query<{ name: string; content: string }>(`
      SELECT name, content FROM nodes 
      WHERE LOWER(name) LIKE ? 
      AND is_system_node = 0 
      ORDER BY LENGTH(name), name 
      LIMIT ?
    `, [`%${query}%`, Math.ceil(maxSuggestions * 0.7)])

    for (const node of nodeNames) {
      suggestions.push({
        suggestion: node.name,
        type: 'node_name',
        frequency: 1,
        preview: node.content.slice(0, 100),
      })
    }

    // Tag suggestions (extracted from content)
    const tagMatches = this.db.query<{ content: string }>(`
      SELECT content FROM nodes 
      WHERE LOWER(content) LIKE ? 
      AND is_system_node = 0 
      LIMIT 50
    `, [`%#${query}%`])

    const tagFrequency = new Map<string, number>()
    for (const match of tagMatches) {
      const tags = this.extractTags(match.content)
      for (const tag of tags) {
        if (tag.toLowerCase().includes(query)) {
          tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1)
        }
      }
    }

    // Add top tag suggestions
    const sortedTags = Array.from(tagFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.ceil(maxSuggestions * 0.3))

    for (const [tag, frequency] of sortedTags) {
      suggestions.push({
        suggestion: `#${tag}`,
        type: 'tag',
        frequency,
      })
    }

    // Sort all suggestions by relevance and frequency
    return suggestions
      .sort((a, b) => {
        // Exact matches first
        const aExact = a.suggestion.toLowerCase().startsWith(query) ? 1 : 0
        const bExact = b.suggestion.toLowerCase().startsWith(query) ? 1 : 0
        if (aExact !== bExact) return bExact - aExact

        // Then by frequency
        return b.frequency - a.frequency
      })
      .slice(0, maxSuggestions)
  }

  /**
   * Advanced filtering with complex conditions
   */
  async advancedFilter(
    filters: {
      nodeTypes?: string[]
      ownerIds?: string[]
      hasChildren?: boolean
      hasReferences?: boolean
      minReferenceCount?: number
      maxReferenceCount?: number
      tags?: string[]
      fieldExists?: string[]
      fieldValues?: Record<string, any>
      depthRange?: { min?: number; max?: number }
      contentLength?: { min?: number; max?: number }
      createdDateRange?: { start?: Date; end?: Date }
      updatedDateRange?: { start?: Date; end?: Date }
    },
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<NodeRecord>> {
    const conditions: string[] = ['n.is_system_node = 0']
    const params: any[] = []

    // Basic filters
    if (filters.nodeTypes && filters.nodeTypes.length > 0) {
      const placeholders = filters.nodeTypes.map(() => '?').join(', ')
      conditions.push(`n.node_type IN (${placeholders})`)
      params.push(...filters.nodeTypes)
    }

    if (filters.ownerIds && filters.ownerIds.length > 0) {
      const placeholders = filters.ownerIds.map(() => '?').join(', ')
      conditions.push(`n.owner_id IN (${placeholders})`)
      params.push(...filters.ownerIds)
    }

    // Relationship filters
    if (filters.hasChildren === true) {
      conditions.push('EXISTS (SELECT 1 FROM node_hierarchy h WHERE h.parent_id = n.id)')
    } else if (filters.hasChildren === false) {
      conditions.push('NOT EXISTS (SELECT 1 FROM node_hierarchy h WHERE h.parent_id = n.id)')
    }

    if (filters.hasReferences === true) {
      conditions.push('EXISTS (SELECT 1 FROM node_references r WHERE r.source_id = n.id OR r.target_id = n.id)')
    } else if (filters.hasReferences === false) {
      conditions.push('NOT EXISTS (SELECT 1 FROM node_references r WHERE r.source_id = n.id OR r.target_id = n.id)')
    }

    // Reference count filters
    if (filters.minReferenceCount !== undefined || filters.maxReferenceCount !== undefined) {
      const refCountSubquery = `
        (SELECT COUNT(*) FROM node_references r WHERE r.target_id = n.id)
      `
      
      if (filters.minReferenceCount !== undefined) {
        conditions.push(`${refCountSubquery} >= ?`)
        params.push(filters.minReferenceCount)
      }
      
      if (filters.maxReferenceCount !== undefined) {
        conditions.push(`${refCountSubquery} <= ?`)
        params.push(filters.maxReferenceCount)
      }
    }

    // Content-based filters
    if (filters.tags && filters.tags.length > 0) {
      for (const tag of filters.tags) {
        conditions.push('n.content LIKE ?')
        params.push(`%#${tag}%`)
      }
    }

    if (filters.contentLength) {
      if (filters.contentLength.min !== undefined) {
        conditions.push('LENGTH(n.content) >= ?')
        params.push(filters.contentLength.min)
      }
      if (filters.contentLength.max !== undefined) {
        conditions.push('LENGTH(n.content) <= ?')
        params.push(filters.contentLength.max)
      }
    }

    // Date filters
    if (filters.createdDateRange) {
      if (filters.createdDateRange.start) {
        conditions.push('n.created_at >= ?')
        params.push(filters.createdDateRange.start.toISOString())
      }
      if (filters.createdDateRange.end) {
        conditions.push('n.created_at <= ?')
        params.push(filters.createdDateRange.end.toISOString())
      }
    }

    if (filters.updatedDateRange) {
      if (filters.updatedDateRange.start) {
        conditions.push('n.updated_at >= ?')
        params.push(filters.updatedDateRange.start.toISOString())
      }
      if (filters.updatedDateRange.end) {
        conditions.push('n.updated_at <= ?')
        params.push(filters.updatedDateRange.end.toISOString())
      }
    }

    // Build and execute query
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    
    // Count total results
    const [countResult] = this.db.query<{ count: number }>(`
      SELECT COUNT(*) as count FROM nodes n ${whereClause}
    `, params)

    // Get paginated results
    const page = pagination?.page ?? 1
    const pageSize = pagination?.pageSize ?? 50
    const sortBy = pagination?.sortBy ?? 'created_at'
    const sortDirection = pagination?.sortDirection ?? 'DESC'
    const offset = (page - 1) * pageSize

    const results = this.db.query<NodeRecord>(`
      SELECT n.* FROM nodes n 
      ${whereClause}
      ORDER BY n.${sortBy} ${sortDirection}
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset])

    const totalPages = Math.ceil(countResult.count / pageSize)

    return {
      data: results,
      pagination: {
        page,
        pageSize,
        totalItems: countResult.count,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    }
  }

  /**
   * Helper methods
   */
  private mergeSearchOptions(options?: Partial<AdvancedSearchOptions>): AdvancedSearchOptions {
    return {
      query: '',
      maxResults: 50,
      exactMatch: false,
      fuzzyThreshold: 0.3,
      weights: { ...DEFAULT_SEARCH_WEIGHTS, ...options?.weights },
      semanticSearch: false,
      graphContext: {
        includeRelated: false,
        relationWeight: 0.5,
        maxRelatedDepth: 2,
        ...options?.graphContext,
      },
      similarityThreshold: 0.3,
      ...options,
    }
  }

  private sanitizeSearchQuery(query: string): string {
    // Remove potentially harmful characters and normalize
    return query
      .replace(/[^\w\s\-_#@"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private extractSearchTerms(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 1)
  }

  private async executeFullTextSearch(
    query: string,
    options: AdvancedSearchOptions
  ): Promise<SearchResult[]> {
    // Sanitize FTS query to prevent injection
    const sanitizedQuery = query.replace(/["'\\]/g, '').trim()
    const searchQuery = `"${sanitizedQuery}" OR ${sanitizedQuery.split(' ').map(term => `"${term}"`).join(' OR ')}`
    
    const results = this.db.query<SearchResult>(`
      SELECT 
        n.*,
        s.rank,
        snippet(node_search, 1, '<mark>', '</mark>', '...', 32) as snippet,
        CASE 
          WHEN n.name LIKE ? THEN 'name'
          WHEN snippet LIKE '%<mark>%' THEN 'content'
          ELSE 'content'
        END as match_type
      FROM node_search s
      JOIN nodes n ON s.id = n.id
      WHERE node_search MATCH ?
      ${options.includeSystemNodes ? '' : 'AND n.is_system_node = 0'}
      ORDER BY s.rank
      LIMIT ?
    `, [`%${query}%`, searchQuery, options.maxResults || 50])

    return results.map(result => ({
      node: result.node,
      rank: result.rank,
      snippet: result.snippet,
      match_type: result.match_type,
    }))
  }

  private async enhanceSearchResults(
    results: SearchResult[],
    searchTerms: string[],
    options: AdvancedSearchOptions
  ): Promise<EnhancedSearchResult[]> {
    const enhanced: EnhancedSearchResult[] = []

    for (const result of results) {
      const relevanceScore = this.calculateRelevanceScore(result, searchTerms, options.weights!)
      const matchReasons = this.getMatchReasons(result, searchTerms)
      
      let relatedNodes: EnhancedSearchResult['relatedNodes'] = undefined
      if (options.graphContext?.includeRelated) {
        relatedNodes = await this.getRelatedNodesForResult(result.node.id, options.graphContext)
      }

      enhanced.push({
        ...result,
        relevanceScore,
        matchReasons,
        relatedNodes,
        contextSnippets: [result.snippet],
      })
    }

    return enhanced
  }

  private calculateRelevanceScore(
    result: SearchResult,
    searchTerms: string[],
    weights: Required<AdvancedSearchOptions>['weights']
  ): number {
    let score = result.rank // Base FTS score

    // Boost exact name matches
    const nameMatch = searchTerms.some(term => 
      result.node.name.toLowerCase().includes(term.toLowerCase())
    )
    if (nameMatch) {
      score *= weights.nameMatch
    }

    // Boost tag matches
    const tagMatch = searchTerms.some(term => 
      result.node.content.toLowerCase().includes(`#${term.toLowerCase()}`)
    )
    if (tagMatch) {
      score *= weights.tagMatch
    }

    // Apply type-based scoring
    switch (result.match_type) {
      case 'name':
        score *= weights.nameMatch
        break
      case 'content':
        score *= weights.contentMatch
        break
      case 'tag':
        score *= weights.tagMatch
        break
    }

    return score
  }

  private getMatchReasons(result: SearchResult, searchTerms: string[]): string[] {
    const reasons: string[] = []

    if (result.match_type === 'name') {
      reasons.push('title-match')
    }
    if (result.match_type === 'content') {
      reasons.push('content-match')
    }
    if (searchTerms.some(term => result.node.content.includes(`#${term}`))) {
      reasons.push('tag-match')
    }

    return reasons
  }

  private applyAdvancedFilters(
    results: EnhancedSearchResult[],
    options: AdvancedSearchOptions
  ): EnhancedSearchResult[] {
    let filtered = [...results]

    // Apply node type filter
    if (options.nodeTypes && options.nodeTypes.length > 0) {
      filtered = filtered.filter(r => options.nodeTypes!.includes(r.node.node_type))
    }

    // Apply similarity threshold
    if (options.similarityThreshold) {
      filtered = filtered.filter(r => r.relevanceScore >= options.similarityThreshold!)
    }

    // Apply temporal filters
    if (options.temporalFilter) {
      filtered = filtered.filter(r => {
        const created = new Date(r.node.created_at)
        const updated = new Date(r.node.updated_at)

        if (options.temporalFilter!.createdAfter && created < options.temporalFilter!.createdAfter) {
          return false
        }
        if (options.temporalFilter!.createdBefore && created > options.temporalFilter!.createdBefore) {
          return false
        }
        if (options.temporalFilter!.updatedAfter && updated < options.temporalFilter!.updatedAfter) {
          return false
        }
        if (options.temporalFilter!.updatedBefore && updated > options.temporalFilter!.updatedBefore) {
          return false
        }

        return true
      })
    }

    return filtered
  }

  private async calculateFacets(
    results: EnhancedSearchResult[],
    query: string,
    options: AdvancedSearchOptions
  ): Promise<FacetedSearchResult['facets']> {
    // Node types facet
    const nodeTypes = new Map<string, number>()
    results.forEach(r => {
      nodeTypes.set(r.node.node_type, (nodeTypes.get(r.node.node_type) || 0) + 1)
    })

    // Owners facet  
    const owners = new Map<string, number>()
    results.forEach(r => {
      if (r.node.owner_id) {
        owners.set(r.node.owner_id, (owners.get(r.node.owner_id) || 0) + 1)
      }
    })

    // Tags facet
    const tags = new Map<string, number>()
    results.forEach(r => {
      const nodeTags = this.extractTags(r.node.content)
      nodeTags.forEach(tag => {
        tags.set(tag, (tags.get(tag) || 0) + 1)
      })
    })

    // Created periods facet
    const periods = new Map<string, number>()
    results.forEach(r => {
      const period = this.getPeriod(new Date(r.node.created_at))
      periods.set(period, (periods.get(period) || 0) + 1)
    })

    return {
      nodeTypes: Array.from(nodeTypes.entries()).map(([value, count]) => ({ value, count })),
      owners: Array.from(owners.entries()).map(([value, count]) => ({ value, count })),
      tags: Array.from(tags.entries()).map(([value, count]) => ({ value, count })),
      createdPeriods: Array.from(periods.entries()).map(([period, count]) => ({ period, count })),
      depthLevels: [], // Would need hierarchy depth calculation
    }
  }

  private assessQueryComplexity(query: string, options: AdvancedSearchOptions): 'low' | 'medium' | 'high' {
    let complexity = 0

    // Query length
    complexity += query.length > 50 ? 2 : query.length > 20 ? 1 : 0

    // Number of terms
    const terms = this.extractSearchTerms(query)
    complexity += terms.length > 5 ? 2 : terms.length > 2 ? 1 : 0

    // Advanced options
    if (options.semanticSearch) complexity += 2
    if (options.graphContext?.includeRelated) complexity += 2
    if (options.nodeTypes && options.nodeTypes.length > 1) complexity += 1

    if (complexity >= 5) return 'high'
    if (complexity >= 2) return 'medium'
    return 'low'
  }

  private calculateTypeDistribution(results: EnhancedSearchResult[]): Record<string, number> {
    const distribution: Record<string, number> = {}
    results.forEach(r => {
      distribution[r.node.node_type] = (distribution[r.node.node_type] || 0) + 1
    })
    return distribution
  }

  private async getRelatedNodes(
    nodeId: string,
    direction: 'ancestors' | 'descendants',
    maxDepth: number,
    relationshipTypes: ('hierarchy' | 'reference')[]
  ): Promise<EnhancedSearchResult[]> {
    const results: EnhancedSearchResult[] = []

    if (relationshipTypes.includes('hierarchy')) {
      const query = direction === 'descendants' ? QUERY_PATTERNS.GET_DESCENDANTS : QUERY_PATTERNS.GET_ANCESTORS
      const related = this.db.query<NodeRecord & { level: number }>(query, [nodeId])
      
      for (const node of related) {
        if (node.level <= maxDepth) {
          results.push({
            node,
            rank: 1.0 / (node.level + 1), // Distance-based ranking
            snippet: node.content.slice(0, 100),
            match_type: 'content',
            relevanceScore: 1.0 / (node.level + 1),
            matchReasons: ['graph-relationship'],
          })
        }
      }
    }

    return results
  }

  private calculateSimilarityScore(
    reference: NodeRecord,
    candidate: NodeRecord,
    fields: ('name' | 'content' | 'tags' | 'type')[]
  ): number {
    let totalScore = 0
    let fieldCount = 0

    for (const field of fields) {
      let fieldScore = 0

      switch (field) {
        case 'name':
          fieldScore = this.calculateTextSimilarity(reference.name, candidate.name)
          break
        case 'content':
          fieldScore = this.calculateTextSimilarity(reference.content, candidate.content)
          break
        case 'type':
          fieldScore = reference.node_type === candidate.node_type ? 1.0 : 0.0
          break
        case 'tags':
          const refTags = this.extractTags(reference.content)
          const candTags = this.extractTags(candidate.content)
          fieldScore = this.calculateSetSimilarity(refTags, candTags)
          break
      }

      totalScore += fieldScore
      fieldCount++
    }

    return fieldCount > 0 ? totalScore / fieldCount : 0
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity based on word overlap
    const words1 = new Set(text1.toLowerCase().split(/\s+/))
    const words2 = new Set(text2.toLowerCase().split(/\s+/))
    
    const intersection = new Set([...words1].filter(w => words2.has(w)))
    const union = new Set([...words1, ...words2])
    
    return union.size > 0 ? intersection.size / union.size : 0
  }

  private calculateSetSimilarity(set1: string[], set2: string[]): number {
    const s1 = new Set(set1)
    const s2 = new Set(set2)
    const intersection = new Set([...s1].filter(x => s2.has(x)))
    const union = new Set([...s1, ...s2])
    
    return union.size > 0 ? intersection.size / union.size : 0
  }

  private extractTags(content: string): string[] {
    const tagRegex = /#([a-zA-Z0-9_-]+)/g
    const matches = content.match(tagRegex) || []
    return matches.map(tag => tag.slice(1)) // Remove the # prefix
  }

  private getPeriod(date: Date): string {
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays <= 7) return 'last-week'
    if (diffDays <= 30) return 'last-month'
    if (diffDays <= 90) return 'last-quarter'
    if (diffDays <= 365) return 'last-year'
    return 'older'
  }

  private generateSimilaritySnippet(reference: NodeRecord, candidate: NodeRecord): string {
    // Generate a snippet highlighting why nodes are similar
    const refWords = new Set(reference.name.toLowerCase().split(/\s+/))
    const candWords = candidate.name.toLowerCase().split(/\s+/)
    
    const commonWords = candWords.filter(w => refWords.has(w))
    if (commonWords.length > 0) {
      return `Similar to "${reference.name}": ${commonWords.join(', ')}`
    }
    
    return candidate.content.slice(0, 100)
  }

  private getSimilarityReasons(
    reference: NodeRecord,
    candidate: NodeRecord,
    fields: ('name' | 'content' | 'tags' | 'type')[]
  ): string[] {
    const reasons: string[] = []

    if (fields.includes('name') && this.calculateTextSimilarity(reference.name, candidate.name) > 0.3) {
      reasons.push('similar-name')
    }
    if (fields.includes('type') && reference.node_type === candidate.node_type) {
      reasons.push('same-type')
    }
    if (fields.includes('tags')) {
      const refTags = this.extractTags(reference.content)
      const candTags = this.extractTags(candidate.content)
      if (this.calculateSetSimilarity(refTags, candTags) > 0.2) {
        reasons.push('similar-tags')
      }
    }

    return reasons
  }

  private async findNodesWithQueryTerms(query: string): Promise<NodeRecord[]> {
    const terms = this.extractSearchTerms(query)
    if (terms.length === 0) return []

    // Find nodes that contain query terms (simple heuristic)
    const conditions = terms.map(() => 'LOWER(name) LIKE ? OR LOWER(content) LIKE ?')
    const params = terms.flatMap(term => [`%${term}%`, `%${term}%`])

    return this.db.query<NodeRecord>(`
      SELECT * FROM nodes 
      WHERE (${conditions.join(' OR ')})
      AND is_system_node = 0
      LIMIT 10
    `, params)
  }

  private applyScoreFusion(
    results: EnhancedSearchResult[],
    method: 'linear' | 'rank' | 'weighted'
  ): EnhancedSearchResult[] {
    switch (method) {
      case 'linear':
        // Scores are already combined linearly
        return results

      case 'rank':
        // Use rank-based fusion (RRF - Reciprocal Rank Fusion)
        const ranked = results.sort((a, b) => b.relevanceScore - a.relevanceScore)
        return ranked.map((result, index) => ({
          ...result,
          relevanceScore: 1.0 / (index + 1)
        }))

      case 'weighted':
        // Normalize scores within [0,1] and apply weights
        const maxScore = Math.max(...results.map(r => r.relevanceScore))
        if (maxScore > 0) {
          return results.map(result => ({
            ...result,
            relevanceScore: result.relevanceScore / maxScore
          }))
        }
        return results

      default:
        return results
    }
  }

  private applyNodeFilters(
    results: EnhancedSearchResult[],
    filter?: Partial<NodeRecord>
  ): EnhancedSearchResult[] {
    if (!filter) return results

    return results.filter(result => {
      for (const [key, value] of Object.entries(filter)) {
        if ((result.node as any)[key] !== value) {
          return false
        }
      }
      return true
    })
  }

  private async getRelatedNodesForResult(
    nodeId: string,
    graphContext: Required<AdvancedSearchOptions>['graphContext']
  ): Promise<EnhancedSearchResult['relatedNodes']> {
    const related: EnhancedSearchResult['relatedNodes'] = []

    // Get children
    const children = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_CHILDREN, [nodeId])
    for (const child of children.slice(0, 3)) { // Limit to avoid bloat
      related!.push({
        node: child,
        relationship: 'child',
        distance: 1,
      })
    }

    // Get parents
    const parents = this.db.query<NodeRecord>(QUERY_PATTERNS.GET_PARENTS, [nodeId])
    for (const parent of parents.slice(0, 2)) {
      related!.push({
        node: parent,
        relationship: 'parent',
        distance: 1,
      })
    }

    return related
  }
}

/**
 * Create search operations instance
 */
export function createSearchOperations(db: DatabaseConnection): SearchOperations {
  return new SearchOperations(db)
}

/**
 * Search utility functions
 */
export const searchUtils = {
  /**
   * Highlight search terms in text
   */
  highlightTerms(text: string, terms: string[], maxLength: number = 200): string {
    let highlighted = text
    
    for (const term of terms) {
      const regex = new RegExp(`\\b(${term})\\b`, 'gi')
      highlighted = highlighted.replace(regex, '<mark>$1</mark>')
    }

    if (highlighted.length > maxLength) {
      // Try to find the first highlight and center around it
      const markIndex = highlighted.indexOf('<mark>')
      if (markIndex > -1) {
        const start = Math.max(0, markIndex - maxLength / 2)
        const end = Math.min(highlighted.length, start + maxLength)
        highlighted = (start > 0 ? '...' : '') + 
                     highlighted.slice(start, end) + 
                     (end < highlighted.length ? '...' : '')
      } else {
        highlighted = highlighted.slice(0, maxLength) + '...'
      }
    }

    return highlighted
  },

  /**
   * Extract key phrases from text
   */
  extractKeyPhrases(text: string, maxPhrases: number = 5): string[] {
    // Simple extraction based on word frequency and position
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)

    const frequency = new Map<string, number>()
    words.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1)
    })

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxPhrases)
      .map(([word]) => word)
  },

  /**
   * Calculate search result diversity
   */
  calculateDiversity(results: EnhancedSearchResult[]): number {
    const types = new Set(results.map(r => r.node.node_type))
    const owners = new Set(results.map(r => r.node.owner_id).filter(Boolean))
    
    // Simple diversity score based on unique attributes
    const typesDiversity = types.size / Math.max(results.length, 1)
    const ownersDiversity = owners.size / Math.max(results.length, 1)
    
    return (typesDiversity + ownersDiversity) / 2
  },
}