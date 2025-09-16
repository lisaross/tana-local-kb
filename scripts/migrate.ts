#!/usr/bin/env bun
/**
 * Database Migration Script
 * 
 * Provides CLI interface for managing database migrations.
 * Usage:
 *   bun run migrate           # Run all pending migrations
 *   bun run migrate --status  # Show migration status
 *   bun run migrate --rollback # Rollback last migration
 *   bun run migrate --reset   # Reset database (development only)
 */

import { createMigrationRunner } from '../server/src/database/schema/migrations/index.js'
import { getDatabase } from '../server/src/database/index.js'

interface MigrateOptions {
  status?: boolean
  rollback?: boolean
  reset?: boolean
  help?: boolean
}

function parseArgs(): MigrateOptions {
  const args = process.argv.slice(2)
  return {
    status: args.includes('--status') || args.includes('-s'),
    rollback: args.includes('--rollback') || args.includes('-r'),
    reset: args.includes('--reset'),
    help: args.includes('--help') || args.includes('-h')
  }
}

function showHelp() {
  console.log(`
Database Migration Tool

Usage:
  bun run migrate [options]

Options:
  --status, -s      Show current migration status
  --rollback, -r    Rollback the last applied migration
  --reset          Reset database (removes all data - development only)
  --help, -h       Show this help message

Examples:
  bun run migrate                # Apply all pending migrations
  bun run migrate --status       # Show which migrations are applied
  bun run migrate --rollback     # Rollback the last migration
`)
}

async function main() {
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  try {
    console.log('🗃️  Initializing database...')
    const db = getDatabase()
    const migrationRunner = createMigrationRunner(db)

    if (options.status) {
      console.log('\n📊 Migration Status:')
      const status = await migrationRunner.getStatus()
      
      console.log(`Current version: ${status.currentVersion}`)
      console.log(`Latest version: ${status.latestVersion}`)
      console.log(`Pending migrations: ${status.pendingMigrations.length}`)
      
      if (status.appliedMigrations.length > 0) {
        console.log('\n✅ Applied migrations:')
        status.appliedMigrations.forEach((migration) => {
          console.log(`  ${migration.version}: ${migration.name} (${migration.appliedAt?.toISOString()})`)
        })
      }
      
      if (status.pendingMigrations.length > 0) {
        console.log('\n⏳ Pending migrations:')
        status.pendingMigrations.forEach((migration) => {
          console.log(`  ${migration.version}: ${migration.name}`)
        })
      }
      
      return
    }

    if (options.rollback) {
      console.log('\n⏪ Rolling back last migration...')
      const result = await migrationRunner.rollback()
      
      if (result.success) {
        console.log(`✅ Successfully rolled back migration: ${result.version}`)
      } else {
        console.error(`❌ Rollback failed: ${result.error}`)
        process.exit(1)
      }
      return
    }

    if (options.reset) {
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ Database reset is not allowed in production!')
        process.exit(1)
      }
      
      console.log('\n🔄 Resetting database...')
      console.log('⚠️  This will remove all data!')
      
      // In a real implementation, you might want to ask for confirmation here
      await migrationRunner.reset()
      console.log('✅ Database reset complete')
      return
    }

    // Default: run migrations
    console.log('\n🔄 Running migrations...')
    const results = await migrationRunner.migrate()
    
    if (results.length === 0) {
      console.log('✅ Database is up to date - no migrations needed')
      return
    }
    
    console.log(`✅ Applied ${results.length} migration(s):`)
    results.forEach((result) => {
      if (result.success) {
        console.log(`  ✅ ${result.version}: ${result.name} (${result.duration}ms)`)
      } else {
        console.log(`  ❌ ${result.version}: ${result.error}`)
      }
    })
    
    const failedMigrations = results.filter(r => !r.success)
    if (failedMigrations.length > 0) {
      console.error(`\n❌ ${failedMigrations.length} migration(s) failed`)
      process.exit(1)
    }
    
    console.log('\n🎉 All migrations completed successfully!')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
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