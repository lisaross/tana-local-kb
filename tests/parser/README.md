# Parser Test Suite

Comprehensive testing suite for the Tana JSON streaming parser, validating all core requirements and edge cases.

## Test Categories

### Unit Tests (`test:parser:unit`)
- **Memory utilities** - Memory tracking, limits, and garbage collection
- **Node processor** - Node validation and processing logic  
- **System node filter** - System node detection and filtering

### Integration Tests (`test:parser:integration`)
- **End-to-end functionality** - Complete parsing workflows
- **Filtering and processing** - System node filtering, custom filters
- **Progress tracking** - Progress callbacks and event handling
- **Memory management** - Memory-aware batching and constraints
- **Error handling** - Graceful error recovery

### Memory Validation Tests (`test:parser:memory`)
- **Memory constraints** - 100MB limit validation
- **Memory leak detection** - Multi-session parsing without leaks
- **Garbage collection** - Memory stability during streaming
- **Memory pressure** - Graceful degradation under pressure
- **Configuration impact** - Memory usage across different options

### Performance Tests (`test:parser:performance`)
- **Throughput benchmarks** - Nodes per second across file sizes
- **Configuration optimization** - Batch size and option impact
- **Performance under load** - Multi-session and concurrent parsing
- **Error recovery performance** - Throughput with malformed data
- **Large scale simulation** - 1M+ node requirement validation

### Edge Cases (`test:parser:edge-cases`)
- **Empty and invalid files** - Boundary conditions
- **Malformed JSON** - Various corruption scenarios
- **Unicode handling** - Special character support
- **Circular references** - Complex node relationships
- **Large individual nodes** - Memory handling for huge content
- **Network simulation** - I/O error conditions

## Running Tests

### Quick Tests (Unit only - ~30 seconds)
```bash
bun run test:parser:quick
```

### Full Test Suite (~30 minutes)
```bash
bun run test:parser
```

### By Category
```bash
bun run test:parser:unit         # ~1 minute
bun run test:parser:integration  # ~10 minutes  
bun run test:parser:memory      # ~15 minutes
bun run test:parser:performance  # ~20 minutes
```

### Test Data Generation
```bash
bun run test:generate-data       # Generate all test files
bun run test:generate-data SMALL # Generate specific size
```

## Requirements Validation

The test suite validates all core requirements from issue #1:

- ✅ **Parse 257MB+ files** without loading into memory
- ✅ **Handle 1M+ nodes** without crashing
- ✅ **Memory usage under 100MB** constraint
- ✅ **System node filtering** works correctly  
- ✅ **Progress callbacks** function properly
- ✅ **Malformed JSON handling** graceful error recovery

## Test Data

Test files are generated dynamically in `tests/data/`:
- **Small**: 5,000 nodes (~5MB)
- **Medium**: 50,000 nodes (~50MB) 
- **Large**: 250,000 nodes (~200MB)
- **Huge**: 1,000,000 nodes (~800MB)
- **Malformed**: Various corruption scenarios
- **Edge cases**: Unicode, circular refs, etc.

## Performance Targets

- **Small files**: >1,000 nodes/second
- **Medium files**: >500 nodes/second  
- **Large files**: >200 nodes/second
- **Memory peak**: <100MB for all scenarios
- **Memory leaks**: <30MB growth across sessions
- **Error recovery**: Maintains >80% throughput

## Reports

Detailed test reports are saved to `test-reports/` including:
- Test results and coverage
- Performance metrics
- Memory usage patterns
- Requirements validation
- Environment details

## Debugging

For test failures:
1. Check individual test file outputs
2. Review generated test reports
3. Run memory validation in isolation
4. Use `--verbose` flag for detailed logging
5. Check `tests/data/` for generated test files

## Contributing

When adding new tests:
1. Follow existing naming conventions
2. Add timeout appropriate for test complexity  
3. Include performance assertions where relevant
4. Update this README with new test descriptions
5. Ensure tests are deterministic and reliable