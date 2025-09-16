#!/usr/bin/env bun
/**
 * Database Performance Benchmark Runner
 * 
 * Dedicated tool for running performance benchmarks and validating
 * against the project requirements.
 * 
 * Usage:
 *   bun run benchmark              # Run all benchmarks
 *   bun run benchmark --quick      # Run quick validation benchmarks
 *   bun run benchmark --full       # Run comprehensive benchmarks
 *   bun run benchmark --compare    # Compare with baseline
 */

import { initializeDatabase, getDatabase } from '../server/src/database/index.js'
import { createDatabaseOperations } from '../server/src/database/operations/index.js'
import type { TanaNode } from '../server/src/parser/types/index.js'

interface BenchmarkOptions {
  quick?: boolean
  full?: boolean
  compare?: boolean
  help?: boolean
  nodes?: number
}

interface BenchmarkResult {
  name: string
  duration: number
  throughput?: number
  memoryUsage: number
  success: boolean
  error?: string
  details?: any
}

interface PerformanceRequirements {
  nodeInsertionTime: number // <1ms per node (batch mode)
  relationshipQueryTime: number // <10ms for typical patterns
  importSpeed: number // >1000 nodes/second
  memoryUsage: number // <50MB during 1M node import
  traversalTime: number // <100ms for 1000-node subgraph
}

const REQUIREMENTS: PerformanceRequirements = {
  nodeInsertionTime: 1, // ms
  relationshipQueryTime: 10, // ms
  importSpeed: 1000, // nodes/sec
  memoryUsage: 50, // MB
  traversalTime: 100 // ms
}

function parseArgs(): BenchmarkOptions {
  const args = process.argv.slice(2)
  return {
    quick: args.includes('--quick') || args.includes('-q'),
    full: args.includes('--full') || args.includes('-f'),
    compare: args.includes('--compare') || args.includes('-c'),
    help: args.includes('--help') || args.includes('-h'),
    nodes: parseInt(args.find(arg => arg.startsWith('--nodes='))?.split('=')[1] || '1000')
  }
}

function showHelp() {
  console.log(`
Database Performance Benchmark Runner

Usage:
  bun run benchmark [options]

Options:
  --quick, -q       Run quick validation benchmarks (1K nodes)
  --full, -f        Run comprehensive benchmarks (10K+ nodes) 
  --compare, -c     Compare results with performance requirements
  --nodes=N         Specify number of nodes for testing (default: 1000)
  --help, -h        Show this help message

Performance Requirements:
  Node insertion:    <${REQUIREMENTS.nodeInsertionTime}ms per node (batch mode)
  Relationship query: <${REQUIREMENTS.relationshipQueryTime}ms for typical patterns  
  Import speed:      >${REQUIREMENTS.importSpeed} nodes/second
  Memory usage:      <${REQUIREMENTS.memoryUsage}MB during import
  Graph traversal:   <${REQUIREMENTS.traversalTime}ms for 1000-node subgraph

Examples:
  bun run benchmark                  # Standard benchmarks
  bun run benchmark --quick          # Quick validation
  bun run benchmark --full           # Comprehensive testing
  bun run benchmark --nodes=5000     # Test with 5K nodes
`)
}

function getMemoryUsage(): number {
  return process.memoryUsage().heapUsed / (1024 * 1024) // MB
}

function generateTestNodes(count: number): TanaNode[] {
  const nodes: TanaNode[] = []
  
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: `node_${i}`,
      name: `Test Node ${i}`,
      content: `This is the content for test node ${i}. It contains some text for search testing.`,
      created: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
      docType: i % 3 === 0 ? 'note' : i % 3 === 1 ? 'project' : 'task',
      ownerId: i < count / 2 ? `owner_${Math.floor(i / 10)}` : null,
      children: i < count - 10 ? [`node_${i + 1}`, `node_${i + 2}`] : [],
      references: i > 0 ? [`node_${Math.floor(Math.random() * i)}`] : [],
      fields: {
        priority: Math.floor(Math.random() * 5) + 1,
        tags: [`tag_${i % 10}`, `category_${i % 5}`],
        metadata: { source: 'benchmark', index: i }
      },
      type: 'node' as const,
      isSystemNode: false
    })
  }
  
  return nodes
}

async function runBenchmark(name: string, fn: () => Promise<any>): Promise<BenchmarkResult> {
  const startMemory = getMemoryUsage()
  const startTime = performance.now()
  
  try {
    const result = await fn()
    const endTime = performance.now()
    const endMemory = getMemoryUsage()
    
    return {
      name,
      duration: endTime - startTime,
      memoryUsage: endMemory - startMemory,
      success: true,
      details: result
    }
  } catch (error) {
    const endTime = performance.now()
    const endMemory = getMemoryUsage()
    
    return {
      name,
      duration: endTime - startTime,
      memoryUsage: endMemory - startMemory,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function benchmarkNodeInsertion(ops: any, nodeCount: number): Promise<BenchmarkResult> {
  return runBenchmark(`Node Insertion (${nodeCount} nodes)`, async () => {
    const nodes = generateTestNodes(nodeCount)
    const result = await ops.batch.importTanaNodes(nodes)
    
    return {
      throughput: nodeCount / (result.duration / 1000),
      avgTimePerNode: result.duration / nodeCount,
      totalNodes: nodeCount
    }
  })
}

async function benchmarkRelationshipQueries(ops: any): Promise<BenchmarkResult> {
  return runBenchmark('Relationship Queries', async () => {
    // Test various relationship query patterns
    const results = []
    
    // Get children of a node
    const childrenStart = performance.now()
    const children = await ops.edges.getChildren('node_0')
    const childrenTime = performance.now() - childrenStart
    results.push({ query: 'getChildren', time: childrenTime, count: children.length })
    
    // Get parents of a node  
    const parentsStart = performance.now()
    const parents = await ops.edges.getParents('node_10')
    const parentsTime = performance.now() - parentsStart
    results.push({ query: 'getParents', time: parentsTime, count: parents.length })
    
    // Get references
    const refsStart = performance.now()
    const refs = await ops.references.getReferences('node_5')
    const refsTime = performance.now() - refsStart
    results.push({ query: 'getReferences', time: refsTime, count: refs.length })
    
    return {
      queries: results,
      avgQueryTime: results.reduce((sum, r) => sum + r.time, 0) / results.length,
      maxQueryTime: Math.max(...results.map(r => r.time))
    }
  })
}

async function benchmarkGraphTraversal(ops: any): Promise<BenchmarkResult> {
  return runBenchmark('Graph Traversal', async () => {
    const traversalStart = performance.now()
    const subgraph = await ops.graph.breadthFirstTraversal('node_0', { maxDepth: 5 })
    const traversalTime = performance.now() - traversalStart
    
    return {
      traversalTime,
      nodesTraversed: subgraph.nodes.length,
      maxDepth: 5,
      avgTimePerNode: traversalTime / subgraph.nodes.length
    }
  })
}

async function benchmarkSearch(ops: any): Promise<BenchmarkResult> {
  return runBenchmark('Search Operations', async () => {
    const searches = [
      'test content',
      'node project',
      'priority:5',
      'tag_1 OR tag_2'
    ]
    
    const results = []
    for (const query of searches) {
      const searchStart = performance.now()
      const searchResults = await ops.search.fullTextSearch(query)
      const searchTime = performance.now() - searchStart
      
      results.push({
        query,
        time: searchTime,
        resultCount: searchResults.nodes.length
      })
    }
    
    return {
      searches: results,
      avgSearchTime: results.reduce((sum, r) => sum + r.time, 0) / results.length,
      totalSearches: results.length
    }
  })
}

function validateRequirements(results: BenchmarkResult[]): void {
  console.log('\n📊 Performance Requirements Validation')
  console.log('=====================================')
  
  const insertionResult = results.find(r => r.name.includes('Node Insertion'))
  const relationshipResult = results.find(r => r.name.includes('Relationship'))
  const traversalResult = results.find(r => r.name.includes('Graph Traversal'))
  
  // Node insertion performance
  if (insertionResult?.details?.avgTimePerNode) {
    const avgTime = insertionResult.details.avgTimePerNode
    const passed = avgTime < REQUIREMENTS.nodeInsertionTime
    console.log(`Node insertion: ${avgTime.toFixed(3)}ms/node ${passed ? '✅' : '❌'} (req: <${REQUIREMENTS.nodeInsertionTime}ms)`)
  }
  
  // Import speed
  if (insertionResult?.details?.throughput) {
    const throughput = insertionResult.details.throughput
    const passed = throughput > REQUIREMENTS.importSpeed
    console.log(`Import speed: ${throughput.toFixed(0)} nodes/sec ${passed ? '✅' : '❌'} (req: >${REQUIREMENTS.importSpeed})`)
  }
  
  // Relationship query time
  if (relationshipResult?.details?.avgQueryTime) {
    const avgTime = relationshipResult.details.avgQueryTime
    const passed = avgTime < REQUIREMENTS.relationshipQueryTime
    console.log(`Relationship queries: ${avgTime.toFixed(2)}ms ${passed ? '✅' : '❌'} (req: <${REQUIREMENTS.relationshipQueryTime}ms)`)
  }
  
  // Memory usage
  const maxMemory = Math.max(...results.map(r => r.memoryUsage))
  const memoryPassed = maxMemory < REQUIREMENTS.memoryUsage
  console.log(`Memory usage: ${maxMemory.toFixed(2)}MB ${memoryPassed ? '✅' : '❌'} (req: <${REQUIREMENTS.memoryUsage}MB)`)
  
  // Graph traversal
  if (traversalResult?.details?.traversalTime) {
    const traversalTime = traversalResult.details.traversalTime
    const passed = traversalTime < REQUIREMENTS.traversalTime
    console.log(`Graph traversal: ${traversalTime.toFixed(2)}ms ${passed ? '✅' : '❌'} (req: <${REQUIREMENTS.traversalTime}ms)`)
  }
}

function printResults(results: BenchmarkResult[]): void {
  console.log('\n🏆 Benchmark Results')
  console.log('==================')
  
  for (const result of results) {
    console.log(`\n📈 ${result.name}`)
    console.log('─'.repeat(50))
    
    if (result.success) {
      console.log(`Duration: ${result.duration.toFixed(2)}ms`)
      console.log(`Memory: ${result.memoryUsage.toFixed(2)}MB`)
      
      if (result.details?.throughput) {
        console.log(`Throughput: ${result.details.throughput.toFixed(0)} ops/sec`)
      }
      
      if (result.details?.avgTimePerNode) {
        console.log(`Avg time per node: ${result.details.avgTimePerNode.toFixed(3)}ms`)
      }
      
      if (result.details?.nodesTraversed) {
        console.log(`Nodes traversed: ${result.details.nodesTraversed}`)
      }
    } else {
      console.log(`❌ Failed: ${result.error}`)
    }
  }
}

async function main() {
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  try {
    console.log('🚀 Starting Database Performance Benchmarks')
    console.log('==========================================')
    
    // Initialize database
    const db = await initializeDatabase()
    
    const ops = createDatabaseOperations(db)
    
    // Determine test scale
    const nodeCount = options.quick ? 1000 : options.full ? 10000 : options.nodes
    console.log(`Test scale: ${nodeCount.toLocaleString()} nodes`)
    
    const results: BenchmarkResult[] = []
    
    // Run benchmarks
    console.log('\n⚡ Running benchmarks...')
    
    results.push(await benchmarkNodeInsertion(ops, nodeCount))
    results.push(await benchmarkRelationshipQueries(ops))
    results.push(await benchmarkGraphTraversal(ops))
    results.push(await benchmarkSearch(ops))
    
    // Print results
    printResults(results)
    
    // Validate against requirements
    if (options.compare) {
      validateRequirements(results)
    }
    
    // Summary
    const successCount = results.filter(r => r.success).length
    const totalTime = results.reduce((sum, r) => sum + r.duration, 0)
    const totalMemory = results.reduce((sum, r) => sum + r.memoryUsage, 0)
    
    console.log('\n📋 Summary')
    console.log('==========')
    console.log(`Successful benchmarks: ${successCount}/${results.length}`)
    console.log(`Total time: ${totalTime.toFixed(2)}ms`)
    console.log(`Total memory: ${totalMemory.toFixed(2)}MB`)
    
    if (successCount === results.length) {
      console.log('🎉 All benchmarks completed successfully!')
    } else {
      console.log('⚠️  Some benchmarks failed - check implementation')
      process.exit(1)
    }
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error)
    process.exit(1)
  }
}

// Self-executing script
if (import.meta.main) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  })
}