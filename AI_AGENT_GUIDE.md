# Tree-sitter MCP Server - AI Agent Usage Guide

## Overview

This Tree-sitter MCP server provides code analysis capabilities using Tree-sitter's incremental parsing technology. It can parse source code into Abstract Syntax Trees (ASTs), perform pattern matching queries, and analyze code structure across multiple programming languages.

## Server Capabilities

The server provides **6 MCP tools** for code analysis:

1. `parse_code` - Parse source code into AST
2. `query_code` - Search code patterns using Tree-sitter queries
3. `get_node_at_position` - Find AST node at specific location
4. `get_syntax_tree` - Get string representation of syntax tree
5. `load_language` - Pre-load language grammar
6. `list_languages` - Show loaded languages

## Tool Reference

### 1. parse_code

**Purpose**: Parse source code and return detailed AST information

**Required Parameters**:
- `code` (string): Source code to parse
- `language` (string): Programming language (e.g., "javascript", "python", "typescript")

**Optional Parameters**:
- `wasmPath` (string): Path to .wasm grammar file

**Example Usage**:
```json
{
  "name": "parse_code",
  "arguments": {
    "code": "function hello() { return 'world'; }",
    "language": "javascript",
    "wasmPath": "https://unpkg.com/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm"
  }
}
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "language": "javascript",
    "rootNode": {
      "type": "program",
      "startPosition": {"row": 0, "column": 0},
      "endPosition": {"row": 0, "column": 38},
      "text": "function hello() { return 'world'; }",
      "children": [...]
    },
    "nodeCount": 12,
    "hasError": false
  }
}
```

### 2. query_code

**Purpose**: Search for specific patterns in code using Tree-sitter query syntax

**Required Parameters**:
- `code` (string): Source code to query
- `language` (string): Programming language
- `query` (string): Tree-sitter query pattern

**Optional Parameters**:
- `wasmPath` (string): Path to .wasm grammar file

**Example Usage**:
```json
{
  "name": "query_code",
  "arguments": {
    "code": "function hello() { return 'world'; }\nfunction goodbye() { return 'bye'; }",
    "language": "javascript",
    "query": "(function_declaration name: (identifier) @func-name)",
    "wasmPath": "https://unpkg.com/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm"
  }
}
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "matches": [
      {
        "pattern": 0,
        "captures": [
          {
            "name": "func-name",
            "node": {
              "type": "identifier",
              "text": "hello",
              "startPosition": {"row": 0, "column": 9},
              "endPosition": {"row": 0, "column": 14}
            }
          }
        ]
      }
    ]
  }
}
```

### 3. get_node_at_position

**Purpose**: Find the specific AST node at a given line and column

**Required Parameters**:
- `code` (string): Source code
- `language` (string): Programming language
- `row` (number): Line number (0-based)
- `column` (number): Column number (0-based)

**Optional Parameters**:
- `wasmPath` (string): Path to .wasm grammar file

**Example Usage**:
```json
{
  "name": "get_node_at_position",
  "arguments": {
    "code": "const x = 1;",
    "language": "javascript",
    "row": 0,
    "column": 6,
    "wasmPath": "https://unpkg.com/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm"
  }
}
```

### 4. get_syntax_tree

**Purpose**: Get a human-readable string representation of the entire syntax tree

**Required Parameters**:
- `code` (string): Source code
- `language` (string): Programming language

**Optional Parameters**:
- `wasmPath` (string): Path to .wasm grammar file

**Example Usage**:
```json
{
  "name": "get_syntax_tree",
  "arguments": {
    "code": "const x = 1;",
    "language": "javascript",
    "wasmPath": "https://unpkg.com/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm"
  }
}
```

### 5. load_language

**Purpose**: Pre-load a language grammar for better performance

**Required Parameters**:
- `language` (string): Programming language to load

**Optional Parameters**:
- `wasmPath` (string): Path to .wasm grammar file

**Example Usage**:
```json
{
  "name": "load_language",
  "arguments": {
    "language": "python",
    "wasmPath": "https://unpkg.com/tree-sitter-python@0.23.6/tree-sitter-python.wasm"
  }
}
```

### 6. list_languages

**Purpose**: List all currently loaded language grammars

**Required Parameters**: None

**Example Usage**:
```json
{
  "name": "list_languages",
  "arguments": {}
}
```

## Language Support Options

### Option 1: CDN URLs (Recommended for Testing)
Use unpkg.com for reliable access:
- JavaScript: `https://unpkg.com/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm`
- TypeScript: `https://unpkg.com/tree-sitter-typescript@0.23.2/tree-sitter-typescript.wasm`
- Python: `https://unpkg.com/tree-sitter-python@0.23.6/tree-sitter-python.wasm`
- Rust: `https://unpkg.com/tree-sitter-rust@0.23.0/tree-sitter-rust.wasm`

### Option 2: npm Package Installation
```bash
npm install tree-sitter-javascript
# Then use: "./node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm"
```

### Option 3: Local Files
Place .wasm files in project directory and reference with relative paths.

## Testing Workflow

### Step 1: Basic Connectivity Test
```json
{
  "name": "list_languages",
  "arguments": {}
}
```
Expected: Empty list initially `{"success": true, "data": {"languages": []}}`

### Step 2: Load a Language
```json
{
  "name": "load_language",
  "arguments": {
    "language": "javascript",
    "wasmPath": "https://unpkg.com/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm"
  }
}
```
Expected: `{"success": true, "data": {"message": "Language javascript loaded successfully"}}`

### Step 3: Parse Simple Code
```json
{
  "name": "parse_code",
  "arguments": {
    "code": "const x = 1;",
    "language": "javascript"
  }
}
```
Expected: AST with `nodeCount: 8` and `hasError: false`

### Step 4: Test Query Functionality
```json
{
  "name": "query_code",
  "arguments": {
    "code": "const x = 1; const y = 2;",
    "language": "javascript",
    "query": "(variable_declarator name: (identifier) @var-name)"
  }
}
```
Expected: Matches for variables "x" and "y"

### Step 5: Test Position Finding
```json
{
  "name": "get_node_at_position",
  "arguments": {
    "code": "const x = 1;",
    "language": "javascript",
    "row": 0,
    "column": 6
  }
}
```
Expected: Node information for the identifier "x"

## Common Query Patterns

### Find All Functions
```
(function_declaration name: (identifier) @function-name)
```

### Find Variable Declarations
```
(variable_declarator name: (identifier) @var-name)
```

### Find String Literals
```
(string) @string-value
```

### Find Function Calls
```
(call_expression function: (identifier) @function-name)
```

### Find Class Definitions
```
(class_declaration name: (identifier) @class-name)
```

## Error Handling

### Common Error Scenarios:

1. **Language Not Loaded**:
   - Error: `"Language {language} not loaded. Call loadLanguage() first."`
   - Solution: Use `load_language` tool first

2. **Invalid WASM Path**:
   - Error: `"Failed to download from {url}: Not Found"`
   - Solution: Verify URL or use alternative source

3. **Parse Errors**:
   - Response includes `"hasError": true` in AST
   - Check code syntax for the specified language

4. **Invalid Query Syntax**:
   - Error: `"Query syntax error"`
   - Solution: Verify Tree-sitter query syntax

## Performance Tips

1. **Pre-load Languages**: Use `load_language` for frequently used languages
2. **Cache Results**: Parser state persists between calls for same language
3. **Batch Operations**: Load language once, then perform multiple operations
4. **Use CDN URLs**: More reliable than local files for testing

## Multi-Language Example Test Suite

```json
// Test JavaScript
{
  "name": "parse_code",
  "arguments": {
    "code": "class MyClass { constructor() { this.name = 'test'; } }",
    "language": "javascript",
    "wasmPath": "https://unpkg.com/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm"
  }
}

// Test Python
{
  "name": "parse_code",
  "arguments": {
    "code": "def hello_world():\n    return 'Hello, World!'",
    "language": "python",
    "wasmPath": "https://unpkg.com/tree-sitter-python@0.23.6/tree-sitter-python.wasm"
  }
}

// Test TypeScript
{
  "name": "parse_code",
  "arguments": {
    "code": "interface User { name: string; age: number; }",
    "language": "typescript",
    "wasmPath": "https://unpkg.com/tree-sitter-typescript@0.23.2/tree-sitter-typescript.wasm"
  }
}
```

## Debugging Guide

### Check Server Status
1. Use `list_languages` to see loaded languages
2. Parse simple code first (e.g., `const x = 1;`)
3. Verify wasmPath URLs are accessible
4. Check for syntax errors in code samples

### Query Debugging
1. Start with simple queries like `(identifier) @name`
2. Use `get_syntax_tree` to understand AST structure
3. Build complex queries incrementally
4. Refer to Tree-sitter documentation for query syntax

This server provides powerful code analysis capabilities for AI agents to understand, analyze, and manipulate source code across multiple programming languages.