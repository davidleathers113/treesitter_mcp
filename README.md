# Tree-sitter MCP Server

A Model Context Protocol (MCP) server that provides Tree-sitter code analysis capabilities. This server enables LLMs to parse and analyze source code using Tree-sitter's incremental parsing technology.

## 🚀 Key Features

- **Parse source code** into Abstract Syntax Trees (AST)
- **Query code patterns** using Tree-sitter query syntax
- **Navigate code structure** by getting nodes at specific positions
- **Multiple language support** via WebAssembly grammar files
- **Worker thread infrastructure** - CPU-intensive parsing off the main thread
- **Bundled language grammars** - includes pre-packaged WASM files for popular languages
- **Automatic fallback loading** - tries bundled → local → CDN sources
- **No dependency conflicts** - uses web-tree-sitter (WebAssembly)
- **Works offline** - no internet required with bundled grammars

## 🛠 Architecture

This implementation uses **web-tree-sitter** instead of native Node.js bindings to solve the notorious Tree-sitter dependency version conflicts. All language grammars are loaded as WebAssembly (.wasm) files, providing:

- ✅ **No native compilation** required
- ✅ **No version conflicts** between core library and language packages
- ✅ **Cross-platform compatibility**
- ✅ **Dynamic language loading** from URLs or local files
- ✅ **Smaller dependency footprint**

### Worker Thread Infrastructure

The server includes a sophisticated worker thread infrastructure for optimal performance:

- **CPU-intensive operations** moved off the main thread
- **Worker pool management** with automatic scaling and load balancing
- **Error recovery** with automatic worker restart on crashes
- **Request queuing** for handling high load scenarios
- **Configurable timeouts** and resource limits
- **Real-time monitoring** via `get_worker_stats` tool

The infrastructure supports both **worker mode** (default) and **direct mode** for compatibility.

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
    "language": "javascript"
    // No wasmPath needed - uses bundled grammar!
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

### 7. `get_worker_stats` (Worker Mode Only)

Monitor worker pool performance and health:

```json
{
  "name": "get_worker_stats",
  "arguments": {}
}
```

Returns real-time statistics about worker utilization, request counts, and pool health.

## ⚙️ Configuration

The server can be configured via environment variables:

### Worker Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TREESITTER_USE_WORKERS` | `true` | Enable worker thread mode |
| `TREESITTER_WORKER_POOL_SIZE` | `min(4, cpus-1)` | Number of worker threads |
| `TREESITTER_WORKER_TIMEOUT` | `30000` | Request timeout in milliseconds |
| `TREESITTER_MAX_REQUESTS_PER_WORKER` | `1000` | Worker restart threshold |
| `TREESITTER_RESTART_WORKERS` | `true` | Auto-restart workers on errors |

### Cache Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TREESITTER_ENABLE_CACHE` | `true` | Enable parser caching |
| `TREESITTER_PARSER_CACHE_SIZE` | `10` | Max parsers to cache |
| `TREESITTER_WASM_CACHE_SIZE_MB` | `50` | WASM cache size (MB) |
| `TREESITTER_TREE_CACHE_SIZE` | `100` | Max parsed trees to cache |

### Language Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TREESITTER_PRELOAD_LANGUAGES` | `false` | Preload common languages |
| `TREESITTER_LANGUAGES_TO_PRELOAD` | `js,ts,py,go,rust` | Languages to preload |

### Debug Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TREESITTER_LOG_LEVEL` | `error` | Logging level (error/warn/info/debug) |
| `TREESITTER_LOG_WORKER_STATS` | `false` | Log worker statistics |

### Usage Examples

```bash
# Use direct mode (single-threaded)
TREESITTER_USE_WORKERS=false npm start

# Use smaller worker pool
TREESITTER_WORKER_POOL_SIZE=2 npm start

# Enable debug logging
TREESITTER_LOG_LEVEL=debug npm start

# Preload common languages
TREESITTER_PRELOAD_LANGUAGES=true npm start
```

## 🌐 Language Support

The server includes bundled WASM grammars for popular languages (via `tree-sitter-wasms` package):

### Pre-bundled Languages (No wasmPath needed!)
- JavaScript, TypeScript, Python
- Go, Rust, C, C++, C#
- Java, Ruby, PHP, Swift
- HTML, CSS, SCSS, JSON, YAML
- Bash, SQL, Markdown
- And many more!

### Loading Priority
When you don't specify a `wasmPath`, the server automatically tries:
1. **Bundled WASM files** (fastest, works offline)
2. **Local node_modules** (if you've installed language packages)
3. **CDN fallback** (jsDelivr, unpkg, GitHub)

### Manual Loading (Optional)
You can still specify custom WASM paths if needed:
- **CDN URLs**: `https://unpkg.com/tree-sitter-javascript/tree-sitter-javascript.wasm`
- **Local files**: `./node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm`
- **Custom grammars**: `./grammars/my-language.wasm`

### Using Custom Grammar Files

While most languages work out-of-the-box, you can specify custom grammars:

```json
{
  "wasmPath": "./grammars/my-custom-language.wasm"
}
```

### Offline Usage

The bundled grammars mean the server works completely offline - no internet connection required for parsing code in supported languages!

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
A: This should be rare now with bundled grammars. If it happens:
- Check if the language name is correct (e.g., "javascript" not "js")
- For uncommon languages, provide a custom wasmPath
- Check the error details for which sources were tried

**Q: TypeScript compilation errors**
A: Make sure all dependencies are installed with `npm install` and rebuild with `npm run build`.

**Q: "EmscriptenModule not found" error**
A: This is handled by the `src/types.d.ts` file which provides the missing type definitions.

**Q: Server works locally but not when deployed**
A: Ensure the `tree-sitter-wasms` dependency is included in your deployment.

### Performance Tips

1. **Bundled grammars are fastest** - no network requests needed
2. **Pre-load languages** using `load_language` if you know what you'll parse
3. **Languages stay loaded** - once loaded, parsers are cached for the session

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
2. **Bundled grammars**: Includes pre-packaged WASM files via `tree-sitter-wasms`
3. **Smart fallback loading**: Automatically tries bundled → local → CDN sources
4. **Clean dependencies**: Only requires `web-tree-sitter`, `tree-sitter-wasms`, and the MCP SDK
5. **Universal compatibility**: Works across different Node.js versions and platforms
6. **Offline support**: Works without internet thanks to bundled grammars
7. **Fully tested**: Successfully parses JavaScript, Python, TypeScript and more

## 🤝 Contributing

This server demonstrates how to build robust Tree-sitter integrations without the traditional dependency hell. Feel free to extend it with additional tools or language-specific features.

## 📄 License

MIT License - see LICENSE file for details.