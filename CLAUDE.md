# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

- **Build**: `npm run build` - Compile TypeScript to JavaScript
- **Dev**: `npm run dev` - Run TypeScript directly with ts-node
- **Start**: `npm run start` - Run compiled server
- **Test**: `node test-server.js` - Run integration test

## Architecture Overview

This is a Model Context Protocol (MCP) server that provides Tree-sitter parsing capabilities via WebAssembly. Key architectural decisions:

1. **WebAssembly-based**: Uses `web-tree-sitter` instead of native bindings to avoid dependency conflicts
2. **Service Pattern**: `TreeSitterService` class encapsulates all Tree-sitter functionality
3. **Dynamic Loading**: Language grammars loaded on-demand from URLs or local files
4. **MCP Tools**: Exposes 6 tools for parsing, querying, and analyzing code

## Key Files

- `src/index.ts` - MCP server implementation and tool handlers
- `src/tree-sitter-service.ts` - Core Tree-sitter service logic
- `src/types.d.ts` - TypeScript type definitions for web-tree-sitter

## Development Guidelines

1. **TypeScript**: Strict mode enabled, compile to ES2020/CommonJS
2. **Error Handling**: Always provide detailed, actionable error messages
3. **Language Loading**: Check multiple paths (local npm, CDN) with graceful fallbacks
4. **Responses**: Include insights and suggested next actions in tool responses

## Testing

Run `node test-server.js` to test basic functionality. The test script:
- Spawns server as child process
- Tests MCP protocol communication
- Verifies parsing and querying capabilities

## Deployment

Configured for Smithery platform deployment via `smithery.yaml`. The server runs on stdio and implements the full MCP protocol.