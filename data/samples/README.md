# Sample Data Directory

This directory contains example Tana export files for development and testing purposes.

## Purpose

- **Development**: Understanding Tana export structure for building the import system
- **Testing**: Sample data for testing import, search, and chat functionality
- **Documentation**: Reference examples of different Tana export formats

## Usage

### For Development
Place small sample Tana exports here to examine structure and test import logic:
```bash
# Example files
data/samples/
├── small-example.json          # Basic node structure
├── complex-relationships.json  # Supertags, fields, references
└── large-sample.json          # Performance testing
```

### For Production Imports
**Don't put your actual imports here!** Use the inbox folder instead:
```bash
# Production workflow
data/imports/inbox/             # Drop your real exports here
data/imports/archive/           # Previous imports are auto-archived here
```

## File Management

- Sample files can be committed to git for team development
- Keep samples small and focused on specific features
- Remove or anonymize any personal information before committing
- Use descriptive filenames that indicate what the sample demonstrates

## Testing Import Scripts

```bash
# Test with sample data
bun run import:replace --file data/samples/small-example.json

# Validate structure
bun run validate-json --file data/samples/your-sample.json
```