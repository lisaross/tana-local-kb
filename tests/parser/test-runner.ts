#!/usr/bin/env bun
/**
 * Comprehensive test runner for parser validation
 * Runs all test suites and generates detailed reports
 */

import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

interface TestSuite {
  name: string
  file: string
  description: string
  timeout: number
  category: 'unit' | 'integration' | 'performance' | 'memory'
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'Unit Tests',
    file: 'tests/parser/memory.test.ts tests/parser/node-processor.test.ts tests/parser/system-node-filter.test.ts',
    description: 'Basic functionality and utilities',
    timeout: 30000,
    category: 'unit'
  },
  {
    name: 'Integration Tests',
    file: 'tests/parser/integration.test.ts',
    description: 'End-to-end parser functionality',
    timeout: 300000, // 5 minutes
    category: 'integration'
  },
  {
    name: 'Memory Validation',
    file: 'tests/parser/memory-validation.test.ts',
    description: 'Memory constraint validation and leak detection',
    timeout: 600000, // 10 minutes
    category: 'memory'
  },
  {
    name: 'Performance Tests',
    file: 'tests/parser/performance.test.ts',
    description: 'Throughput and performance benchmarks',
    timeout: 900000, // 15 minutes
    category: 'performance'
  },
  {
    name: 'Edge Cases',
    file: 'tests/parser/edge-cases.test.ts',
    description: 'Boundary conditions and error scenarios',
    timeout: 180000, // 3 minutes
    category: 'integration'
  }
]

interface TestResult {
  suite: string
  passed: boolean
  duration: number
  output: string
  coverage?: {
    functions: number
    lines: number
  }
}

class TestRunner {
  private results: TestResult[] = []
  private startTime: number = 0
  
  async runAllTests(category?: string): Promise<void> {
    console.log('🧪 Starting Comprehensive Parser Test Suite')
    console.log('=' .repeat(60))
    
    this.startTime = Date.now()
    
    // Filter suites by category if specified
    const suitesToRun = category 
      ? TEST_SUITES.filter(suite => suite.category === category)
      : TEST_SUITES
    
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
    
    this.generateReport()
  }
  
  private async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(`📋 Running: ${suite.name}`)
    console.log(`   Description: ${suite.description}`)
    console.log(`   Timeout: ${suite.timeout / 1000}s`)
    console.log()
    
    const startTime = Date.now()
    
    try {
      const result = await this.executeBunTest(suite)
      const duration = Date.now() - startTime
      
      this.results.push({
        suite: suite.name,
        passed: result.passed,
        duration,
        output: result.output,
        coverage: result.coverage
      })
      
      if (result.passed) {
        console.log(`✅ ${suite.name} - PASSED (${duration}ms)`)
      } else {
        console.log(`❌ ${suite.name} - FAILED (${duration}ms)`)
        console.log('Error output:')
        console.log(result.output)
      }
      
    } catch (error) {
      const duration = Date.now() - startTime
      
      this.results.push({
        suite: suite.name,
        passed: false,
        duration,
        output: error instanceof Error ? error.message : 'Unknown error'
      })
      
      console.log(`💥 ${suite.name} - ERROR (${duration}ms)`)
      console.log(error)
    }
    
    console.log()
  }
  
  private async executeBunTest(suite: TestSuite): Promise<{
    passed: boolean
    output: string
    coverage?: { functions: number, lines: number }
  }> {
    return new Promise((resolve) => {
      const child = spawn('bun', ['test', '--timeout', suite.timeout.toString(), ...suite.file.split(' ')], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      })
      
      let stdout = ''
      let stderr = ''
      
      child.stdout?.on('data', (data) => {
        const output = data.toString()
        stdout += output
        // Stream output for long-running tests
        if (suite.timeout > 60000) {
          process.stdout.write(output)
        }
      })
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })
      
      child.on('close', (code) => {
        const output = stdout + stderr
        const passed = code === 0
        
        // Parse coverage if available
        let coverage
        const coverageMatch = output.match(/(\d+\.\d+).*?(\d+\.\d+)/g)
        if (coverageMatch && coverageMatch.length >= 2) {
          const functionsMatch = output.match(/(\d+\.\d+)%.*?Funcs/)
          const linesMatch = output.match(/(\d+\.\d+)%.*?Lines/)
          
          if (functionsMatch && linesMatch) {
            coverage = {
              functions: parseFloat(functionsMatch[1]),
              lines: parseFloat(linesMatch[1])
            }
          }
        }
        
        resolve({ passed, output, coverage })
      })
      
      // Kill process if it exceeds timeout
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
          resolve({
            passed: false,
            output: `Test suite timed out after ${suite.timeout}ms`
          })
        }
      }, suite.timeout + 5000) // Add 5s buffer
    })
  }
  
  private generateReport(): void {
    const totalDuration = Date.now() - this.startTime
    const passed = this.results.filter(r => r.passed).length
    const failed = this.results.filter(r => !r.passed).length
    
    console.log('📊 TEST RESULTS SUMMARY')
    console.log('=' .repeat(60))
    console.log(`Total Suites: ${this.results.length}`)
    console.log(`Passed: ${passed}`)
    console.log(`Failed: ${failed}`)
    console.log(`Duration: ${totalDuration}ms (${(totalDuration / 1000 / 60).toFixed(1)} minutes)`)
    console.log()
    
    // Detailed results
    console.log('📋 DETAILED RESULTS')
    console.log('-' .repeat(60))
    
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌'
      const duration = `${result.duration}ms`
      
      console.log(`${status} ${result.suite.padEnd(30)} ${duration.padStart(10)}`)
      
      if (result.coverage) {
        console.log(`     Coverage: ${result.coverage.functions.toFixed(1)}% functions, ${result.coverage.lines.toFixed(1)}% lines`)
      }
    })
    
    console.log()
    
    // Failed tests details
    const failedTests = this.results.filter(r => !r.passed)
    if (failedTests.length > 0) {
      console.log('💥 FAILED TEST DETAILS')
      console.log('-' .repeat(60))
      
      failedTests.forEach(result => {
        console.log(`❌ ${result.suite}:`)
        console.log(result.output.split('\n').slice(0, 10).map(line => `    ${line}`).join('\n'))
        if (result.output.split('\n').length > 10) {
          console.log('    ... (output truncated)')
        }
        console.log()
      })
    }
    
    // Save detailed report to file
    this.saveReportToFile()
    
    // Performance summary
    this.generatePerformanceSummary()
    
    // Requirements validation
    this.validateRequirements()
    
    // Exit with appropriate code
    if (failed > 0) {
      console.log('❌ Some tests failed!')
      process.exit(1)
    } else {
      console.log('✅ All tests passed!')
    }
  }
  
  private saveReportToFile(): void {
    const reportsDir = join(process.cwd(), 'test-reports')
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true })
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const reportFile = join(reportsDir, `parser-test-report-${timestamp}.json`)
    
    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length
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
  
  private generatePerformanceSummary(): void {
    const performanceResult = this.results.find(r => r.suite === 'Performance Tests')
    
    if (performanceResult && performanceResult.passed) {
      console.log('⚡ PERFORMANCE SUMMARY')
      console.log('-' .repeat(60))
      
      // Extract performance metrics from output
      const output = performanceResult.output
      const throughputMatches = output.match(/(\d+(?:\.\d+)?)\s+nodes\/sec/g)
      const memoryMatches = output.match(/(\d+)MB/g)
      
      if (throughputMatches && throughputMatches.length > 0) {
        console.log('Throughput Results:')
        throughputMatches.slice(0, 5).forEach(match => {
          console.log(`  - ${match}`)
        })
      }
      
      if (memoryMatches && memoryMatches.length > 0) {
        console.log('Memory Usage:')
        memoryMatches.slice(0, 5).forEach(match => {
          console.log(`  - Peak: ${match}`)
        })
      }
      
      console.log()
    }
  }
  
  private validateRequirements(): void {
    console.log('📋 REQUIREMENTS VALIDATION')
    console.log('-' .repeat(60))
    
    const requirements = [
      {
        name: 'Parse 257MB+ files without loading into memory',
        status: this.results.some(r => r.suite === 'Integration Tests' && r.passed) ? 'PASS' : 'FAIL'
      },
      {
        name: 'Handle 1M+ nodes without crashing',
        status: this.results.some(r => r.suite === 'Performance Tests' && r.passed) ? 'PASS' : 'FAIL'
      },
      {
        name: 'Memory usage under 100MB',
        status: this.results.some(r => r.suite === 'Memory Validation' && r.passed) ? 'PASS' : 'FAIL'
      },
      {
        name: 'System node filtering works correctly',
        status: this.results.some(r => r.suite === 'Unit Tests' && r.passed) ? 'PASS' : 'FAIL'
      },
      {
        name: 'Progress callbacks function properly',
        status: this.results.some(r => r.suite === 'Integration Tests' && r.passed) ? 'PASS' : 'FAIL'
      },
      {
        name: 'Handle malformed JSON gracefully',
        status: this.results.some(r => r.suite === 'Edge Cases' && r.passed) ? 'PASS' : 'FAIL'
      }
    ]
    
    requirements.forEach(req => {
      const status = req.status === 'PASS' ? '✅' : '❌'
      console.log(`${status} ${req.name}`)
    })
    
    console.log()
    
    const passedRequirements = requirements.filter(r => r.status === 'PASS').length
    const totalRequirements = requirements.length
    
    console.log(`Requirements Met: ${passedRequirements}/${totalRequirements}`)
    
    if (passedRequirements === totalRequirements) {
      console.log('🎉 All core requirements validated!')
    } else {
      console.log('⚠️  Some requirements not fully validated')
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  const category = args[0] as 'unit' | 'integration' | 'performance' | 'memory' | undefined
  
  if (category && !['unit', 'integration', 'performance', 'memory'].includes(category)) {
    console.error('Invalid category. Use: unit, integration, performance, memory, or omit for all tests')
    process.exit(1)
  }
  
  const runner = new TestRunner()
  await runner.runAllTests(category)
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { TestRunner }