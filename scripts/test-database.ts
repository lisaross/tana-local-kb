#!/usr/bin/env bun

/**
 * Test script for database connection and migration system
 * 
 * This script tests the database implementation by:
 * 1. Creating an in-memory database
 * 2. Running migrations
 * 3. Testing basic operations
 * 4. Validating data integrity
 */

import { dbUtils } from '../server/src/database/index.js'

async function testDatabaseConnection(): Promise<void> {
  console.log('🔗 Testing database connection...')
  
  try {
    // Create test database configuration
    const connection = await dbUtils.createTestConnection({
      pragmas: {
        journal_mode: 'MEMORY',
        synchronous: 'OFF',
        foreign_keys: 'ON',
      }
    })
    
    // Test basic query
    const result = connection.query('SELECT 1 as test')
    console.log('✅ Basic query test passed:', result)
    
    connection.close()
    console.log('✅ Database connection test completed successfully')
    
  } catch (error) {
    console.error('❌ Database connection test failed:', error)
    throw error
  }
}

async function testMigrations(): Promise<void> {
  console.log('🔄 Testing database migrations...')
  
  try {
    const connection = await dbUtils.createTestConnection()
    
    // Test that tables exist after migration
    const tables = connection.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    
    console.log('📋 Created tables:', tables.map((t: any) => t.name))
    
    const expectedTables = [
      'nodes', 'node_hierarchy', 'node_references', 'node_search',
      'node_stats', 'imports', 'node_imports', 'schema_versions'
    ]
    
    for (const table of expectedTables) {
      const found = tables.some((t: any) => t.name === table)
      if (!found) {
        throw new Error(`Required table missing: ${table}`)
      }
    }
    
    // Test that triggers exist
    const triggers = connection.query(`
      SELECT name FROM sqlite_master 
      WHERE type='trigger'
      ORDER BY name
    `)
    
    console.log('⚡ Created triggers:', triggers.map((t: any) => t.name))
    
    connection.close()
    console.log('✅ Database migrations test completed successfully')
    
  } catch (error) {
    console.error('❌ Database migrations test failed:', error)
    throw error
  }
}

async function testBasicOperations(): Promise<void> {
  console.log('📝 Testing basic database operations...')
  
  try {
    const connection = await dbUtils.createTestConnection()
    
    // Test inserting a node
    const insertResult = connection.run(`
      INSERT INTO nodes (id, name, content, node_type, is_system_node, fields_json, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['test-node-1', 'Test Node', 'Test content', 'node', false, '{}', '{}'])
    
    console.log('📝 Insert result:', insertResult)
    
    // Test querying the node
    const nodes = connection.query('SELECT * FROM nodes WHERE id = ?', ['test-node-1'])
    console.log('🔍 Query result:', nodes[0])
    
    if (!nodes.length) {
      throw new Error('Failed to retrieve inserted node')
    }
    
    // Test updating the node
    const updateResult = connection.run(
      'UPDATE nodes SET content = ? WHERE id = ?',
      ['Updated content', 'test-node-1']
    )
    
    console.log('🔄 Update result:', updateResult)
    
    // Test hierarchy insertion
    connection.run(`
      INSERT INTO nodes (id, name, content, node_type, is_system_node, fields_json, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['test-node-2', 'Child Node', 'Child content', 'node', false, '{}', '{}'])
    
    const hierarchyResult = connection.run(`
      INSERT INTO node_hierarchy (parent_id, child_id, position)
      VALUES (?, ?, ?)
    `, ['test-node-1', 'test-node-2', 0])
    
    console.log('🌳 Hierarchy insert result:', hierarchyResult)
    
    // Test hierarchy query
    const children = connection.query(`
      SELECT n.* FROM nodes n 
      JOIN node_hierarchy h ON n.id = h.child_id 
      WHERE h.parent_id = ?
    `, ['test-node-1'])
    
    console.log('👶 Children query result:', children)
    
    // Test FTS
    const searchResults = connection.query(`
      SELECT * FROM node_search WHERE node_search MATCH ?
    `, ['Test'])
    
    console.log('🔍 FTS search results:', searchResults)
    
    connection.close()
    console.log('✅ Basic operations test completed successfully')
    
  } catch (error) {
    console.error('❌ Basic operations test failed:', error)
    throw error
  }
}

async function testTransactions(): Promise<void> {
  console.log('💳 Testing database transactions...')
  
  try {
    const connection = await dbUtils.createTestConnection()
    
    // Test successful transaction
    const result = connection.transaction(() => {
      connection.run(`
        INSERT INTO nodes (id, name, content, node_type, is_system_node, fields_json, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, ['tx-test-1', 'Transaction Test', 'Content', 'node', false, '{}', '{}'])
      
      const nodes = connection.query('SELECT COUNT(*) as count FROM nodes')
      return nodes[0]
    })
    
    console.log('✅ Transaction result:', result)
    
    // Test rollback transaction
    try {
      connection.transaction(() => {
        connection.run(`
          INSERT INTO nodes (id, name, content, node_type, is_system_node, fields_json, metadata_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, ['tx-test-2', 'Will Rollback', 'Content', 'node', false, '{}', '{}'])
        
        // Force an error to trigger rollback
        throw new Error('Intentional rollback')
      })
    } catch (error) {
      console.log('🔄 Expected rollback error:', (error as Error).message)
    }
    
    // Verify rollback worked
    const finalNodes = connection.query('SELECT * FROM nodes WHERE id = ?', ['tx-test-2'])
    if (finalNodes.length > 0) {
      throw new Error('Transaction rollback failed - node should not exist')
    }
    
    console.log('✅ Transaction rollback worked correctly')
    
    connection.close()
    console.log('✅ Transaction test completed successfully')
    
  } catch (error) {
    console.error('❌ Transaction test failed:', error)
    throw error
  }
}

async function testPerformance(): Promise<void> {
  console.log('⚡ Testing database performance...')
  
  try {
    const connection = await dbUtils.createTestConnection()
    
    const startTime = performance.now()
    const batchSize = 1000
    
    // Test batch insert performance
    console.log(`📦 Inserting ${batchSize} nodes...`)
    
    connection.transaction(() => {
      const stmt = (connection as any).getDatabase().prepare(`
        INSERT INTO nodes (id, name, content, node_type, is_system_node, fields_json, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      
      for (let i = 0; i < batchSize; i++) {
        stmt.run([
          `perf-test-${i}`,
          `Performance Test Node ${i}`,
          `This is test content for node ${i}`,
          'node',
          false,
          '{}',
          '{}'
        ])
      }
    })
    
    const insertTime = performance.now() - startTime
    console.log(`⚡ Inserted ${batchSize} nodes in ${insertTime.toFixed(2)}ms`)
    console.log(`📈 Rate: ${(batchSize / insertTime * 1000).toFixed(0)} nodes/second`)
    
    // Test query performance
    const queryStart = performance.now()
    const queryResult = connection.query('SELECT COUNT(*) as count FROM nodes')
    const queryTime = performance.now() - queryStart
    
    console.log(`🔍 Query took ${queryTime.toFixed(2)}ms, found ${queryResult[0].count} nodes`)
    
    connection.close()
    console.log('✅ Performance test completed successfully')
    
  } catch (error) {
    console.error('❌ Performance test failed:', error)
    throw error
  }
}

async function runAllTests(): Promise<void> {
  console.log('🧪 Starting database system tests...\n')
  
  try {
    await testDatabaseConnection()
    console.log()
    
    await testMigrations()
    console.log()
    
    await testBasicOperations()
    console.log()
    
    await testTransactions()
    console.log()
    
    await testPerformance()
    console.log()
    
    console.log('🎉 All database tests passed successfully!')
    
  } catch (error) {
    console.error('\n💥 Database tests failed:', error)
    process.exit(1)
  }
}

// Allow running specific tests via command line arguments
const testName = process.argv[2]
const availableTests = {
  connection: testDatabaseConnection,
  migrations: testMigrations,
  operations: testBasicOperations,
  transactions: testTransactions,
  performance: testPerformance,
}

if (testName && testName in availableTests) {
  console.log(`🧪 Running specific test: ${testName}\n`)
  availableTests[testName as keyof typeof availableTests]()
    .then(() => {
      console.log(`\n✅ Test '${testName}' completed successfully!`)
    })
    .catch((error) => {
      console.error(`\n❌ Test '${testName}' failed:`, error)
      process.exit(1)
    })
} else {
  runAllTests()
}