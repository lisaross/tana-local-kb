# Database Test Suite

Comprehensive testing suite for the Tana Local KB database system, validating performance, reliability, and functionality across all database operations.

## Overview

This test suite ensures the database system meets the following requirements:

- **Scalability**: Handle 1M+ nodes efficiently
- **Memory Efficiency**: Operate within 50MB memory constraints during imports
- **Performance**: Maintain fast response times for all operations
- **Reliability**: Ensure data integrity and transaction safety
- **Functionality**: Validate all CRUD operations, search, and graph traversal

## Test Structure

```text
tests/database/
├── config/
│   └── connection.test.ts          # Connection management tests
├── schema/
│   └── migrations.test.ts          # Migration system tests
├── operations/
│   ├── nodes.test.ts              # Node CRUD operations
│   ├── edges.test.ts              # Hierarchy edge operations
│   └── batch.test.ts              # Batch processing tests
├── queries/
│   ├── graph-traversal.test.ts    # Graph algorithm tests
│   └── search.test.ts             # Search functionality tests
├── benchmarks/
│   └── performance.test.ts        # Performance validation
├── test-runner.ts                 # Comprehensive test runner
└── README.md                      # This file
```

## Running Tests

### Quick Test Commands

```bash
# Run all database tests
bun run test:database

# Run specific categories
bun run test:database:unit
bun run test:database:integration
bun run test:database:performance
bun run test:database:benchmarks

# Run specific test files
bun test tests/database/operations/nodes.test.ts
bun test tests/database/benchmarks/performance.test.ts
```

### Using the Test Runner

```bash
# Run all tests with comprehensive reporting
bun run tests/database/test-runner.ts

# Run specific category
bun run tests/database/test-runner.ts performance
bun run tests/database/test-runner.ts benchmarks
```

## Test Categories

### Unit Tests
- **Connection Management**: Database connection lifecycle, configuration validation
- **Basic Operations**: Individual CRUD operations on nodes, edges, and references
- **Error Handling**: Edge cases and error scenarios

**Expected Duration**: < 2 minutes  
**Memory Usage**: < 50MB

### Integration Tests
- **Migration System**: Schema migrations, version management, rollback
- **Node Operations**: Complex node operations with relationships
- **Edge Operations**: Hierarchy management and graph integrity
- **Search Functionality**: Full-text search, filtering, ranking

**Expected Duration**: < 10 minutes  
**Memory Usage**: < 100MB

### Performance Tests
- **Batch Operations**: Large-scale data processing (10K+ operations)
- **Graph Traversal**: Complex graph algorithms on large datasets
- **Concurrent Operations**: Multi-threaded operation safety
- **Memory Efficiency**: Memory usage validation under load

**Expected Duration**: < 15 minutes  
**Memory Usage**: < 150MB

### Benchmark Tests
- **1M+ Node Simulation**: Validates system can handle massive datasets
- **Throughput Measurement**: Operations per second across all functions
- **Memory Stress Testing**: Memory usage under extreme conditions
- **System Requirements Validation**: Comprehensive requirement verification

**Expected Duration**: < 30 minutes  
**Memory Usage**: < 100MB (strict requirement)

## Performance Requirements

### Memory Constraints
- **Import Operations**: < 50MB during large imports
- **Regular Operations**: < 100MB for standard operations
- **Peak Memory**: Never exceed 200MB under any circumstances

### Throughput Requirements
- **Node Creation**: > 1,000 nodes/second
- **Batch Operations**: > 5,000 operations/second
- **Search Queries**: < 100ms response time
- **Graph Traversal**: > 10,000 nodes/second traversal

### Reliability Requirements
- **Transaction Safety**: All operations must be ACID compliant
- **Data Integrity**: Foreign key constraints always enforced
- **Error Recovery**: Graceful handling of all error conditions
- **Concurrent Safety**: No race conditions in multi-threaded scenarios

## Test Data Management

### Automatic Cleanup
All tests use in-memory databases that are automatically cleaned up after each test. No persistent data is created during testing.

### Test Data Generation
Tests generate realistic data patterns:
- Hierarchical structures with varying depths
- Cross-references between nodes
- Content with special characters and Unicode
- Large datasets for performance testing

### Memory Monitoring
All tests include real-time memory monitoring to ensure memory constraints are met.

## Interpreting Results

### Test Output Format
```text
✅ Node Operations Tests - PASSED (1250ms, 45.2MB peak)
   Coverage: 92.1% functions, 89.4% lines
   Requirements: Memory ✅ Duration ✅ Coverage ✅

❌ Performance Tests - FAILED (8500ms)
   Memory requirement failed: 125.3MB > 100MB
   Requirements: Memory ❌ Duration ✅ Coverage ✅
```

### Performance Reports
The test runner generates detailed performance reports including:
- Throughput measurements (operations/second)
- Memory usage patterns
- Duration analysis
- Requirement compliance status

### Coverage Reports
- **Functions**: Percentage of functions tested
- **Lines**: Percentage of code lines covered
- **Branches**: Percentage of code branches tested

Target coverage: 90%+ for unit tests, 80%+ for integration tests

## Common Issues and Troubleshooting

### Memory Issues
If tests fail due to memory constraints:
1. Check for memory leaks in the implementation
2. Verify garbage collection is working properly
3. Consider reducing batch sizes in tests
4. Review object lifecycle management

### Performance Issues
If tests fail performance requirements:
1. Profile the database operations
2. Check for missing indexes
3. Verify query optimization
4. Review transaction management

### Connection Issues
If connection tests fail:
1. Verify SQLite is properly installed
2. Check file permissions
3. Ensure no database locks exist
4. Verify configuration settings

## Environment Requirements

### System Requirements
- **Bun**: v1.0.0 or higher
- **Node.js**: v18.0.0 or higher (for compatibility)
- **Memory**: At least 2GB available RAM
- **Storage**: 1GB free space for test reports

### Dependencies
All test dependencies are included in the main package.json:
- Bun's built-in test runner
- SQLite database engine
- Performance monitoring utilities

## Continuous Integration

### GitHub Actions
Tests are configured to run on:
- Pull requests to main branch
- Scheduled nightly runs
- Manual workflow dispatch

### Performance Monitoring
CI tracks performance trends:
- Throughput degradation alerts
- Memory usage increases
- Test duration increases

### Quality Gates
All tests must pass for merge approval:
- 100% test suite success rate
- Memory requirements compliance
- Performance benchmarks met
- Code coverage targets achieved

## Contributing to Tests

### Adding New Tests
1. Follow existing test patterns and structure
2. Include comprehensive error scenarios
3. Add performance validation where appropriate
4. Update this README with new test descriptions

### Test Best Practices
- Use descriptive test names that explain the behavior
- Keep tests independent and isolated
- Include both positive and negative test cases
- Validate performance and memory usage
- Use realistic test data patterns

### Performance Test Guidelines
- Always measure memory usage
- Include throughput calculations
- Test with realistic data sizes
- Validate against system requirements
- Include stress testing scenarios

For questions or issues with the test suite, please refer to the main project documentation or create an issue in the repository.