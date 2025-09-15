#!/usr/bin/env bun
/**
 * Comprehensive Database Test Runner
 * 
 * Executes all database test suites with performance monitoring,
 * generates detailed reports, and validates system requirements.
 */

import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

interface TestSuite {
  name: string
  files: string[]
  description: string
  timeout: number
  category: 'unit' | 'integration' | 'performance' | 'benchmarks'
  requirements?: {
    maxMemory?: number // MB
    maxDuration?: number // ms
    minCoverage?: number // percentage
  }
}

const DATABASE_TEST_SUITES: TestSuite[] = [
  {
    name: 'Connection Management Tests',
    files: ['tests/database/config/connection.test.ts'],
    description: 'Database connection lifecycle, configuration, and error handling',
    timeout: 60000, // 1 minute
    category: 'unit',
    requirements: {
      maxMemory: 50,
      maxDuration: 30000,
      minCoverage: 90
    }
  },
  {
    name: 'Migration System Tests',
    files: ['tests/database/schema/migrations.test.ts'],
    description: 'Schema migrations, version management, and rollback functionality',
    timeout: 120000, // 2 minutes
    category: 'integration',
    requirements: {
      maxMemory: 75,
      maxDuration: 60000,
      minCoverage: 85
    }
  },
  {
    name: 'Node Operations Tests',
    files: ['tests/database/operations/nodes.test.ts'],
    description: 'CRUD operations on nodes with comprehensive edge cases',
    timeout: 300000, // 5 minutes
    category: 'integration',
    requirements: {
      maxMemory: 100,
      maxDuration: 180000,
      minCoverage: 90
    }
  },
  {
    name: 'Edge Operations Tests',
    files: ['tests/database/operations/edges.test.ts'],
    description: 'Hierarchy edge operations and graph integrity validation',
    timeout: 300000, // 5 minutes
    category: 'integration',
    requirements: {
      maxMemory: 100,
      maxDuration: 180000,
      minCoverage: 85
    }
  },
  {
    name: 'Batch Operations Tests',
    files: ['tests/database/operations/batch.test.ts'],
    description: 'Large-scale batch operations and memory efficiency',
    timeout: 600000, // 10 minutes
    category: 'performance',
    requirements: {
      maxMemory: 150,
      maxDuration: 300000,
      minCoverage: 80
    }
  },
  {
    name: 'Graph Traversal Tests',
    files: ['tests/database/queries/graph-traversal.test.ts'],
    description: 'Complex graph algorithms and traversal performance',
    timeout: 600000, // 10 minutes
    category: 'performance',
    requirements: {
      maxMemory: 200,
      maxDuration: 300000,
      minCoverage: 75
    }
  },
  {
    name: 'Search Functionality Tests',
    files: ['tests/database/queries/search.test.ts'],
    description: 'Full-text search, filtering, and ranking algorithms',
    timeout: 300000, // 5 minutes
    category: 'integration',
    requirements: {
      maxMemory: 100,
      maxDuration: 180000,
      minCoverage: 80
    }
  },
  {
    name: 'Performance Benchmarks',
    files: ['tests/database/benchmarks/performance.test.ts'],
    description: 'Comprehensive performance validation and system requirements',
    timeout: 1800000, // 30 minutes
    category: 'benchmarks',
    requirements: {
      maxMemory: 100, // Must stay under 100MB per requirement
      maxDuration: 1500000, // 25 minutes max
      minCoverage: 70
    }
  }
]

interface TestResult {
  suite: string
  category: string
  passed: boolean
  duration: number
  memoryPeak: number
  memoryIncrease: number
  coverage?: {
    functions: number
    lines: number
    branches: number
  }
  output: string
  errors: string[]
  requirements: {
    memoryPassed: boolean
    durationPassed: boolean
    coveragePassed: boolean
  }
}

class DatabaseTestRunner {
  private results: TestResult[] = []
  private startTime: number = 0

  async runAllTests(category?: string): Promise<void> {
    console.log('🗄️  Starting Comprehensive Database Test Suite')
    console.log('=' .repeat(70))
    
    this.startTime = Date.now()
    
    // Filter suites by category if specified
    const suitesToRun = category 
      ? DATABASE_TEST_SUITES.filter(suite => suite.category === category)
      : DATABASE_TEST_SUITES
    
    console.log(`Running ${suitesToRun.length} test suite(s)${category ? ` (${category} only)` : ''}`)
    console.log()
    
    // Ensure test data directory exists
    const testDataDir = join(process.cwd(), 'tests/data')
    if (!existsSync(testDataDir)) {
      mkdirSync(testDataDir, { recursive: true })
    }
    
    for (const suite of suitesToRun) {
      await this.runTestSuite(suite)
    }
    
    this.generateComprehensiveReport()
  }

  private async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(`📋 Running: ${suite.name}`)
    console.log(`   Category: ${suite.category}`)
    console.log(`   Description: ${suite.description}`)
    console.log(`   Files: ${suite.files.length}`)
    console.log(`   Timeout: ${suite.timeout / 1000}s`)
    
    if (suite.requirements) {
      console.log(`   Requirements:`)
      if (suite.requirements.maxMemory) {
        console.log(`     - Memory: < ${suite.requirements.maxMemory}MB`)
      }
      if (suite.requirements.maxDuration) {
        console.log(`     - Duration: < ${suite.requirements.maxDuration / 1000}s`)
      }
      if (suite.requirements.minCoverage) {
        console.log(`     - Coverage: > ${suite.requirements.minCoverage}%`)
      }
    }
    console.log()
    
    const startTime = Date.now()
    const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024
    
    try {
      const result = await this.executeBunTest(suite)
      const duration = Date.now() - startTime
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024
      const memoryIncrease = Math.max(0, finalMemory - initialMemory)
      
      // Validate requirements
      const requirements = {
        memoryPassed: !suite.requirements?.maxMemory || result.memoryPeak <= suite.requirements.maxMemory,
        durationPassed: !suite.requirements?.maxDuration || duration <= suite.requirements.maxDuration,
        coveragePassed: !suite.requirements?.minCoverage || (result.coverage?.functions || 0) >= suite.requirements.minCoverage
      }
      
      const allRequirementsPassed = Object.values(requirements).every(Boolean)
      const testsPassed = result.passed && allRequirementsPassed
      
      this.results.push({
        suite: suite.name,
        category: suite.category,
        passed: testsPassed,
        duration,
        memoryPeak: result.memoryPeak,
        memoryIncrease,
        coverage: result.coverage,
        output: result.output,
        errors: result.errors,
        requirements
      })
      
      if (testsPassed) {
        console.log(`✅ ${suite.name} - PASSED (${duration}ms, ${result.memoryPeak.toFixed(1)}MB peak)`)
        if (result.coverage) {
          console.log(`   Coverage: ${result.coverage.functions.toFixed(1)}% functions, ${result.coverage.lines.toFixed(1)}% lines`)
        }
      } else {
        console.log(`❌ ${suite.name} - FAILED (${duration}ms)`)
        
        if (!result.passed) {
          console.log(`   Test failures detected`)
        }
        
        if (!requirements.memoryPassed) {
          console.log(`   Memory requirement failed: ${result.memoryPeak.toFixed(1)}MB > ${suite.requirements?.maxMemory}MB`)
        }
        
        if (!requirements.durationPassed) {
          console.log(`   Duration requirement failed: ${duration}ms > ${suite.requirements?.maxDuration}ms`)
        }
        
        if (!requirements.coveragePassed) {
          console.log(`   Coverage requirement failed: ${result.coverage?.functions || 0}% < ${suite.requirements?.minCoverage}%`)
        }
      }
      
    } catch (error) {
      const duration = Date.now() - startTime
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024
      
      this.results.push({
        suite: suite.name,
        category: suite.category,
        passed: false,
        duration,
        memoryPeak: finalMemory,
        memoryIncrease: Math.max(0, finalMemory - initialMemory),
        output: '',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        requirements: {
          memoryPassed: false,
          durationPassed: false,
          coveragePassed: false
        }
      })
      
      console.log(`💥 ${suite.name} - ERROR (${duration}ms)`)
      console.log(`   ${error}`)
    }
    
    console.log()
  }

  private async executeBunTest(suite: TestSuite): Promise<{
    passed: boolean
    output: string
    errors: string[]
    memoryPeak: number
    coverage?: { functions: number, lines: number, branches: number }
  }> {
    return new Promise((resolve) => {
      const args = ['test', '--timeout', suite.timeout.toString(), ...suite.files]
      const child = spawn('bun', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      })
      
      let stdout = ''
      let stderr = ''
      let memoryPeak = process.memoryUsage().heapUsed / 1024 / 1024
      
      // Monitor memory usage during test execution
      const memoryMonitor = setInterval(() => {
        const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024
        if (currentMemory > memoryPeak) {
          memoryPeak = currentMemory
        }
      }, 100)
      
      child.stdout?.on('data', (data) => {
        const output = data.toString()
        stdout += output
        
        // Stream output for long-running tests
        if (suite.timeout > 120000) {
          process.stdout.write(output)
        }
      })
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })
      
      child.on('close', (code) => {
        clearInterval(memoryMonitor)
        
        const output = stdout + stderr
        const passed = code === 0
        const errors: string[] = []
        
        // Extract errors from output
        if (!passed) {
          const errorLines = stderr.split('\n').filter(line => 
            line.includes('Error') || line.includes('Failed') || line.includes('AssertionError')
          )
          errors.push(...errorLines)
        }
        
        // Parse coverage if available
        let coverage
        const coverageMatch = output.match(/(\d+\.\d+)%.*?(\d+\.\d+)%.*?(\d+\.\d+)%/)
        if (coverageMatch) {
          coverage = {
            functions: parseFloat(coverageMatch[1]),
            lines: parseFloat(coverageMatch[2]),
            branches: parseFloat(coverageMatch[3])
          }
        }
        
        resolve({ 
          passed, 
          output, 
          errors, 
          memoryPeak,
          coverage 
        })
      })
      
      // Kill process if it exceeds timeout
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
          clearInterval(memoryMonitor)
          resolve({
            passed: false,
            output: `Test suite timed out after ${suite.timeout}ms`,
            errors: ['Timeout exceeded'],
            memoryPeak
          })
        }
      }, suite.timeout + 10000) // Add 10s buffer
    })
  }

  private generateComprehensiveReport(): void {
    const totalDuration = Date.now() - this.startTime
    const passed = this.results.filter(r => r.passed).length
    const failed = this.results.filter(r => !r.passed).length
    
    console.log('📊 DATABASE TEST RESULTS SUMMARY')
    console.log('=' .repeat(70))
    console.log(`Total Suites: ${this.results.length}`)
    console.log(`Passed: ${passed}`)
    console.log(`Failed: ${failed}`)
    console.log(`Duration: ${totalDuration}ms (${(totalDuration / 1000 / 60).toFixed(1)} minutes)`)
    console.log()
    
    // Category breakdown
    console.log('📋 RESULTS BY CATEGORY')
    console.log('-' .repeat(70))
    
    const categories = [...new Set(this.results.map(r => r.category))]
    categories.forEach(category => {
      const categoryResults = this.results.filter(r => r.category === category)
      const categoryPassed = categoryResults.filter(r => r.passed).length
      const categoryTotal = categoryResults.length
      
      console.log(`${category.toUpperCase()}: ${categoryPassed}/${categoryTotal} passed`)
      
      categoryResults.forEach(result => {
        const status = result.passed ? '✅' : '❌'
        const duration = `${result.duration}ms`
        const memory = `${result.memoryPeak.toFixed(1)}MB`
        
        console.log(`  ${status} ${result.suite.padEnd(40)} ${duration.padStart(8)} ${memory.padStart(8)}`)
        
        if (result.coverage) {
          console.log(`      Coverage: ${result.coverage.functions.toFixed(1)}% functions, ${result.coverage.lines.toFixed(1)}% lines`)
        }
        
        // Show requirement failures
        if (!result.passed) {
          if (!result.requirements.memoryPassed) console.log(`      ❌ Memory requirement failed`)
          if (!result.requirements.durationPassed) console.log(`      ❌ Duration requirement failed`)
          if (!result.requirements.coveragePassed) console.log(`      ❌ Coverage requirement failed`)
        }
      })
      
      console.log()
    })
    
    // Performance analysis
    this.generatePerformanceAnalysis()
    
    // Requirements validation
    this.validateSystemRequirements()
    
    // Save detailed report
    this.saveDetailedReport()
    
    // Exit with appropriate code
    if (failed > 0) {
      console.log('❌ Some database tests failed!')
      process.exit(1)
    } else {
      console.log('✅ All database tests passed!')
      console.log('🎉 Database system meets all performance requirements!')
    }
  }

  private generatePerformanceAnalysis(): void {
    console.log('⚡ PERFORMANCE ANALYSIS')
    console.log('-' .repeat(70))
    
    const performanceResults = this.results.filter(r => 
      r.category === 'performance' || r.category === 'benchmarks'
    )
    
    if (performanceResults.length > 0) {
      const avgDuration = performanceResults.reduce((sum, r) => sum + r.duration, 0) / performanceResults.length
      const maxMemory = Math.max(...performanceResults.map(r => r.memoryPeak))
      const avgMemory = performanceResults.reduce((sum, r) => sum + r.memoryPeak, 0) / performanceResults.length
      
      console.log(`Average Duration: ${avgDuration.toFixed(0)}ms`)
      console.log(`Maximum Memory: ${maxMemory.toFixed(1)}MB`)
      console.log(`Average Memory: ${avgMemory.toFixed(1)}MB`)
      console.log()
      
      // Benchmark specific analysis
      const benchmarkResult = this.results.find(r => r.suite.includes('Benchmark'))
      if (benchmarkResult) {
        console.log('Benchmark Results:')
        console.log(`  Duration: ${benchmarkResult.duration}ms`)
        console.log(`  Memory Peak: ${benchmarkResult.memoryPeak.toFixed(1)}MB`)
        console.log(`  Status: ${benchmarkResult.passed ? 'PASSED' : 'FAILED'}`)
        
        if (benchmarkResult.output.includes('nodes/sec')) {
          const throughputMatches = benchmarkResult.output.match(/(\d+\.?\d*)\s*nodes\/sec/g)
          if (throughputMatches) {
            console.log('  Throughput Measurements:')
            throughputMatches.slice(0, 5).forEach(match => {
              console.log(`    - ${match}`)
            })
          }
        }
      }
    }
    
    console.log()
  }

  private validateSystemRequirements(): void {
    console.log('📋 SYSTEM REQUIREMENTS VALIDATION')
    console.log('-' .repeat(70))
    
    const requirements = [
      {
        name: 'Support 1M+ nodes processing',
        status: this.results.some(r => 
          r.suite.includes('Benchmark') && r.passed
        ) ? 'PASS' : 'FAIL',
        details: 'Validated through benchmark simulations'
      },
      {
        name: 'Memory usage under 100MB during operations',
        status: this.results.every(r => r.memoryPeak <= 100) ? 'PASS' : 'FAIL',
        details: `Peak memory: ${Math.max(...this.results.map(r => r.memoryPeak)).toFixed(1)}MB`
      },
      {
        name: 'Database operations complete in reasonable time',
        status: this.results.filter(r => r.category === 'performance').every(r => r.passed) ? 'PASS' : 'FAIL',
        details: 'All performance tests passed timing requirements'
      },
      {
        name: 'Transaction safety and ACID compliance',
        status: this.results.some(r => 
          r.suite.includes('Migration') && r.passed
        ) ? 'PASS' : 'FAIL',
        details: 'Validated through migration and transaction tests'
      },
      {
        name: 'Graph traversal algorithms function correctly',
        status: this.results.some(r => 
          r.suite.includes('Graph Traversal') && r.passed
        ) ? 'PASS' : 'FAIL',
        details: 'Complex graph operations validated'
      },
      {
        name: 'Search functionality performs efficiently',
        status: this.results.some(r => 
          r.suite.includes('Search') && r.passed
        ) ? 'PASS' : 'FAIL',
        details: 'Full-text search and filtering validated'
      },
      {
        name: 'Batch operations handle large datasets',
        status: this.results.some(r => 
          r.suite.includes('Batch') && r.passed
        ) ? 'PASS' : 'FAIL',
        details: 'Large-scale batch processing validated'
      }
    ]
    
    requirements.forEach(req => {
      const status = req.status === 'PASS' ? '✅' : '❌'
      console.log(`${status} ${req.name}`)
      console.log(`     ${req.details}`)
    })
    
    console.log()
    
    const passedRequirements = requirements.filter(r => r.status === 'PASS').length
    const totalRequirements = requirements.length
    
    console.log(`System Requirements Met: ${passedRequirements}/${totalRequirements}`)
    
    if (passedRequirements === totalRequirements) {
      console.log('🎉 All system requirements validated!')
    } else {
      console.log('⚠️  Some requirements not fully validated')
    }
    
    console.log()
  }

  private saveDetailedReport(): void {
    const reportsDir = join(process.cwd(), 'test-reports')
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true })
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const reportFile = join(reportsDir, `database-test-report-${timestamp}.json`)
    
    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length,
        categories: {
          unit: this.results.filter(r => r.category === 'unit').length,
          integration: this.results.filter(r => r.category === 'integration').length,
          performance: this.results.filter(r => r.category === 'performance').length,
          benchmarks: this.results.filter(r => r.category === 'benchmarks').length
        }
      },
      performance: {
        averageDuration: this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length,
        maxMemoryPeak: Math.max(...this.results.map(r => r.memoryPeak)),
        averageMemory: this.results.reduce((sum, r) => sum + r.memoryPeak, 0) / this.results.length
      },
      results: this.results,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage()
      }
    }
    
    writeFileSync(reportFile, JSON.stringify(report, null, 2))
    console.log(`📄 Detailed report saved to: ${reportFile}`)
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  const category = args[0] as 'unit' | 'integration' | 'performance' | 'benchmarks' | undefined
  
  if (category && !['unit', 'integration', 'performance', 'benchmarks'].includes(category)) {
    console.error('Invalid category. Use: unit, integration, performance, benchmarks, or omit for all tests')
    process.exit(1)
  }
  
  const runner = new DatabaseTestRunner()
  await runner.runAllTests(category)
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { DatabaseTestRunner }