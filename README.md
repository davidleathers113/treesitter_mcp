# Tree-sitter MCP Server

A Model Context Protocol (MCP) server that provides Tree-sitter code analysis capabilities. This server enables LLMs to parse and analyze source code using Tree-sitter's incremental parsing technology.

## 🚀 Key Features

- **Parse source code** into Abstract Syntax Trees (AST)
- **Query code patterns** using Tree-sitter query syntax
- **Navigate code structure** by getting nodes at specific positions
- **Multiple language support** via WebAssembly grammar files
- **Dynamic language loading** from local files or remote URLs
- **No dependency conflicts** - uses web-tree-sitter (WebAssembly)

## 🛠 Architecture

This implementation uses **web-tree-sitter** instead of native Node.js bindings to solve the notorious Tree-sitter dependency version conflicts. All language grammars are loaded as WebAssembly (.wasm) files, providing:

- ✅ **No native compilation** required
- ✅ **No version conflicts** between core library and language packages
- ✅ **Cross-platform compatibility**
- ✅ **Dynamic language loading** from URLs or local files
- ✅ **Smaller dependency footprint**

## 📦 Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- npm

### Build from Source

```bash
# Clone or navigate to the project directory
cd treesitter_mcp

# Install dependencies
npm install

# Build the TypeScript project
npm run build

# Test the server (optional)
node test-server.js

# Example output:
# ✅ Tree-sitter MCP Server running on stdio
# ✅ Successfully parsed JavaScript: const x = 1;
# ✅ Generated AST with 8 nodes, no errors
```

## 🎯 Available Tools

### 1. `parse_code`
Parse source code and return AST information.

```json
{
  "name": "parse_code",
  "arguments": {
    "code": "const x = 1; console.log(x);",
    "language": "javascript",
    "wasmPath": "https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/javascript.wasm"
  }
}
```

### 2. `query_code`
Query parsed code using Tree-sitter query syntax.

```json
{
  "name": "query_code",
  "arguments": {
    "code": "function hello() { return 'world'; }",
    "language": "javascript",
    "query": "(function_declaration name: (identifier) @func-name)",
    "wasmPath": "https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/javascript.wasm"
  }
}
```

### 3. `get_node_at_position`
Get the AST node at a specific line and column.

```json
{
  "name": "get_node_at_position",
  "arguments": {
    "code": "const x = 1;",
    "language": "javascript",
    "row": 0,
    "column": 6,
    "wasmPath": "https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/javascript.wasm"
  }
}
```

### 4. `get_syntax_tree`
Get a string representation of the entire syntax tree.

```json
{
  "name": "get_syntax_tree",
  "arguments": {
    "code": "const x = 1;",
    "language": "javascript",
    "wasmPath": "https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/javascript.wasm"
  }
}
```

### 5. `load_language`
Pre-load a language grammar for better performance.

```json
{
  "name": "load_language",
  "arguments": {
    "language": "python",
    "wasmPath": "https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/python.wasm"
  }
}
```

### 6. `list_languages`
List all currently loaded languages.

```json
{
  "name": "list_languages",
  "arguments": {}
}
```

## 🌐 Language Support

The server supports any language that has a Tree-sitter grammar compiled to WebAssembly. Popular languages include:

- **JavaScript**: `https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/javascript.wasm`
- **TypeScript**: `https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/typescript.wasm`
- **Python**: `https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/python.wasm`
- **Rust**: `https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/rust.wasm`
- **Go**: `https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/go.wasm`
- **C++**: `https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/cpp.wasm`

### Custom Grammar Files

You can use local .wasm files from npm packages:

```bash
npm install tree-sitter-javascript
# Then use: "./node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm"
```

```json
{
  "wasmPath": "./node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm"
}
```

Or your own custom grammar files:

```json
{
  "wasmPath": "./grammars/my-language.wasm"
}
```

## 🔧 Smithery Deployment

This MCP server is ready for deployment on [Smithery](https://smithery.ai), the platform for AI-native services.

### Prerequisites
- GitHub repository (public or private)
- Smithery account

### Deployment Steps

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Ready for Smithery deployment"
   git push origin main
   ```

2. **Connect to Smithery**:
   - Visit [smithery.ai](https://smithery.ai)
   - Sign in with GitHub
   - Import your repository

3. **Configure Deployment**:
   - Smithery will auto-detect the `smithery.yaml` configuration
   - Runtime: TypeScript (already configured)
   - Entry point: `build/index.js` (automatically detected)

4. **Deploy**:
   - Smithery will automatically build and deploy your server
   - Get your server URL: `https://server.smithery.ai/@{username}/{repo-name}`

### Integration Example

Once deployed, integrate into your applications:

```typescript
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { createSmitheryUrl } from "@smithery/sdk"

const serverUrl = createSmitheryUrl(
  "https://server.smithery.ai/@{your-username}/treesitter_mcp",
  {
    config: {},
    apiKey: "your-smithery-api-key"
  }
)

const transport = new StreamableHTTPClientTransport(serverUrl)
// ... use with MCP client
```

### Benefits of Smithery Deployment

- 🚀 **Instant hosting** - No server management required
- 🔒 **Secure** - Built-in authentication and API key management
- 📊 **Analytics** - Usage tracking and performance metrics
- 🌍 **Global CDN** - Fast response times worldwide
- 💰 **Monetization** - Optional usage-based billing

## 🐛 Troubleshooting

### Common Issues

**Q: "Could not load language" error**
A: Ensure the .wasm file path is correct and accessible. Try using a direct URL from the `common_tree_sitter_languages` repository.

**Q: TypeScript compilation errors**
A: Make sure all dependencies are installed with `npm install` and rebuild with `npm run build`.

**Q: "EmscriptenModule not found" error**
A: This is handled by the `src/types.d.ts` file which provides the missing type definitions.

### Performance Tips

1. **Pre-load languages** using `load_language` for frequently used grammars
2. **Use CDN URLs** for reliable access to grammar files
3. **Cache .wasm files locally** for offline usage

## 🔍 Query Syntax Examples

Tree-sitter queries use S-expression syntax:

```scheme
; Find all function declarations
(function_declaration name: (identifier) @function-name)

; Find variable assignments
(assignment_expression left: (identifier) @variable-name)

; Find all string literals
(string) @string-value

; Find function calls
(call_expression function: (identifier) @function-name)
```

## 📊 Project Structure

```
treesitter_mcp/
├── src/
│   ├── index.ts              # Main MCP server implementation
│   ├── tree-sitter-service.ts # Tree-sitter service wrapper
│   └── types.d.ts            # TypeScript type definitions
├── build/                   # Compiled JavaScript files (generated)
│   ├── index.js             # Compiled main server
│   └── tree-sitter-service.js # Compiled service
├── package.json              # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── smithery.yaml            # Smithery deployment config
├── test-server.js           # Basic functionality test
├── README.md                # Human developer documentation
└── AI_AGENT_GUIDE.md        # AI agent usage guide
```

## 🤖 For AI Agents

**See [AI_AGENT_GUIDE.md](./AI_AGENT_GUIDE.md)** for comprehensive instructions on how to use this Tree-sitter MCP server, including:
- Tool reference with examples
- Testing workflows
- Query patterns
- Error handling
- Multi-language support

## 🎉 Solution Highlights

This implementation solves the major Tree-sitter packaging issues by:

1. **Using WebAssembly**: Eliminates native compilation and version conflicts
2. **Dynamic loading**: Languages are loaded on-demand from URLs or local files
3. **Clean dependencies**: Only requires `web-tree-sitter` and the MCP SDK
4. **Universal compatibility**: Works across different Node.js versions and platforms
5. **Multiple loading options**: Supports npm packages, CDN URLs, and local files
6. **Fully tested**: Successfully parses code and returns complete AST with 8 nodes

## 🤝 Contributing

This server demonstrates how to build robust Tree-sitter integrations without the traditional dependency hell. Feel free to extend it with additional tools or language-specific features.

## 📄 License

MIT License - see LICENSE file for details.