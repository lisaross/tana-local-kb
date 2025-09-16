#!/usr/bin/env bun
/**
 * Database Inspection Script
 * 
 * Provides CLI interface for inspecting database schema and data.
 * Usage:
 *   bun run db:inspect           # Show database overview
 *   bun run db:inspect --schema  # Show detailed schema
 *   bun run db:inspect --stats   # Show table statistics
 *   bun run db:inspect --health  # Show database health
 */

import { initializeDatabase, getDatabase } from '../server/src/database/index.js'

interface InspectOptions {
  schema?: boolean
  stats?: boolean
  health?: boolean
  help?: boolean
}

function parseArgs(): InspectOptions {
  const args = process.argv.slice(2)
  return {
    schema: args.includes('--schema') || args.includes('-s'),
    stats: args.includes('--stats') || args.includes('--statistics'),
    health: args.includes('--health') || args.includes('-H'),
    help: args.includes('--help') || args.includes('-h')
  }
}

function showHelp() {
  console.log(`
Database Inspection Tool

Usage:
  bun run db:inspect [options]

Options:
  --schema, -s      Show detailed database schema
  --stats           Show table statistics and counts
  --health, -H      Show database health and performance metrics
  --help, -h        Show this help message

Examples:
  bun run db:inspect              # Database overview
  bun run db:inspect --schema     # Detailed schema information
  bun run db:inspect --stats      # Table statistics
  bun run db:inspect --health     # Performance and health metrics
`)
}

async function showOverview(db: any) {
  console.log('📊 Database Overview')
  console.log('===================')
  
  // Get database file info
  const dbPath = db.filename
  console.log(`Database file: ${dbPath}`)
  
  try {
    const stat = await Bun.file(dbPath).stat()
    console.log(`File size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`)
    console.log(`Last modified: ${stat.mtime.toISOString()}`)
  } catch (error) {
    console.log('File size: In-memory database')
  }
  
  // Get table list
  const tables = db.query(`
    SELECT name, type 
    FROM sqlite_master 
    WHERE type IN ('table', 'view') 
    AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `)
  
  console.log(`\nTables: ${tables.filter((t: any) => t.type === 'table').length}`)
  console.log(`Views: ${tables.filter((t: any) => t.type === 'view').length}`)
  
  // Get basic counts
  const mainTables = ['nodes', 'node_hierarchy', 'node_references']
  for (const table of mainTables) {
    if (tables.some((t: any) => t.name === table)) {
      const count = db.query(`SELECT COUNT(*) as count FROM ${table}`)[0] as { count: number }
      console.log(`${table}: ${count.count.toLocaleString()} records`)
    }
  }
}

async function showSchema(db: any) {
  console.log('🏗️  Database Schema')
  console.log('=================')
  
  // Get all tables and their schema
  const tables = db.query(`
    SELECT name, sql 
    FROM sqlite_master 
    WHERE type = 'table' 
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `)
  
  for (const table of tables) {
    console.log(`\n📋 Table: ${table.name}`)
    console.log('─'.repeat(50))
    
    // Get column information
    const columns = db.query(`PRAGMA table_info(${table.name})`)
    
    console.log('Columns:')
    columns.forEach((col: any) => {
      const nullable = col.notnull ? 'NOT NULL' : 'NULL'
      const pk = col.pk ? ' (PRIMARY KEY)' : ''
      const defaultVal = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''
      console.log(`  ${col.name}: ${col.type} ${nullable}${defaultVal}${pk}`)
    })
    
    // Get foreign keys
    const foreignKeys = db.query(`PRAGMA foreign_key_list(${table.name})`)
    if (foreignKeys.length > 0) {
      console.log('Foreign Keys:')
      foreignKeys.forEach((fk: any) => {
        console.log(`  ${fk.from} → ${fk.table}.${fk.to}`)
      })
    }
    
    // Get indexes
    const indexes = db.query(`PRAGMA index_list(${table.name})`)
    if (indexes.length > 0) {
      console.log('Indexes:')
      indexes.forEach((idx: any) => {
        const unique = idx.unique ? ' (UNIQUE)' : ''
        console.log(`  ${idx.name}${unique}`)
      })
    }
  }
}

async function showStats(db: any) {
  console.log('📈 Table Statistics')
  console.log('==================')
  
  const tables = db.query(`
    SELECT name 
    FROM sqlite_master 
    WHERE type = 'table' 
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `)
  
  for (const table of tables) {
    console.log(`\n📊 ${table.name}`)
    console.log('─'.repeat(30))
    
    // Row count
    const count = db.query(`SELECT COUNT(*) as count FROM ${table.name}`)[0] as { count: number }
    console.log(`Rows: ${count.count.toLocaleString()}`)
    
    // Table size (approximate)
    try {
      const sizeQuery = db.query(`
        SELECT 
          page_count * page_size as size,
          page_count,
          page_size
        FROM (
          SELECT COUNT(*) as page_count FROM pragma_page_list('${table.name}')
        ), (
          SELECT page_size FROM pragma_page_size()
        )
      `)[0] as { size: number, page_count: number, page_size: number }
      
      console.log(`Size: ${(sizeQuery.size / 1024).toFixed(2)} KB`)
      console.log(`Pages: ${sizeQuery.page_count}`)
    } catch (error) {
      // Some tables might not support this query
      console.log('Size: N/A')
    }
    
    // Sample of data types for text columns
    try {
      const columns = db.query(`PRAGMA table_info(${table.name})`)
      const textColumns = columns.filter((col: any) => 
        col.type.toLowerCase().includes('text') || 
        col.type.toLowerCase().includes('varchar')
      )
      
      if (textColumns.length > 0 && count.count > 0) {
        const sampleColumn = textColumns[0].name
        const avgLength = db.query(`
          SELECT AVG(LENGTH(${sampleColumn})) as avg_length 
          FROM ${table.name} 
          WHERE ${sampleColumn} IS NOT NULL
        `)[0] as { avg_length: number }
        
        if (avgLength.avg_length) {
          console.log(`Avg ${sampleColumn} length: ${Math.round(avgLength.avg_length)} chars`)
        }
      }
    } catch (error) {
      // Ignore errors for specific table analysis
    }
  }
}

async function showHealth(db: any) {
  console.log('🏥 Database Health')
  console.log('=================')
  
  // Database settings
  const settings = [
    'page_size',
    'cache_size',
    'journal_mode',
    'synchronous',
    'foreign_keys',
    'auto_vacuum'
  ]
  
  console.log('Settings:')
  for (const setting of settings) {
    try {
      const value = db.query(`PRAGMA ${setting}`)[0]
      console.log(`  ${setting}: ${Object.values(value)[0]}`)
    } catch (error) {
      console.log(`  ${setting}: Error reading`)
    }
  }
  
  // Index usage stats (if available)
  console.log('\nIndex Usage:')
  try {
    const indexStats = db.query(`
      SELECT name, tbl, stat 
      FROM sqlite_stat1 
      ORDER BY name
    `)
    
    if (indexStats.length > 0) {
      indexStats.forEach((stat: any) => {
        console.log(`  ${stat.name} (${stat.tbl}): ${stat.stat}`)
      })
    } else {
      console.log('  No statistics available (run ANALYZE to generate)')
    }
  } catch (error) {
    console.log('  Statistics table not available')
  }
  
  // Integrity check
  console.log('\nIntegrity Check:')
  try {
    const integrity = db.query('PRAGMA integrity_check')
    if (integrity.length === 1 && integrity[0]['integrity_check'] === 'ok') {
      console.log('  ✅ Database integrity: OK')
    } else {
      console.log('  ❌ Database integrity issues found:')
      integrity.forEach((issue: any) => {
        console.log(`    ${Object.values(issue)[0]}`)
      })
    }
  } catch (error) {
    console.log('  ❌ Integrity check failed')
  }
  
  // Quick performance test
  console.log('\nPerformance Test:')
  try {
    const start = performance.now()
    db.query('SELECT COUNT(*) FROM sqlite_master')[0]
    const duration = performance.now() - start
    console.log(`  Simple query: ${duration.toFixed(2)}ms`)
    
    if (duration < 1) {
      console.log('  ✅ Performance: Excellent')
    } else if (duration < 10) {
      console.log('  ⚠️  Performance: Good')
    } else {
      console.log('  ❌ Performance: Needs attention')
    }
  } catch (error) {
    console.log('  ❌ Performance test failed')
  }
}

async function main() {
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  try {
    console.log('🗃️  Connecting to database...')
    const db = await initializeDatabase()
    
    if (options.schema) {
      await showSchema(db)
    } else if (options.stats) {
      await showStats(db)
    } else if (options.health) {
      await showHealth(db)
    } else {
      await showOverview(db)
    }
    
  } catch (error) {
    console.error('❌ Database inspection failed:', error)
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