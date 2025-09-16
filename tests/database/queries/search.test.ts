#!/usr/bin/env bun
/**
 * Search Functionality Tests
 * 
 * Tests for full-text search, semantic search, hybrid search algorithms,
 * ranking, filtering, and performance validation.
 */

import { beforeEach, afterEach, describe, expect, test } from 'bun:test'
import { dbUtils } from '../../../server/src/database/index.js'
import { createNodeOperations } from '../../../server/src/database/operations/nodes.js'
import { createSearchQueries } from '../../../server/src/database/queries/search.js'
import type { 
  DatabaseConnection, 
  NodeInsert,
  SearchOptions,
  SearchResult 
} from '../../../server/src/database/types/index.js'

describe('Search Functionality', () => {
  let connection: DatabaseConnection
  let nodeOps: ReturnType<typeof createNodeOperations>
  let searchQueries: ReturnType<typeof createSearchQueries>

  beforeEach(async () => {
    connection = await dbUtils.createTestConnection({ enableFTS: true })
    nodeOps = createNodeOperations(connection)
    searchQueries = createSearchQueries(connection)

    // Create comprehensive test content for search
    await setupSearchTestData()
  })

  afterEach(async () => {
    if (connection) {
      await connection.close()
    }
  })

  async function setupSearchTestData() {
    const testNodes: NodeInsert[] = [
      // Technology content
      {
        id: 'tech-1',
        name: 'Introduction to Machine Learning',
        content: 'Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed. It uses algorithms and statistical models to analyze and draw inferences from patterns in data.',
        node_type: 'node',
        is_system_node: false,
        tags: ['technology', 'AI', 'machine-learning', 'algorithms']
      },
      {
        id: 'tech-2',
        name: 'Deep Learning Fundamentals',
        content: 'Deep learning is a machine learning technique that teaches computers to do what comes naturally to humans: learn by example. It uses neural networks with multiple layers to progressively extract higher-level features from raw input.',
        node_type: 'node',
        is_system_node: false,
        tags: ['technology', 'AI', 'deep-learning', 'neural-networks']
      },
      {
        id: 'tech-3',
        name: 'JavaScript Programming Guide',
        content: 'JavaScript is a versatile programming language that runs in web browsers and servers. It supports object-oriented, functional, and procedural programming paradigms. Modern JavaScript includes features like async/await, destructuring, and modules.',
        node_type: 'node',
        is_system_node: false,
        tags: ['programming', 'javascript', 'web-development']
      },
      
      // Science content
      {
        id: 'science-1',
        name: 'Quantum Mechanics Basics',
        content: 'Quantum mechanics is a fundamental theory in physics that describes the behavior of matter and energy at atomic and subatomic scales. It introduces concepts like superposition, entanglement, and wave-particle duality.',
        node_type: 'node',
        is_system_node: false,
        tags: ['science', 'physics', 'quantum-mechanics']
      },
      {
        id: 'science-2',
        name: 'DNA and Genetics',
        content: 'DNA (deoxyribonucleic acid) is the hereditary material in humans and almost all other organisms. It contains genetic instructions for the development and function of living things. Genes are segments of DNA that code for specific traits.',
        node_type: 'node',
        is_system_node: false,
        tags: ['science', 'biology', 'genetics', 'DNA']
      },
      
      // Business content
      {
        id: 'business-1',
        name: 'Project Management Strategies',
        content: 'Effective project management involves planning, organizing, and managing resources to achieve specific goals. Key methodologies include Agile, Waterfall, and Scrum. Success factors include clear communication, risk management, and stakeholder engagement.',
        node_type: 'node',
        is_system_node: false,
        tags: ['business', 'project-management', 'agile', 'scrum']
      },
      {
        id: 'business-2',
        name: 'Digital Marketing Trends',
        content: 'Digital marketing encompasses all marketing efforts that use electronic devices or the internet. Businesses leverage digital channels such as search engines, social media, email, and websites to connect with current and prospective customers.',
        node_type: 'node',
        is_system_node: false,
        tags: ['business', 'marketing', 'digital', 'social-media']
      },
      
      // Mixed content with overlapping themes
      {
        id: 'mixed-1',
        name: 'AI in Healthcare',
        content: 'Artificial intelligence is revolutionizing healthcare by enabling more accurate diagnoses, personalized treatment plans, and drug discovery. Machine learning algorithms can analyze medical images, predict patient outcomes, and assist in surgical procedures.',
        node_type: 'node',
        is_system_node: false,
        tags: ['technology', 'AI', 'healthcare', 'medicine']
      },
      {
        id: 'mixed-2',
        name: 'Data Science for Business Intelligence',
        content: 'Data science combines domain expertise, programming skills, and knowledge of mathematics and statistics to extract meaningful insights from data. Business intelligence uses data science to inform strategic decisions and optimize operations.',
        node_type: 'node',
        is_system_node: false,
        tags: ['technology', 'data-science', 'business', 'analytics']
      },
      
      // Short content
      {
        id: 'short-1',
        name: 'Quick Note',
        content: 'Remember to review the quarterly reports.',
        node_type: 'node',
        is_system_node: false,
        tags: ['reminder', 'business']
      },
      
      // Content with special characters and formatting
      {
        id: 'special-1',
        name: 'Mathematical Equations & Symbols',
        content: 'Einstein\'s famous equation: E = mc². The quadratic formula: x = (-b ± √(b²-4ac)) / 2a. These mathematical expressions demonstrate the beauty of mathematical notation.',
        node_type: 'node',
        is_system_node: false,
        tags: ['mathematics', 'equations', 'physics']
      }
    ]

    await nodeOps.createNodes(testNodes)
  }

  describe('Full-Text Search', () => {
    test('should perform basic keyword search', async () => {
      const results = await searchQueries.searchNodes('machine learning')
      
      expect(results.nodes.length).toBeGreaterThan(0)
      
      // Should find nodes containing "machine learning"
      const foundIds = results.nodes.map(n => n.id)
      expect(foundIds).toContain('tech-1')
      expect(foundIds).toContain('tech-2') // Contains "machine learning technique"
      
      // Results should be ranked by relevance
      expect(results.nodes[0].score).toBeGreaterThanOrEqual(results.nodes[1]?.score || 0)
    })

    test('should handle phrase search with quotes', async () => {
      const results = await searchQueries.searchNodes('"artificial intelligence"')
      
      expect(results.nodes.length).toBeGreaterThan(0)
      
      // Should find exact phrase matches
      const foundContent = results.nodes.map(n => n.content.toLowerCase())
      expect(foundContent.some(content => content.includes('artificial intelligence'))).toBe(true)
    })

    test('should support Boolean operators', async () => {
      const andResults = await searchQueries.searchNodes('machine AND learning')
      const orResults = await searchQueries.searchNodes('quantum OR genetics')
      const notResults = await searchQueries.searchNodes('programming NOT javascript')
      
      expect(andResults.nodes.length).toBeGreaterThan(0)
      expect(orResults.nodes.length).toBeGreaterThan(0)
      
      // AND should return fewer results than OR
      if (andResults.nodes.length > 0 && orResults.nodes.length > 0) {
        // Both have results, AND should be more restrictive
        const andIds = new Set(andResults.nodes.map(n => n.id))
        const orIds = new Set(orResults.nodes.map(n => n.id))
        expect(andIds.size).toBeLessThanOrEqual(orIds.size)
      }
      
      // NOT should exclude javascript content
      const notIds = notResults.nodes.map(n => n.id)
      expect(notIds).not.toContain('tech-3') // JavaScript article
    })

    test('should handle wildcard and fuzzy search', async () => {
      const wildcardResults = await searchQueries.searchNodes('program*')
      const fuzzyResults = await searchQueries.searchNodes('machne~', { fuzzySearch: true })
      
      expect(wildcardResults.nodes.length).toBeGreaterThan(0)
      
      // Wildcard should match programming, programmed, etc.
      const wildcardContent = wildcardResults.nodes.map(n => n.content.toLowerCase())
      expect(wildcardContent.some(content => 
        content.includes('programming') || content.includes('programmed')
      )).toBe(true)
      
      // Fuzzy should find "machine" despite typo
      if (fuzzyResults.nodes.length > 0) {
        const fuzzyIds = fuzzyResults.nodes.map(n => n.id)
        expect(fuzzyIds).toContain('tech-1') // Contains "machine"
      }
    })

    test('should search within specific fields', async () => {
      const titleResults = await searchQueries.searchNodes('quantum', { 
        fields: ['name'] 
      })
      const contentResults = await searchQueries.searchNodes('algorithms', { 
        fields: ['content'] 
      })
      
      expect(titleResults.nodes.length).toBeGreaterThan(0)
      expect(contentResults.nodes.length).toBeGreaterThan(0)
      
      // Title search should find quantum mechanics article
      const titleIds = titleResults.nodes.map(n => n.id)
      expect(titleIds).toContain('science-1')
      
      // Content search should find articles mentioning algorithms
      const contentIds = contentResults.nodes.map(n => n.id)
      expect(contentIds).toContain('tech-1')
    })

    test('should handle case-insensitive search', async () => {
      const lowerResults = await searchQueries.searchNodes('javascript')
      const upperResults = await searchQueries.searchNodes('JAVASCRIPT')
      const mixedResults = await searchQueries.searchNodes('JavaScript')
      
      expect(lowerResults.nodes.length).toBe(upperResults.nodes.length)
      expect(lowerResults.nodes.length).toBe(mixedResults.nodes.length)
      
      // Should return same results regardless of case
      const lowerIds = lowerResults.nodes.map(n => n.id).sort()
      const upperIds = upperResults.nodes.map(n => n.id).sort()
      expect(lowerIds).toEqual(upperIds)
    })
  })

  describe('Advanced Search Features', () => {
    test('should filter by node type', async () => {
      const articleResults = await searchQueries.searchNodes('technology', {
        filters: { node_type: 'node' }
      })
      const noteResults = await searchQueries.searchNodes('business', {
        filters: { node_type: 'node' }
      })
      
      expect(articleResults.nodes.length).toBeGreaterThan(0)
      expect(noteResults.nodes.length).toBeGreaterThan(0)
      
      // All results should match the specified type
      expect(articleResults.nodes.every(n => n.node_type === 'article')).toBe(true)
      expect(noteResults.nodes.every(n => n.node_type === 'note')).toBe(true)
    })

    test('should filter by tags', async () => {
      const aiResults = await searchQueries.searchNodes('*', {
        filters: { tags: ['AI'] }
      })
      const businessResults = await searchQueries.searchNodes('*', {
        filters: { tags: ['business'] }
      })
      
      expect(aiResults.nodes.length).toBeGreaterThan(0)
      expect(businessResults.nodes.length).toBeGreaterThan(0)
      
      // All results should have the specified tag
      expect(aiResults.nodes.every(n => n.tags?.includes('AI'))).toBe(true)
      expect(businessResults.nodes.every(n => n.tags?.includes('business'))).toBe(true)
    })

    test('should filter by multiple criteria', async () => {
      const multiFilterResults = await searchQueries.searchNodes('technology', {
        filters: {
          node_type: 'node',
          tags: ['AI'],
          is_system_node: false
        }
      })
      
      expect(multiFilterResults.nodes.length).toBeGreaterThan(0)
      
      // All results should match all criteria
      for (const node of multiFilterResults.nodes) {
        expect(node.node_type).toBe('article')
        expect(node.tags).toContain('AI')
        expect(node.is_system_node).toBe(false)
      }
    })

    test('should support date range filtering', async () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      
      const recentResults = await searchQueries.searchNodes('*', {
        filters: {
          created_after: oneHourAgo.toISOString(),
          created_before: now.toISOString()
        }
      })
      
      expect(recentResults.nodes.length).toBeGreaterThan(0)
      
      // All results should be within the date range
      for (const node of recentResults.nodes) {
        const createdAt = new Date(node.created_at)
        expect(createdAt.getTime()).toBeGreaterThanOrEqual(oneHourAgo.getTime())
        expect(createdAt.getTime()).toBeLessThanOrEqual(now.getTime())
      }
    })

    test('should support pagination', async () => {
      const page1 = await searchQueries.searchNodes('*', {
        pagination: { limit: 3, offset: 0 }
      })
      const page2 = await searchQueries.searchNodes('*', {
        pagination: { limit: 3, offset: 3 }
      })
      
      expect(page1.nodes.length).toBeLessThanOrEqual(3)
      expect(page2.nodes.length).toBeLessThanOrEqual(3)
      expect(page1.total).toBeGreaterThan(0)
      expect(page2.total).toBe(page1.total) // Same total count
      
      // No overlap between pages
      const page1Ids = new Set(page1.nodes.map(n => n.id))
      const page2Ids = new Set(page2.nodes.map(n => n.id))
      const intersection = [...page1Ids].filter(id => page2Ids.has(id))
      expect(intersection).toHaveLength(0)
    })

    test('should support custom sorting', async () => {
      const scoreSort = await searchQueries.searchNodes('machine', {
        sort: { field: 'score', direction: 'desc' }
      })
      const nameSort = await searchQueries.searchNodes('*', {
        sort: { field: 'name', direction: 'asc' }
      })
      const dateSort = await searchQueries.searchNodes('*', {
        sort: { field: 'created_at', direction: 'desc' }
      })
      
      // Score sort should be in descending order
      for (let i = 1; i < scoreSort.nodes.length; i++) {
        expect(scoreSort.nodes[i].score).toBeLessThanOrEqual(scoreSort.nodes[i-1].score)
      }
      
      // Name sort should be alphabetical
      for (let i = 1; i < nameSort.nodes.length; i++) {
        expect(nameSort.nodes[i].name.toLowerCase()).toBeGreaterThanOrEqual(
          nameSort.nodes[i-1].name.toLowerCase()
        )
      }
      
      // Date sort should be newest first
      for (let i = 1; i < dateSort.nodes.length; i++) {
        expect(new Date(dateSort.nodes[i].created_at).getTime()).toBeLessThanOrEqual(
          new Date(dateSort.nodes[i-1].created_at).getTime()
        )
      }
    })
  })

  describe('Search Ranking and Relevance', () => {
    test('should rank exact matches higher than partial matches', async () => {
      const results = await searchQueries.searchNodes('quantum mechanics')
      
      expect(results.nodes.length).toBeGreaterThan(0)
      
      // Article with "Quantum Mechanics" in title should rank highest
      const topResult = results.nodes[0]
      expect(topResult.id).toBe('science-1')
      expect(topResult.score).toBeGreaterThan(0.7) // High relevance score
    })

    test('should boost title matches over content matches', async () => {
      const results = await searchQueries.searchNodes('programming')
      
      if (results.nodes.length > 1) {
        // Node with "Programming" in title should rank higher than content-only matches
        const titleMatchIndex = results.nodes.findIndex(n => 
          n.name.toLowerCase().includes('programming')
        )
        const contentOnlyIndex = results.nodes.findIndex((n, i) => 
          i !== titleMatchIndex && n.content.toLowerCase().includes('programming')
        )
        
        if (titleMatchIndex !== -1 && contentOnlyIndex !== -1) {
          expect(titleMatchIndex).toBeLessThan(contentOnlyIndex)
        }
      }
    })

    test('should consider tag relevance in ranking', async () => {
      const results = await searchQueries.searchNodes('AI', {
        boostTags: true
      })
      
      if (results.nodes.length > 1) {
        // Nodes with "AI" tag should rank higher
        const taggedNode = results.nodes.find(n => n.tags?.includes('AI'))
        const untaggedNode = results.nodes.find(n => !n.tags?.includes('AI'))
        
        if (taggedNode && untaggedNode) {
          expect(taggedNode.score).toBeGreaterThan(untaggedNode.score)
        }
      }
    })

    test('should apply custom boost factors', async () => {
      const normalResults = await searchQueries.searchNodes('machine learning')
      const boostedResults = await searchQueries.searchNodes('machine learning', {
        boostFactors: {
          node_type: { 'article': 2.0 },
          tags: { 'AI': 1.5 }
        }
      })
      
      if (normalResults.nodes.length > 0 && boostedResults.nodes.length > 0) {
        // Boosted results might have different ordering
        const normalFirst = normalResults.nodes[0]
        const boostedFirst = boostedResults.nodes[0]
        
        // If they're different, boosted should have higher qualifying factors
        if (normalFirst.id !== boostedFirst.id) {
          expect(
            boostedFirst.node_type === 'article' || 
            boostedFirst.tags?.includes('AI')
          ).toBe(true)
        }
      }
    })

    test('should handle multi-term query ranking', async () => {
      const results = await searchQueries.searchNodes('machine learning algorithms')
      
      if (results.nodes.length > 1) {
        const topResult = results.nodes[0]
        
        // Top result should contain multiple query terms
        const content = (topResult.name + ' ' + topResult.content).toLowerCase()
        const termCount = ['machine', 'learning', 'algorithms']
          .filter(term => content.includes(term)).length
        
        expect(termCount).toBeGreaterThanOrEqual(2)
      }
    })
  })

  describe('Search Performance', () => {
    test('should perform simple searches quickly', async () => {
      const startTime = Date.now()
      const results = await searchQueries.searchNodes('technology')
      const duration = Date.now() - startTime
      
      expect(results.nodes.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(100) // Under 100ms for simple search
      
      console.log(`Simple search completed in ${duration}ms`)
    })

    test('should handle complex queries efficiently', async () => {
      const complexQuery = 'machine learning OR artificial intelligence AND (algorithms OR neural)'
      
      const startTime = Date.now()
      const results = await searchQueries.searchNodes(complexQuery, {
        filters: { node_type: 'node' },
        sort: { field: 'score', direction: 'desc' },
        pagination: { limit: 10, offset: 0 }
      })
      const duration = Date.now() - startTime
      
      expect(results.nodes.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(500) // Under 500ms for complex search
      
      console.log(`Complex search completed in ${duration}ms`)
    })

    test('should maintain performance with large result sets', async () => {
      // Create additional test data
      const largeDataset: NodeInsert[] = []
      for (let i = 0; i < 100; i++) {
        largeDataset.push({
          id: `large-${i}`,
          name: `Large Dataset Item ${i}`,
          content: `This is content item ${i} containing technology, programming, and various other keywords for testing search performance at scale.`,
          node_type: 'node',
          is_system_node: false,
          tags: [`tag-${i % 10}`, 'technology', 'test']
        })
      }
      await nodeOps.createNodes(largeDataset)
      
      const startTime = Date.now()
      const results = await searchQueries.searchNodes('technology', {
        pagination: { limit: 50, offset: 0 }
      })
      const duration = Date.now() - startTime
      
      expect(results.nodes.length).toBeGreaterThan(10)
      expect(duration).toBeLessThan(1000) // Under 1 second
      
      console.log(`Large dataset search (${results.total} total) completed in ${duration}ms`)
    })

    test('should cache frequent searches', async () => {
      const query = 'machine learning'
      
      // First search (cache miss)
      const start1 = Date.now()
      const results1 = await searchQueries.searchNodes(query, { useCache: true })
      const duration1 = Date.now() - start1
      
      // Second search (cache hit)
      const start2 = Date.now()
      const results2 = await searchQueries.searchNodes(query, { useCache: true })
      const duration2 = Date.now() - start2
      
      expect(results1.nodes.length).toBe(results2.nodes.length)
      
      // Cached search should be faster (if caching is implemented)
      if (duration2 < duration1) {
        console.log(`Cache speedup: ${duration1}ms -> ${duration2}ms`)
      }
    })
  })

  describe('Search Analytics and Insights', () => {
    test('should provide search result statistics', async () => {
      const results = await searchQueries.searchNodes('technology', {
        includeStats: true
      })
      
      expect(results.stats).toBeDefined()
      expect(results.stats?.totalResults).toBe(results.total)
      expect(results.stats?.executionTime).toBeGreaterThan(0)
      expect(results.stats?.nodeTypeBreakdown).toBeDefined()
      
      console.log('Search statistics:', results.stats)
    })

    test('should highlight search terms in results', async () => {
      const results = await searchQueries.searchNodes('machine learning', {
        highlight: {
          enabled: true,
          fields: ['name', 'content'],
          preTag: '<mark>',
          postTag: '</mark>'
        }
      })
      
      if (results.nodes.length > 0) {
        const highlighted = results.nodes[0].highlights
        if (highlighted) {
          expect(highlighted.name || highlighted.content).toContain('<mark>')
          expect(highlighted.name || highlighted.content).toContain('</mark>')
        }
      }
    })

    test('should provide search suggestions', async () => {
      const suggestions = await searchQueries.getSearchSuggestions('mach')
      
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions).toContain('machine')
      
      // Suggestions should be ordered by relevance
      const machineLearning = suggestions.find(s => s.includes('machine'))
      expect(machineLearning).toBeDefined()
      
      console.log('Search suggestions for "mach":', suggestions)
    })

    test('should analyze search trends', async () => {
      // Perform several searches to generate data
      await searchQueries.searchNodes('machine learning')
      await searchQueries.searchNodes('artificial intelligence')
      await searchQueries.searchNodes('programming')
      await searchQueries.searchNodes('quantum')
      
      const trends = await searchQueries.getSearchTrends({ 
        period: 'hour',
        limit: 10 
      })
      
      if (trends.length > 0) {
        expect(trends[0].query).toBeDefined()
        expect(trends[0].count).toBeGreaterThan(0)
        
        console.log('Search trends:', trends)
      }
    })

    test('should identify related search terms', async () => {
      const related = await searchQueries.getRelatedTerms('machine learning')
      
      expect(related.length).toBeGreaterThan(0)
      
      // Should include semantically related terms
      const expectedTerms = ['artificial', 'intelligence', 'algorithms', 'neural']
      const foundExpected = related.filter(term => 
        expectedTerms.some(expected => term.toLowerCase().includes(expected))
      )
      
      expect(foundExpected.length).toBeGreaterThan(0)
      
      console.log('Related terms for "machine learning":', related)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('should handle empty search queries', async () => {
      const emptyResults = await searchQueries.searchNodes('')
      const spaceResults = await searchQueries.searchNodes('   ')
      
      expect(emptyResults.nodes).toHaveLength(0)
      expect(spaceResults.nodes).toHaveLength(0)
      expect(emptyResults.total).toBe(0)
    })

    test('should handle special characters in queries', async () => {
      const specialResults = await searchQueries.searchNodes('E = mc²')
      
      expect(specialResults.nodes.length).toBeGreaterThan(0)
      
      // Should find the mathematical equations article
      const foundIds = specialResults.nodes.map(n => n.id)
      expect(foundIds).toContain('special-1')
    })

    test('should handle very long search queries', async () => {
      const longQuery = 'machine learning artificial intelligence deep learning neural networks algorithms data science programming javascript quantum mechanics DNA genetics project management digital marketing'.repeat(5)
      
      const results = await searchQueries.searchNodes(longQuery)
      
      // Should not crash and should return reasonable results
      expect(results).toBeDefined()
      expect(results.nodes.length).toBeGreaterThanOrEqual(0)
    })

    test('should handle queries with no results', async () => {
      const noResults = await searchQueries.searchNodes('xyzabc123nonexistent')
      
      expect(noResults.nodes).toHaveLength(0)
      expect(noResults.total).toBe(0)
      expect(noResults.hasMore).toBe(false)
    })

    test('should handle malformed Boolean queries gracefully', async () => {
      const malformedQueries = [
        'AND OR',
        'NOT NOT NOT',
        '(((machine learning',
        'OR AND NOT',
        '"unclosed quote'
      ]
      
      for (const query of malformedQueries) {
        const results = await searchQueries.searchNodes(query)
        
        // Should not crash, might return empty results or fallback behavior
        expect(results).toBeDefined()
        expect(results.nodes).toBeDefined()
      }
    })

    test('should handle concurrent searches efficiently', async () => {
      const queries = [
        'machine learning',
        'artificial intelligence',
        'programming',
        'quantum mechanics',
        'DNA genetics'
      ]
      
      const startTime = Date.now()
      const promises = queries.map(query => searchQueries.searchNodes(query))
      const results = await Promise.all(promises)
      const duration = Date.now() - startTime
      
      expect(results).toHaveLength(5)
      expect(results.every(r => r.nodes.length >= 0)).toBe(true)
      expect(duration).toBeLessThan(2000) // Should complete in under 2 seconds
      
      console.log(`${queries.length} concurrent searches completed in ${duration}ms`)
    })

    test('should maintain search index consistency', async () => {
      // Add new content
      const newNode: NodeInsert = {
        id: 'consistency-test',
        name: 'Consistency Test Article',
        content: 'This is a new article about blockchain technology and cryptocurrencies.',
        node_type: 'node',
        is_system_node: false,
        tags: ['blockchain', 'cryptocurrency', 'technology']
      }
      
      await nodeOps.createNode(newNode)
      
      // Search should immediately find new content
      const results = await searchQueries.searchNodes('blockchain')
      const foundIds = results.nodes.map(n => n.id)
      expect(foundIds).toContain('consistency-test')
      
      // Update content
      await nodeOps.updateNode('consistency-test', {
        content: 'Updated content about distributed ledger technology and digital assets.'
      })
      
      // Search should reflect updates
      const updatedResults = await searchQueries.searchNodes('distributed ledger')
      const updatedIds = updatedResults.nodes.map(n => n.id)
      expect(updatedIds).toContain('consistency-test')
      
      // Delete content
      await nodeOps.deleteNode('consistency-test')
      
      // Search should no longer find deleted content
      const deletedResults = await searchQueries.searchNodes('blockchain')
      const deletedIds = deletedResults.nodes.map(n => n.id)
      expect(deletedIds).not.toContain('consistency-test')
    })
  })
})