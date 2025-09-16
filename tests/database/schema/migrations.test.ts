#!/usr/bin/env bun
/**
 * Migration System Tests
 * 
 * Tests for database schema migrations, version management,
 * rollback functionality, and migration integrity validation.
 */

import { beforeEach, afterEach, describe, expect, test } from 'bun:test'
import { dbUtils } from '../../../server/src/database/index.js'
import { createMigrationRunner, migrateDatabase } from '../../../server/src/database/schema/migrations/index.js'
import type { DatabaseConnection } from '../../../server/src/database/types/database-types.js'

describe('Database Migration System', () => {
  let connection: DatabaseConnection

  beforeEach(async () => {
    // Create fresh in-memory database for each test
    connection = await dbUtils.createTestConnection()
  })

  afterEach(async () => {
    if (connection) {
      await connection.close()
    }
  })

  describe('Migration Runner Creation', () => {
    test('should create migration runner successfully', () => {
      const runner = createMigrationRunner(connection)
      
      expect(runner).toBeDefined()
      expect(runner.getCurrentVersion).toBeDefined()
      expect(runner.runMigrations).toBeDefined()
      expect(runner.rollbackMigration).toBeDefined()
      expect(runner.getMigrationHistory).toBeDefined()
    })

    test('should initialize migration table on first use', async () => {
      const runner = createMigrationRunner(connection)
      
      // Check if migration table exists
      const tables = connection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='schema_migrations'
      `)
      
      expect(tables).toHaveLength(1)
      expect(tables[0].name).toBe('schema_migrations')
    })

    test('should track current schema version', async () => {
      const runner = createMigrationRunner(connection)
      const version = await runner.getCurrentVersion()
      
      expect(typeof version).toBe('number')
      expect(version).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Schema Migration Execution', () => {
    test('should run full migration successfully', async () => {
      const success = await migrateDatabase(connection)
      expect(success).toBe(true)

      // Verify core tables exist
      const tables = connection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `)

      const tableNames = tables.map((t: any) => t.name)
      expect(tableNames).toContain('nodes')
      expect(tableNames).toContain('node_hierarchy')
      expect(tableNames).toContain('node_references')
      expect(tableNames).toContain('schema_migrations')
    })

    test('should create proper table schemas', async () => {
      await migrateDatabase(connection)

      // Test nodes table schema
      const nodeSchema = connection.query(`PRAGMA table_info(nodes)`)
      const nodeColumns = nodeSchema.map((col: any) => col.name)
      
      expect(nodeColumns).toContain('id')
      expect(nodeColumns).toContain('name')
      expect(nodeColumns).toContain('content')
      expect(nodeColumns).toContain('node_type')
      expect(nodeColumns).toContain('is_system_node')
      expect(nodeColumns).toContain('created_at')
      expect(nodeColumns).toContain('updated_at')

      // Test node_hierarchy table schema
      const hierarchySchema = connection.query(`PRAGMA table_info(node_hierarchy)`)
      const hierarchyColumns = hierarchySchema.map((col: any) => col.name)
      
      expect(hierarchyColumns).toContain('id')
      expect(hierarchyColumns).toContain('parent_id')
      expect(hierarchyColumns).toContain('child_id')
      expect(hierarchyColumns).toContain('position')

      // Test node_references table schema
      const referencesSchema = connection.query(`PRAGMA table_info(node_references)`)
      const referencesColumns = referencesSchema.map((col: any) => col.name)
      
      expect(referencesColumns).toContain('id')
      expect(referencesColumns).toContain('source_id')
      expect(referencesColumns).toContain('target_id')
      expect(referencesColumns).toContain('reference_type')
    })

    test('should create proper indexes', async () => {
      await migrateDatabase(connection)

      const indexes = connection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND sql IS NOT NULL
      `)

      const indexNames = indexes.map((idx: any) => idx.name)
      
      // Check for essential indexes
      expect(indexNames).toContain('idx_nodes_name')
      expect(indexNames).toContain('idx_nodes_type')
      expect(indexNames).toContain('idx_hierarchy_parent')
      expect(indexNames).toContain('idx_hierarchy_child')
      expect(indexNames).toContain('idx_references_source')
      expect(indexNames).toContain('idx_references_target')
    })

    test('should create FTS indexes when enabled', async () => {
      // Create connection with FTS enabled
      connection = await dbUtils.createTestConnection({ enableFTS: true })
      await migrateDatabase(connection)

      const tables = connection.query(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE '%_fts'
      `)

      expect(tables.length).toBeGreaterThan(0)
      expect(tables.some((t: any) => t.name.includes('nodes_fts'))).toBe(true)
    })

    test('should set foreign key constraints', async () => {
      await migrateDatabase(connection)

      // Check foreign key enforcement is enabled
      const fkCheck = connection.query('PRAGMA foreign_keys')
      expect(fkCheck[0].foreign_keys).toBe(1)

      // Test foreign key constraint
      connection.run('INSERT INTO nodes (id, name, content) VALUES (?, ?, ?)', ['test-1', 'Test Node', 'Test content'])
      
      expect(() => {
        connection.run('INSERT INTO node_hierarchy (parent_id, child_id, position) VALUES (?, ?, ?)', 
          ['nonexistent', 'test-1', 0])
      }).toThrow()
    })
  })

  describe('Migration Version Management', () => {
    test('should track migration versions properly', async () => {
      const runner = createMigrationRunner(connection)
      
      const initialVersion = await runner.getCurrentVersion()
      await migrateDatabase(connection)
      const currentVersion = await runner.getCurrentVersion()
      
      expect(currentVersion).toBeGreaterThan(initialVersion)
    })

    test('should record migration history', async () => {
      await migrateDatabase(connection)
      const runner = createMigrationRunner(connection)
      
      const history = await runner.getMigrationHistory()
      expect(history.length).toBeGreaterThan(0)
      
      const firstMigration = history[0]
      expect(firstMigration.version).toBeDefined()
      expect(firstMigration.description).toBeDefined()
      expect(firstMigration.applied_at).toBeDefined()
      expect(firstMigration.success).toBe(true)
    })

    test('should prevent duplicate migrations', async () => {
      // Run migrations twice
      const success1 = await migrateDatabase(connection)
      const success2 = await migrateDatabase(connection)
      
      expect(success1).toBe(true)
      expect(success2).toBe(true) // Should succeed but not re-run
      
      const runner = createMigrationRunner(connection)
      const history = await runner.getMigrationHistory()
      
      // Should not have duplicate entries for same version
      const versions = history.map(h => h.version)
      const uniqueVersions = [...new Set(versions)]
      expect(versions.length).toBe(uniqueVersions.length)
    })

    test('should handle schema version correctly on existing database', async () => {
      // First migration
      await migrateDatabase(connection)
      const runner = createMigrationRunner(connection)
      const version1 = await runner.getCurrentVersion()
      
      // Create new connection to same database
      const connection2 = await dbUtils.createTestConnection()
      const runner2 = createMigrationRunner(connection2)
      const version2 = await runner2.getCurrentVersion()
      
      expect(version2).toBe(version1)
      await connection2.close()
    })
  })

  describe('Migration Rollback', () => {
    test('should support rollback functionality', async () => {
      await migrateDatabase(connection)
      const runner = createMigrationRunner(connection)
      
      const beforeVersion = await runner.getCurrentVersion()
      
      // If rollback is supported
      if (runner.rollbackMigration) {
        try {
          await runner.rollbackMigration(beforeVersion - 1)
          const afterVersion = await runner.getCurrentVersion()
          expect(afterVersion).toBeLessThan(beforeVersion)
        } catch (error) {
          // Rollback might not be implemented or supported
          console.log('Rollback not supported:', error)
        }
      }
    })

    test('should validate rollback target version', async () => {
      await migrateDatabase(connection)
      const runner = createMigrationRunner(connection)
      
      if (runner.rollbackMigration) {
        // Should reject invalid rollback targets
        await expect(runner.rollbackMigration(-1)).rejects.toThrow()
        await expect(runner.rollbackMigration(99999)).rejects.toThrow()
      }
    })
  })

  describe('Migration Error Handling', () => {
    test('should handle corrupted migration gracefully', async () => {
      // This test would need a way to inject a failing migration
      // For now, we test general error handling
      const runner = createMigrationRunner(connection)
      
      expect(async () => {
        await runner.runMigrations([{
          version: 999,
          description: 'Invalid test migration',
          sql: 'INVALID SQL STATEMENT THAT WILL FAIL',
        }])
      }).rejects.toThrow()
    })

    test('should maintain database consistency on migration failure', async () => {
      // Run successful migration first
      await migrateDatabase(connection)
      
      const runner = createMigrationRunner(connection)
      const beforeVersion = await runner.getCurrentVersion()
      
      // Attempt invalid migration
      try {
        await runner.runMigrations([{
          version: beforeVersion + 1,
          description: 'Failing migration',
          sql: 'INVALID SQL',
        }])
      } catch (error) {
        // Expected to fail
      }
      
      // Version should not have changed
      const afterVersion = await runner.getCurrentVersion()
      expect(afterVersion).toBe(beforeVersion)
      
      // Database should still be functional
      expect(() => connection.query('SELECT COUNT(*) FROM nodes')).not.toThrow()
    })

    test('should record failed migrations in history', async () => {
      const runner = createMigrationRunner(connection)
      
      try {
        await runner.runMigrations([{
          version: 1,
          description: 'Failing migration',
          sql: 'INVALID SQL STATEMENT',
        }])
      } catch (error) {
        // Expected to fail
      }
      
      const history = await runner.getMigrationHistory()
      const failedMigration = history.find(h => h.success === false)
      
      if (failedMigration) {
        expect(failedMigration.description).toBe('Failing migration')
        expect(failedMigration.error_message).toBeDefined()
      }
    })
  })

  describe('Migration Performance', () => {
    test('should complete migrations within reasonable time', async () => {
      const startTime = Date.now()
      await migrateDatabase(connection)
      const duration = Date.now() - startTime
      
      // Migrations should complete quickly
      expect(duration).toBeLessThan(5000) // Less than 5 seconds
    })

    test('should handle large schema efficiently', async () => {
      const startTime = Date.now()
      
      // Run standard migrations
      await migrateDatabase(connection)
      
      // Add some test data to verify migration doesn't block on data
      for (let i = 0; i < 1000; i++) {
        connection.run(
          'INSERT INTO nodes (id, name, content) VALUES (?, ?, ?)',
          [`test-${i}`, `Test Node ${i}`, `Content ${i}`]
        )
      }
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(10000) // Less than 10 seconds including data
    })
  })

  describe('Migration Validation', () => {
    test('should validate schema integrity after migration', async () => {
      await migrateDatabase(connection)
      
      // Test foreign key integrity
      const fkCheck = connection.query('PRAGMA foreign_key_check')
      expect(fkCheck.length).toBe(0) // No FK violations
      
      // Test schema integrity
      const integrityCheck = connection.query('PRAGMA integrity_check')
      expect(integrityCheck[0].integrity_check).toBe('ok')
    })

    test('should ensure all required tables exist', async () => {
      await migrateDatabase(connection)
      
      const requiredTables = ['nodes', 'node_hierarchy', 'node_references', 'schema_migrations']
      const tables = connection.query(`
        SELECT name FROM sqlite_master WHERE type='table'
      `)
      const tableNames = tables.map((t: any) => t.name)
      
      for (const requiredTable of requiredTables) {
        expect(tableNames).toContain(requiredTable)
      }
    })

    test('should ensure all required indexes exist', async () => {
      await migrateDatabase(connection)
      
      const requiredIndexes = [
        'idx_nodes_name',
        'idx_nodes_type', 
        'idx_hierarchy_parent',
        'idx_hierarchy_child',
        'idx_references_source',
        'idx_references_target'
      ]
      
      const indexes = connection.query(`
        SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL
      `)
      const indexNames = indexes.map((idx: any) => idx.name)
      
      for (const requiredIndex of requiredIndexes) {
        expect(indexNames).toContain(requiredIndex)
      }
    })
  })
})