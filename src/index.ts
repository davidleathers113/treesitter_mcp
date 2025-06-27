#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { TreeSitterService } from './tree-sitter-service';

const server = new Server({
  name: 'tree-sitter-mcp-server',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {}
  }
});

const treeSitterService = new TreeSitterService();

// Initialize Tree-sitter service
let serviceInitialized = false;

async function ensureServiceInitialized() {
  if (!serviceInitialized) {
    await treeSitterService.initialize();
    serviceInitialized = true;
  }
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
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Ensure args exists and is an object
  if (!args || typeof args !== 'object') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
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
        }, null, 2)
      }],
      isError: true
    };
  }

  try {
    await ensureServiceInitialized();

    switch (name) {
      case 'parse_code': {
        const { code, language, wasmPath } = args as { code: string; language: string; wasmPath?: string };

        // Load language if not already loaded
        await treeSitterService.loadLanguage(language, wasmPath);

        const startTime = Date.now();
        const result = treeSitterService.parseCode(code, language);
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
            text: JSON.stringify({
              success: true,
              message: `✅ Successfully parsed ${result.nodeCount} AST nodes from ${language} source code`,
              data: result,
              insights: {
                parsing_successful: !result.hasError,
                node_count: result.nodeCount,
                code_length: code.length,
                has_syntax_errors: result.hasError,
                parse_time_ms: parseTime,
                performance: parseTime < 50 ? 'fast' : parseTime < 200 ? 'moderate' : 'slow'
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
            }, null, 2)
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

        // Load language if not already loaded
        await treeSitterService.loadLanguage(language, wasmPath);

        const startTime = Date.now();
        const result = treeSitterService.queryCode(code, language, query);
        const queryTime = Date.now() - startTime;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: result.matches.length > 0 ? `🔍 Found ${result.matches.length} matches in ${language} code` : `🔍 Query executed but found no matches in ${language} code`,
              data: result,
              insights: {
                match_count: result.matches.length,
                query_pattern: query,
                found_captures: result.matches.flatMap(m => m.captures.map(c => c.name)).filter((v, i, a) => a.indexOf(v) === i),
                query_time_ms: queryTime,
                performance: queryTime < 10 ? 'fast' : queryTime < 50 ? 'moderate' : 'slow'
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
            }, null, 2)
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

        // Load language if not already loaded
        await treeSitterService.loadLanguage(language, wasmPath);

        // Validate position bounds
        const lines = code.split('\n');
        const isValidPosition = row >= 0 && row < lines.length && column >= 0 && column <= lines[row]?.length;

        const result = treeSitterService.getNodeAtPosition(code, language, row, column);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
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
                }
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
            }, null, 2)
          }]
        };
      }

      case 'get_syntax_tree': {
        const { code, language, wasmPath } = args as {
          code: string;
          language: string;
          wasmPath?: string;
        };

        // Load language if not already loaded
        await treeSitterService.loadLanguage(language, wasmPath);

        const result = treeSitterService.getSyntaxTree(code, language);
        const lineCount = result.split('\n').length;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `🌳 Generated human-readable syntax tree for ${language} code (${lineCount} lines)`,
              data: result,
              insights: {
                tree_format: 'S-expression style tree representation',
                line_count: lineCount,
                contains_structure: result.includes('(') && result.includes(')'),
                language_parsed: language
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
            }, null, 2)
          }]
        };
      }

      case 'load_language': {
        const { language, wasmPath } = args as { language: string; wasmPath?: string };

        await treeSitterService.loadLanguage(language, wasmPath);
        const loadedLanguages = treeSitterService.getAvailableLanguages();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `✅ ${language} language grammar loaded and ready for parsing`,
              details: wasmPath ? `Loaded from: ${wasmPath}` : `Loaded from default location for ${language}`,
              insights: {
                language_name: language,
                source: wasmPath || 'default',
                total_loaded_languages: loadedLanguages.length,
                is_newly_loaded: true
              },
              next_actions: [
                `Use parse_code to analyze ${language} source code`,
                `Use query_code to search for patterns in ${language} files`,
                'The language parser is now cached for fast subsequent operations'
              ],
              context: {
                operation: 'load_language',
                available_languages: loadedLanguages,
                language_ready: true
              }
            }, null, 2)
          }]
        };
      }

      case 'list_languages': {
        const languages = treeSitterService.getAvailableLanguages();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: languages.length > 0 ? `📋 Found ${languages.length} loaded language parser(s)` : '⚠️ No language parsers currently loaded',
              data: {
                languages: languages,
                count: languages.length
              },
              insights: {
                has_languages: languages.length > 0,
                ready_for_parsing: languages.length > 0,
                server_state: languages.length > 0 ? 'ready' : 'needs_languages'
              },
              next_actions: languages.length > 0 ? [
                'Use parse_code with any of these languages',
                'Languages are cached and ready for immediate use',
                'No need to reload - parsers persist between operations'
              ] : [
                'Use load_language to add parser support for your target language',
                'Provide a .wasm file path when loading (CDN URLs work well)',
                'Example: load_language with wasmPath for JavaScript, Python, etc.'
              ],
              context: {
                operation: 'list_languages',
                server_initialization_complete: true,
                parser_cache_size: languages.length
              }
            }, null, 2)
          }]
        };
      }

      default:
        const availableTools = ['parse_code', 'query_code', 'get_node_at_position', 'get_syntax_tree', 'load_language', 'list_languages'];
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
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
            }, null, 2)
          }],
          isError: true
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isLanguageError = errorMessage.includes('Could not load language');
    const isWasmError = errorMessage.includes('Failed to download') || errorMessage.includes('ENOENT');
    const isQueryError = errorMessage.includes('Query syntax error');

    let suggestions = ['Check the error details above for specific guidance'];
    let details = 'An unexpected error occurred during operation.';

    if (isLanguageError) {
      details = 'The requested language grammar is not available. Tree-sitter requires .wasm grammar files to parse code.';
      suggestions = [
        'Provide a wasmPath parameter with a valid .wasm grammar file',
        'Try: https://unpkg.com/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm',
        'Or install via npm: npm install tree-sitter-{language}',
        'Use list_languages to see what\'s already loaded'
      ];
    } else if (isWasmError) {
      details = 'Failed to download or access the .wasm grammar file. Check the URL or file path.';
      suggestions = [
        'Verify the .wasm file URL is correct and accessible',
        'Try a CDN URL like unpkg.com for reliable access',
        'Check your internet connection if using remote URLs',
        'Ensure local file paths are correct if using local files'
      ];
    } else if (isQueryError) {
      details = 'The Tree-sitter query syntax is invalid. Queries use S-expression format.';
      suggestions = [
        'Check query syntax: (node_type) @capture_name',
        'Example: (function_declaration name: (identifier) @func-name)',
        'Use get_syntax_tree first to understand available node types',
        'Refer to Tree-sitter query documentation for help'
      ];
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: `💥 Operation failed: ${errorMessage}`,
          details: details,
          suggestions: suggestions,
          context: {
            tool: name,
            error_type: isLanguageError ? 'language_loading' : isWasmError ? 'wasm_access' : isQueryError ? 'query_syntax' : 'unknown',
            troubleshooting: 'Check the suggestions above or refer to the AI_AGENT_GUIDE.md for detailed examples'
          },
          debug_info: {
            raw_error: errorMessage,
            timestamp: new Date().toISOString()
          }
        }, null, 2)
      }],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Tree-sitter MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});