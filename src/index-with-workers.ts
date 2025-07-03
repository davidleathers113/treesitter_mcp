#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { WorkerPool } from './workers/worker-pool';
import { 
  stringifyParseResult,
  stringifyQueryResult,
  stringifyNodeAtPosition,
  stringifySyntaxTree,
  stringifyLanguageList,
  stringifyErrorResult,
  stringifyGenericResult
} from './schemas/response-schemas';

const server = new Server({
  name: 'tree-sitter-mcp-server',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {}
  }
});

// Initialize worker pool with configuration
const workerPool = new WorkerPool({
  poolSize: Math.min(4, require('os').cpus().length - 1),
  workerTimeout: 30000, // 30 seconds
  maxRequestsPerWorker: 1000,
  restartOnError: true
});

// Input validation to prevent prototype pollution
function sanitizeArgs(args: any): any {
  if (!args || typeof args !== 'object') {
    return {};
  }
  
  // Use structuredClone to create a clean copy without prototype chain
  try {
    return structuredClone(args);
  } catch {
    // Fallback for objects that can't be cloned (e.g., with functions)
    const clean: any = {};
    for (const key of Object.getOwnPropertyNames(args)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      clean[key] = args[key];
    }
    return clean;
  }
}

// Initialize worker pool with atomic promise cache
let initPromise: Promise<void> | null = null;
let poolInitialized = false;

async function ensurePoolInitialized() {
  if (poolInitialized) return;
  
  if (!initPromise) {
    initPromise = workerPool.initialize();
  }
  
  await initPromise;
  poolInitialized = true;
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'parse_code',
        description: 'Parse source code using Tree-sitter and return AST information',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The source code to parse'
            },
            language: {
              type: 'string',
              description: 'Programming language (e.g., "javascript", "typescript", "python")'
            },
            wasmPath: {
              type: 'string',
              description: 'Optional path to .wasm grammar file'
            }
          },
          required: ['code', 'language']
        }
      },
      {
        name: 'query_code',
        description: 'Query parsed code using Tree-sitter query syntax',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The source code to query'
            },
            language: {
              type: 'string',
              description: 'Programming language'
            },
            query: {
              type: 'string',
              description: 'Tree-sitter query string'
            },
            wasmPath: {
              type: 'string',
              description: 'Optional path to .wasm grammar file'
            }
          },
          required: ['code', 'language', 'query']
        }
      },
      {
        name: 'get_node_at_position',
        description: 'Get the AST node at a specific position in the code',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The source code'
            },
            language: {
              type: 'string',
              description: 'Programming language'
            },
            row: {
              type: 'number',
              description: 'Line number (0-based)'
            },
            column: {
              type: 'number',
              description: 'Column number (0-based)'
            },
            wasmPath: {
              type: 'string',
              description: 'Optional path to .wasm grammar file'
            }
          },
          required: ['code', 'language', 'row', 'column']
        }
      },
      {
        name: 'get_syntax_tree',
        description: 'Get the string representation of the syntax tree',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The source code'
            },
            language: {
              type: 'string',
              description: 'Programming language'
            },
            wasmPath: {
              type: 'string',
              description: 'Optional path to .wasm grammar file'
            }
          },
          required: ['code', 'language']
        }
      },
      {
        name: 'load_language',
        description: 'Load a Tree-sitter language grammar',
        inputSchema: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              description: 'Programming language to load'
            },
            wasmPath: {
              type: 'string',
              description: 'Path to .wasm grammar file'
            }
          },
          required: ['language']
        }
      },
      {
        name: 'list_languages',
        description: 'List all currently loaded Tree-sitter languages',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_worker_stats',
        description: 'Get statistics about the worker pool',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  
  // Sanitize args to prevent prototype pollution
  const args = sanitizeArgs(rawArgs);

  // Ensure args exists and is an object
  if (!rawArgs || typeof rawArgs !== 'object') {
    return {
      content: [{
        type: 'text',
        text: stringifyErrorResult({
          success: false,
          error: '🔴 Invalid request format: Missing or malformed arguments',
          details: 'This tool requires properly formatted arguments as a JSON object.',
          suggestions: [
            'Check that your arguments object is properly structured',
            'Verify all required parameters are included',
            'Refer to the tool schema for correct parameter names and types'
          ],
          tool: name,
          context: {
            received_args: args,
            expected_format: 'JSON object with tool-specific parameters'
          }
        })
      }],
      isError: true
    };
  }

  try {
    await ensurePoolInitialized();

    switch (name) {
      case 'parse_code': {
        const { code, language, wasmPath } = args as { code: string; language: string; wasmPath?: string };

        const startTime = Date.now();
        const result = await workerPool.parseCode(code, language, wasmPath);
        const parseTime = Date.now() - startTime;

        // Get language-specific query suggestions
        const getLanguageQueries = (lang: string) => {
          const queries: Record<string, string[]> = {
            javascript: [
              '(function_declaration name: (identifier) @func-name)',
              '(variable_declarator name: (identifier) @var-name)',
              '(call_expression function: (identifier) @call-name)'
            ],
            typescript: [
              '(interface_declaration name: (type_identifier) @interface-name)',
              '(type_alias_declaration name: (type_identifier) @type-name)',
              '(method_definition name: (property_identifier) @method-name)'
            ],
            python: [
              '(function_definition name: (identifier) @func-name)',
              '(class_definition name: (identifier) @class-name)',
              '(assignment left: (identifier) @var-name)'
            ]
          };
          return queries[lang] || ['(identifier) @name', '(string) @string-literal'];
        };

        return {
          content: [{
            type: 'text',
            text: stringifyParseResult({
              success: true,
              message: `✅ Successfully parsed ${result.nodeCount} AST nodes from ${language} source code`,
              data: result,
              insights: {
                parsing_successful: !result.hasError,
                node_count: result.nodeCount,
                code_length: code.length,
                has_syntax_errors: result.hasError,
                parse_time_ms: parseTime,
                performance: parseTime < 50 ? 'fast' : parseTime < 200 ? 'moderate' : 'slow',
                processed_by_worker: true
              },
              next_actions: [
                'Use query_code to search for specific patterns in this AST',
                'Use get_node_at_position to examine nodes at specific locations',
                'Use get_syntax_tree to see a human-readable tree structure',
                ...getLanguageQueries(language).map(q => `Try this ${language} query: ${q}`)
              ],
              context: {
                language: language,
                operation: 'parse_code',
                ast_root_type: result.rootNode.type
              }
            })
          }]
        };
      }

      case 'query_code': {
        const { code, language, query, wasmPath } = args as {
          code: string;
          language: string;
          query: string;
          wasmPath?: string;
        };

        const startTime = Date.now();
        const result = await workerPool.queryCode(code, language, query, wasmPath);
        const queryTime = Date.now() - startTime;
        return {
          content: [{
            type: 'text',
            text: stringifyQueryResult({
              success: true,
              message: result.matches.length > 0 ? `🔍 Found ${result.matches.length} matches in ${language} code` : `🔍 Query executed but found no matches in ${language} code`,
              data: result,
              insights: {
                match_count: result.matches.length,
                query_pattern: query,
                found_captures: result.matches.flatMap(m => m.captures.map(c => c.name)).filter((v, i, a) => a.indexOf(v) === i),
                query_time_ms: queryTime,
                performance: queryTime < 10 ? 'fast' : queryTime < 50 ? 'moderate' : 'slow',
                processed_by_worker: true
              },
              next_actions: result.matches.length > 0 ? [
                'Examine the captured nodes for detailed information',
                'Use the startPosition and endPosition to locate code in your editor',
                'Try variations of this query pattern to find related constructs'
              ] : [
                '🔧 Try a different query pattern - this one found no matches',
                '🌳 Use get_syntax_tree to understand the code structure first',
                '🔍 Start with simpler queries like (identifier) @name to test',
                `💡 For ${language}, try: (function_declaration) or (variable_declarator)`,
                '📚 Check Tree-sitter query syntax: (node_type field: (child_type) @capture)'
              ],
              context: {
                language: language,
                operation: 'query_code',
                query_complexity: query.split(/[@()]/).length - 1
              }
            })
          }]
        };
      }

      case 'get_node_at_position': {
        const { code, language, row, column, wasmPath } = args as {
          code: string;
          language: string;
          row: number;
          column: number;
          wasmPath?: string;
        };

        // Validate position bounds BEFORE calling getNodeAtPosition
        const lines = code.split('\n');
        const isValidPosition = row >= 0 && row < lines.length && column >= 0 && column <= lines[row]?.length;
        
        if (!isValidPosition) {
          return {
            content: [{
              type: 'text',
              text: stringifyErrorResult({
                success: false,
                error: `⚠️ Position out of bounds`,
                details: `Invalid position: row ${row}, column ${column}`,
                insights: {
                  position_valid: false,
                  code_bounds: {
                    max_row: lines.length - 1,
                    max_column_for_row: lines[row]?.length || 0
                  }
                },
                suggestions: [
                  `Valid range: row 0-${lines.length - 1}, column 0-${lines[row]?.length || 0}`,
                  '📐 Remember: positions are 0-based (row 0 = line 1, column 0 = first character)',
                  '💡 Try clicking in your editor and using those coordinates minus 1'
                ],
                context: {
                  language: language,
                  operation: 'get_node_at_position',
                  requested_position: {row, column},
                  coordinate_system: '0-based'
                }
              })
            }],
            isError: true
          };
        }

        const result = await workerPool.getNodeAtPosition(code, language, row, column, wasmPath);
        return {
          content: [{
            type: 'text',
            text: stringifyNodeAtPosition({
              success: true,
              message: result ? `🎯 Found AST node "${result.type}" at line ${row + 1}, column ${column + 1}` : `❌ No AST node found at line ${row + 1}, column ${column + 1}`,
              data: result,
              insights: {
                position_found: !!result,
                node_type: result?.type || null,
                text_content: result?.text || null,
                has_children: result ? result.children.length > 0 : false,
                child_count: result?.children.length || 0,
                position_valid: isValidPosition,
                code_bounds: {
                  max_row: lines.length - 1,
                  max_column_for_row: lines[row]?.length || 0
                },
                processed_by_worker: true
              },
              next_actions: result ? [
                'Examine the node\'s children array for nested elements',
                'Use the startPosition and endPosition for precise code location',
                'Try nearby positions to explore adjacent nodes'
              ] : [
                isValidPosition ? '🔍 Position is valid but no AST node found - try adjacent positions' : `⚠️ Position out of bounds - valid range: row 0-${lines.length - 1}, column 0-${lines[row]?.length || 0}`,
                '🌳 Use get_syntax_tree to see the overall structure first',
                '📐 Remember: positions are 0-based (row 0 = line 1, column 0 = first character)',
                '💡 Try clicking in your editor and using those coordinates minus 1'
              ],
              context: {
                language: language,
                operation: 'get_node_at_position',
                requested_position: {row, column},
                coordinate_system: '0-based (row 0 = line 1, column 0 = first character)'
              }
            })
          }]
        };
      }

      case 'get_syntax_tree': {
        const { code, language, wasmPath } = args as {
          code: string;
          language: string;
          wasmPath?: string;
        };

        const result = await workerPool.getSyntaxTree(code, language, wasmPath);
        const lineCount = result.split('\n').length;
        return {
          content: [{
            type: 'text',
            text: stringifySyntaxTree({
              success: true,
              message: `🌳 Generated human-readable syntax tree for ${language} code (${lineCount} lines)`,
              data: result,
              insights: {
                tree_format: 'S-expression style tree representation',
                line_count: lineCount,
                contains_structure: result.includes('(') && result.includes(')'),
                language_parsed: language,
                processed_by_worker: true
              },
              next_actions: [
                'Use this tree to understand the code\'s AST structure',
                'Identify node types for crafting Tree-sitter queries',
                'Look for patterns you want to search with query_code',
                'Use node names from this tree in your query patterns'
              ],
              context: {
                language: language,
                operation: 'get_syntax_tree',
                output_format: 'Tree-sitter S-expression syntax',
                usage_tip: 'Node types in parentheses can be used in queries, e.g., (function_declaration)'
              }
            })
          }]
        };
      }

      case 'load_language': {
        const { language, wasmPath } = args as { language: string; wasmPath?: string };

        await workerPool.loadLanguage(language, wasmPath);
        const loadedLanguages = await workerPool.getAvailableLanguages();
        return {
          content: [{
            type: 'text',
            text: stringifyGenericResult({
              success: true,
              message: `✅ ${language} language grammar loaded and ready for parsing`,
              details: wasmPath ? `Loaded from: ${wasmPath}` : `Loaded from default location for ${language}`,
              insights: {
                language_name: language,
                source: wasmPath || 'default',
                total_loaded_languages: loadedLanguages.length,
                is_newly_loaded: true,
                loaded_in_workers: true
              },
              next_actions: [
                `Use parse_code to analyze ${language} source code`,
                `Use query_code to search for patterns in ${language} files`,
                'The language parser is now cached in all worker threads for fast operations'
              ],
              context: {
                operation: 'load_language',
                available_languages: loadedLanguages,
                language_ready: true
              }
            })
          }]
        };
      }

      case 'list_languages': {
        const languages = await workerPool.getAvailableLanguages();
        return {
          content: [{
            type: 'text',
            text: stringifyLanguageList({
              success: true,
              message: languages.length > 0 ? `📋 Found ${languages.length} loaded language parser(s)` : '⚠️ No language parsers currently loaded',
              data: {
                languages: languages,
                count: languages.length
              },
              insights: {
                has_languages: languages.length > 0,
                ready_for_parsing: languages.length > 0,
                server_state: languages.length > 0 ? 'ready' : 'needs_languages',
                using_workers: true
              },
              next_actions: languages.length > 0 ? [
                'Use parse_code with any of these languages',
                'Languages are cached across all worker threads',
                'No need to reload - parsers persist between operations'
              ] : [
                'Use load_language to add parser support for your target language',
                'Provide a .wasm file path when loading (CDN URLs work well)',
                'Example: load_language with wasmPath for JavaScript, Python, etc.'
              ],
              context: {
                operation: 'list_languages',
                server_initialization_complete: true,
                parser_cache_distributed: true
              }
            })
          }]
        };
      }

      case 'get_worker_stats': {
        const stats = workerPool.getPoolStats();
        return {
          content: [{
            type: 'text',
            text: stringifyGenericResult({
              success: true,
              message: `📊 Worker Pool Statistics`,
              details: `Active: ${stats.activeWorkers}/${stats.poolSize} workers | Queue: ${stats.queueLength} requests`,
              data: {
                pool: {
                  size: stats.poolSize,
                  active: stats.activeWorkers,
                  busy: stats.busyWorkers,
                  idle: stats.activeWorkers - stats.busyWorkers
                },
                requests: {
                  pending: stats.pendingRequests,
                  queued: stats.queueLength,
                  total: stats.totalRequests,
                  errors: stats.totalErrors
                },
                workers: stats.workers
              },
              insights: {
                utilization: stats.busyWorkers > 0 ? `${Math.round((stats.busyWorkers / stats.activeWorkers) * 100)}%` : '0%',
                health: stats.totalErrors === 0 ? 'healthy' : stats.totalErrors < 5 ? 'degraded' : 'unhealthy',
                load: stats.queueLength > 0 ? 'high' : stats.busyWorkers > stats.activeWorkers / 2 ? 'moderate' : 'low'
              },
              next_actions: [
                'Monitor worker stats during heavy parsing operations',
                'Workers automatically restart on errors',
                'Pool size adjusts based on CPU cores'
              ],
              context: {
                operation: 'get_worker_stats',
                timestamp: new Date().toISOString()
              }
            })
          }]
        };
      }

      default:
        const availableTools = ['parse_code', 'query_code', 'get_node_at_position', 'get_syntax_tree', 'load_language', 'list_languages', 'get_worker_stats'];
        return {
          content: [{
            type: 'text',
            text: stringifyErrorResult({
              success: false,
              error: `❓ Unknown tool requested: "${name}"`,
              details: 'The Tree-sitter MCP server only supports specific code analysis tools.',
              available_tools: availableTools,
              suggestions: [
                'Check the spelling of the tool name',
                'Use tools/list to see all available tools',
                'Refer to AI_AGENT_GUIDE.md for detailed tool documentation',
                `Did you mean one of: ${availableTools.filter(t => t.includes(name.toLowerCase()) || name.toLowerCase().includes(t.split('_')[0])).join(', ') || availableTools.slice(0, 3).join(', ')}`
              ],
              context: {
                requested_tool: name,
                server_type: 'tree-sitter-mcp-server',
                available_tool_count: availableTools.length
              }
            })
          }],
          isError: true
        };
    }
  } catch (error) {
    // Log full error details server-side only
    console.error(`Tree-sitter operation error in ${name}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isLanguageError = errorMessage.includes('Could not load language');
    const isWasmError = errorMessage.includes('Failed to download') || errorMessage.includes('ENOENT');
    const isQueryError = errorMessage.includes('Query syntax error');
    const isWorkerError = errorMessage.includes('Worker') || errorMessage.includes('timed out');

    let suggestions = ['Check the error details above for specific guidance'];
    let details = 'An unexpected error occurred during operation.';

    if (isWorkerError) {
      details = 'A worker thread encountered an error.';
      suggestions = [
        'The operation will be automatically retried',
        'Worker threads restart on errors',
        'Check get_worker_stats for pool health'
      ];
    } else if (isLanguageError) {
      details = 'The requested language grammar is not available.';
      suggestions = [
        'Provide a wasmPath parameter with a valid .wasm grammar file',
        'Try using a CDN URL for the language grammar',
        'Use list_languages to see what\'s already loaded'
      ];
    } else if (isWasmError) {
      details = 'Failed to access the grammar file.';
      suggestions = [
        'Verify the .wasm file URL is correct and accessible',
        'Try a CDN URL for reliable access',
        'Check your internet connection if using remote URLs'
      ];
    } else if (isQueryError) {
      details = 'The query syntax is invalid.';
      suggestions = [
        'Check query syntax: (node_type) @capture_name',
        'Example: (function_declaration name: (identifier) @func-name)',
        'Use get_syntax_tree first to understand available node types'
      ];
    }

    return {
      content: [{
        type: 'text',
        text: stringifyErrorResult({
          success: false,
          error: `💥 Operation failed`,
          details: details,
          suggestions: suggestions,
          context: {
            tool: name,
            error_type: isWorkerError ? 'worker_error' : isLanguageError ? 'language_loading' : isWasmError ? 'wasm_access' : isQueryError ? 'query_syntax' : 'unknown',
            troubleshooting: 'Check the suggestions above or refer to the AI_AGENT_GUIDE.md for detailed examples'
          },
          // Remove debug_info to prevent verbose error disclosure
        })
      }],
      isError: true
    };
  }
});

// Check Node.js version compatibility
function checkNodeVersion() {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1), 10);
  
  if (majorVersion >= 19) {
    console.error(`⚠️  WARNING: Node.js ${nodeVersion} detected. web-tree-sitter has known compatibility issues with Node.js 19+.`);
    console.error('   Consider using Node.js 18.x or earlier for reliable operation.');
    console.error('   See: https://github.com/tree-sitter/tree-sitter/issues');
  }
}

// Graceful shutdown
async function shutdown() {
  console.error('Shutting down Tree-sitter MCP Server...');
  await workerPool.shutdown();
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the server
async function main() {
  // Check Node version compatibility
  checkNodeVersion();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Tree-sitter MCP Server (with workers) running on stdio');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});