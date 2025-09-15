/**
 * Test data generator for parser integration tests
 * Generates various sizes and types of Tana export files for testing
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { RawTanaNode } from '../../server/src/parser/types'

export interface TestDataConfig {
  nodeCount: number
  systemNodeRatio: number // 0.0 to 1.0
  maxChildren: number
  maxRefs: number
  contentLength: number
  malformedRatio: number // 0.0 to 1.0
}

export const TEST_CONFIGS = {
  SMALL: {
    nodeCount: 100,
    systemNodeRatio: 0.1,
    maxChildren: 5,
    maxRefs: 3,
    contentLength: 500,
    malformedRatio: 0
  } as TestDataConfig,
  
  MEDIUM: {
    nodeCount: 10000,
    systemNodeRatio: 0.15,
    maxChildren: 10,
    maxRefs: 5,
    contentLength: 1000,
    malformedRatio: 0
  } as TestDataConfig,
  
  LARGE: {
    nodeCount: 100000,
    systemNodeRatio: 0.2,
    maxChildren: 15,
    maxRefs: 8,
    contentLength: 2000,
    malformedRatio: 0
  } as TestDataConfig,
  
  HUGE: {
    nodeCount: 1000000,
    systemNodeRatio: 0.25,
    maxChildren: 20,
    maxRefs: 10,
    contentLength: 1500,
    malformedRatio: 0
  } as TestDataConfig,
  
  MALFORMED: {
    nodeCount: 1000,
    systemNodeRatio: 0.1,
    maxChildren: 5,
    maxRefs: 3,
    contentLength: 500,
    malformedRatio: 0.1
  } as TestDataConfig
}

/**
 * Generate a realistic Tana node
 */
function generateNode(id: string, config: TestDataConfig, allNodeIds: string[]): RawTanaNode {
  const isSystemNode = Math.random() < config.systemNodeRatio
  const nodeType = Math.random() < 0.8 ? 'node' : Math.random() < 0.5 ? 'field' : 'reference'
  
  // Generate realistic content
  const wordCount = Math.floor(Math.random() * (config.contentLength / 5)) + 1
  const words = [
    'knowledge', 'research', 'project', 'task', 'meeting', 'note', 'idea',
    'analysis', 'documentation', 'planning', 'strategy', 'implementation',
    'review', 'feedback', 'collaboration', 'development', 'testing', 'deployment'
  ]
  
  const name = Array.from({ length: Math.min(wordCount, 10) }, () => 
    words[Math.floor(Math.random() * words.length)]
  ).join(' ')
  
  const content = Array.from({ length: wordCount }, () => 
    words[Math.floor(Math.random() * words.length)]
  ).join(' ')
  
  // Generate children references
  const childrenCount = Math.floor(Math.random() * config.maxChildren)
  const children = Array.from({ length: childrenCount }, () => 
    allNodeIds[Math.floor(Math.random() * allNodeIds.length)]
  ).filter(Boolean)
  
  // Generate refs
  const refsCount = Math.floor(Math.random() * config.maxRefs)
  const refs = Array.from({ length: refsCount }, () => 
    allNodeIds[Math.floor(Math.random() * allNodeIds.length)]
  ).filter(Boolean)
  
  const node: RawTanaNode = {
    id,
    name,
    created: Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000), // Random date within last year
    type: nodeType,
    children: [...new Set(children)], // Remove duplicates
    refs: [...new Set(refs)], // Remove duplicates
    props: {
      content,
      tags: Math.random() < 0.3 ? ['important', 'review', 'todo'].slice(0, Math.floor(Math.random() * 3) + 1) : undefined
    },
    sys: isSystemNode
  }
  
  // Add system-specific fields
  if (isSystemNode) {
    node.docType = 'sys'
    node.ownerId = 'system'
    node.uid = `sys_${id}`
  } else {
    node.docType = Math.random() < 0.5 ? 'document' : 'note'
    node.ownerId = `user_${Math.floor(Math.random() * 100)}`
  }
  
  return node
}

/**
 * Generate malformed JSON for testing error handling
 */
function generateMalformedNode(id: string): string {
  const malformations = [
    `{"id":"${id}","name":"broken node","created":${Date.now()},`, // Missing closing brace
    `{"id":"${id}","name":"broken node"created":${Date.now()}}`, // Missing comma
    `{"id":"${id}","name":broken node","created":${Date.now()}}`, // Unquoted string
    `{"id":"${id}","name":"broken node","created":"not-a-number"}`, // Invalid number
    `{"id":"${id}","name":"broken node","children":[}`, // Invalid array
  ]
  
  return malformations[Math.floor(Math.random() * malformations.length)]
}

/**
 * Generate a complete Tana export file
 */
export function generateTestFile(config: TestDataConfig, outputPath: string): void {
  console.log(`Generating test file with ${config.nodeCount} nodes at ${outputPath}`)
  
  // Generate node IDs first
  const nodeIds = Array.from({ length: config.nodeCount }, (_, i) => `node_${i + 1}`)
  
  // Generate nodes
  const nodes: string[] = []
  const malformedCount = Math.floor(config.nodeCount * config.malformedRatio)
  
  for (let i = 0; i < config.nodeCount; i++) {
    const nodeId = nodeIds[i]
    
    if (i < malformedCount) {
      // Generate malformed node
      nodes.push(generateMalformedNode(nodeId))
    } else {
      // Generate valid node
      const node = generateNode(nodeId, config, nodeIds)
      nodes.push(JSON.stringify(node))
    }
  }
  
  // Create the complete export structure
  const exportData = {
    version: "1.0",
    exported: new Date().toISOString(),
    nodes: `__NODES_PLACEHOLDER__`
  }
  
  let jsonString = JSON.stringify(exportData, null, 2)
  // Replace placeholder with actual nodes array (to avoid memory issues with large datasets)
  const nodesString = '[\n    ' + nodes.join(',\n    ') + '\n  ]'
  jsonString = jsonString.replace('"__NODES_PLACEHOLDER__"', nodesString)
  
  // Ensure output directory exists
  mkdirSync(join(outputPath, '..'), { recursive: true })
  
  // Write file
  writeFileSync(outputPath, jsonString, 'utf8')
  
  console.log(`Generated test file: ${outputPath}`)
  console.log(`  - Nodes: ${config.nodeCount}`)
  console.log(`  - System nodes: ~${Math.floor(config.nodeCount * config.systemNodeRatio)}`)
  console.log(`  - Malformed: ${malformedCount}`)
  console.log(`  - File size: ~${Math.round(jsonString.length / 1024 / 1024)}MB`)
}

/**
 * Generate all test files for different scenarios
 */
export function generateAllTestFiles(testDataDir: string = 'tests/data'): void {
  Object.entries(TEST_CONFIGS).forEach(([name, config]) => {
    const filename = `test-data-${name.toLowerCase()}.json`
    const filepath = join(testDataDir, filename)
    generateTestFile(config, filepath)
  })
}

/**
 * Generate a streaming test file (writes directly to avoid memory issues)
 */
export function generateStreamingTestFile(
  config: TestDataConfig, 
  outputPath: string,
  progressCallback?: (progress: number, total: number) => void
): void {
  console.log(`Generating streaming test file with ${config.nodeCount} nodes`)
  
  // Ensure output directory exists
  mkdirSync(join(outputPath, '..'), { recursive: true })
  
  // Generate node IDs first (for referencing)
  const nodeIds = Array.from({ length: Math.min(config.nodeCount, 10000) }, (_, i) => `node_${i + 1}`)
  
  // Write file header
  const header = `{
  "version": "1.0",
  "exported": "${new Date().toISOString()}",
  "nodes": [
`
  
  writeFileSync(outputPath, header, 'utf8')
  
  // Stream write nodes
  const batchSize = 1000
  for (let i = 0; i < config.nodeCount; i += batchSize) {
    const endIndex = Math.min(i + batchSize, config.nodeCount)
    const nodes: string[] = []
    
    for (let j = i; j < endIndex; j++) {
      const nodeId = `node_${j + 1}`
      
      if (Math.random() < config.malformedRatio) {
        nodes.push(generateMalformedNode(nodeId))
      } else {
        const node = generateNode(nodeId, config, nodeIds)
        nodes.push(JSON.stringify(node))
      }
    }
    
    const isLastBatch = endIndex >= config.nodeCount
    const nodeString = nodes.map((node, idx) => {
      const prefix = i === 0 && idx === 0 ? '    ' : '    '
      const suffix = isLastBatch && idx === nodes.length - 1 ? '' : ','
      return `${prefix}${node}${suffix}`
    }).join('\n')
    
    writeFileSync(outputPath, nodeString + '\n', { flag: 'a' })
    
    if (progressCallback) {
      progressCallback(endIndex, config.nodeCount)
    }
  }
  
  // Write footer
  const footer = `  ]
}`
  writeFileSync(outputPath, footer, { flag: 'a' })
  
  console.log(`Generated streaming test file: ${outputPath}`)
}

// CLI interface for generating test data
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const configName = args[0]?.toUpperCase() || 'ALL'
  const outputDir = args[1] || 'tests/data'
  
  if (configName === 'ALL') {
    generateAllTestFiles(outputDir)
  } else if (TEST_CONFIGS[configName as keyof typeof TEST_CONFIGS]) {
    const config = TEST_CONFIGS[configName as keyof typeof TEST_CONFIGS]
    const filename = `test-data-${configName.toLowerCase()}.json`
    const filepath = join(outputDir, filename)
    generateTestFile(config, filepath)
  } else {
    console.error(`Unknown config: ${configName}`)
    console.error('Available configs:', Object.keys(TEST_CONFIGS).join(', '))
    process.exit(1)
  }
}