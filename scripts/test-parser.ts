#!/usr/bin/env bun
/**
 * Test script for the Tana JSON parser
 * Usage: bun run scripts/test-parser.ts [file-path] [preset]
 */

import { parseFileWithProgress } from '../server/src/parser'
import { getParserPreset, ParserPreset } from '../server/src/parser/config'
import { formatProgress } from '../server/src/parser/utils/progress'

async function main() {
  const args = process.argv.slice(2)
  const filePath = args[0]
  const preset = (args[1] as ParserPreset) || 'BALANCED'
  
  if (!filePath) {
    console.error('Usage: bun run scripts/test-parser.ts <file-path> [preset]')
    console.error('Presets: FAST, BALANCED, THOROUGH, MEMORY_EFFICIENT')
    process.exit(1)
  }
  
  console.log(`🚀 Starting Tana JSON Parser`)
  console.log(`📁 File: ${filePath}`)
  console.log(`⚙️  Preset: ${preset}`)
  console.log(`🔄 Starting parse...`)
  console.log()
  
  const startTime = Date.now()
  
  try {
    // Create parser with selected preset
    const options = getParserPreset(preset)
    
    // Add custom progress callback for detailed output
    options.progressCallback = (progress) => {
      const formatted = formatProgress(progress)
      console.log(`[${new Date().toISOString()}] ${formatted}`)
    }
    
    // Parse the file
    const result = await parseFileWithProgress(filePath, options)
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    console.log()
    console.log(`✅ Parse completed in ${duration}ms`)
    console.log()
    console.log('📊 Final Statistics:')
    console.log(`   Total nodes found: ${result.statistics.totalNodes}`)
    console.log(`   Processed: ${result.statistics.processedNodes}`)
    console.log(`   Skipped: ${result.statistics.skippedNodes}`)
    console.log(`   System nodes: ${result.statistics.systemNodes}`)
    console.log(`   Errors: ${result.statistics.errors}`)
    console.log(`   Duration: ${result.statistics.duration}ms`)
    console.log(`   Peak memory: ${result.statistics.memoryPeak}MB`)
    console.log()
    
    if (result.errors.length > 0) {
      console.log('⚠️  Errors encountered:')
      result.errors.slice(0, 5).forEach((error, i) => {
        console.log(`   ${i + 1}. ${error.message}`)
      })
      if (result.errors.length > 5) {
        console.log(`   ... and ${result.errors.length - 5} more errors`)
      }
      console.log()
    }
    
    // Show sample of parsed nodes
    const nodes = result.nodes || []
    if (nodes.length > 0) {
      console.log('📝 Sample nodes:')
      nodes.slice(0, 3).forEach((node, i) => {
        console.log(`   ${i + 1}. ${node.name} (${node.id})`)
        console.log(`      Type: ${node.type}, Created: ${node.created.toISOString()}`)
        console.log(`      Children: ${node.children.length}, References: ${node.references.length}`)
        if (node.content && node.content !== node.name) {
          console.log(`      Content: ${node.content.substring(0, 100)}${node.content.length > 100 ? '...' : ''}`)
        }
      })
      if (nodes.length > 3) {
        console.log(`   ... and ${nodes.length - 3} more nodes`)
      }
    }
    
  } catch (error) {
    console.error()
    console.error('❌ Parse failed:')
    console.error(error instanceof Error ? error.message : 'Unknown error')
    
    if (error instanceof Error && error.stack) {
      console.error()
      console.error('Stack trace:')
      console.error(error.stack)
    }
    
    process.exit(1)
  }
}

// Run if this script is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  main().catch(console.error)
} else if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}