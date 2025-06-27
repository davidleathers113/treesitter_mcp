import * as TreeSitter from 'web-tree-sitter';

export interface ParseResult {
  language: string;
  rootNode: {
    type: string;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
    text: string;
    children: any[];
  };
  nodeCount: number;
  hasError: boolean;
}

export interface QueryResult {
  matches: Array<{
    pattern: number;
    captures: Array<{
      name: string;
      node: {
        type: string;
        text: string;
        startPosition: { row: number; column: number };
        endPosition: { row: number; column: number };
      };
    }>;
  }>;
}

export interface Symbol {
  name: string;
  type: 'function' | 'class' | 'variable' | 'method' | 'property';
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  text: string;
}

export interface NodeInfo {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: NodeInfo[];
  parent?: NodeInfo;
}

export class TreeSitterService {
  private parsers: Map<string, TreeSitter.Parser> = new Map();
  private languages: Map<string, TreeSitter.Language> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await TreeSitter.Parser.init();
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Tree-sitter: ${error}`);
    }
  }

  async loadLanguage(languageId: string, wasmPath?: string): Promise<void> {
    await this.initialize();

    if (this.languages.has(languageId)) {
      return; // Already loaded
    }

    try {
      let language;

      if (wasmPath) {
        // Load from custom path (handle URLs vs local files)
        if (wasmPath.startsWith('http://') || wasmPath.startsWith('https://')) {
          // Download from URL
          const response = await fetch(wasmPath);
          if (!response.ok) {
            throw new Error(`Failed to download from ${wasmPath}: ${response.statusText}`);
          }
          const wasmBytes = await response.arrayBuffer();
          language = await TreeSitter.Language.load(new Uint8Array(wasmBytes));
        } else {
          // Load from local file
          language = await TreeSitter.Language.load(wasmPath);
        }
      } else {
        // Try to load from common locations or download
        const commonPaths = this.getCommonLanguagePaths(languageId);

        for (const path of commonPaths) {
          try {
            if (path.startsWith('http://') || path.startsWith('https://')) {
              // Download from URL
              const response = await fetch(path);
              if (!response.ok) {
                continue; // Try next path
              }
              const wasmBytes = await response.arrayBuffer();
              language = await TreeSitter.Language.load(new Uint8Array(wasmBytes));
            } else {
              // Load from local file
              language = await TreeSitter.Language.load(path);
            }
            break;
          } catch (e) {
            // Try next path
            continue;
          }
        }

        if (!language) {
          throw new Error(`Could not load language ${languageId}. Please provide a .wasm file path.`);
        }
      }

      this.languages.set(languageId, language);

      // Create a parser for this language
      const parser = new TreeSitter.Parser();
      parser.setLanguage(language);
      this.parsers.set(languageId, parser);

    } catch (error) {
      throw new Error(`Failed to load language ${languageId}: ${error}`);
    }
  }

  private getCommonLanguagePaths(languageId: string): string[] {
    // Common locations where .wasm files might be found
    const basePaths = [
      `./tree-sitter-${languageId}.wasm`,
      `./grammars/${languageId}.wasm`,
      `./node_modules/tree-sitter-${languageId}/tree-sitter-${languageId}.wasm`,
    ];

    // Add some URL-based paths for common languages (CDN)
    const cdnPaths = [
      `https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/${languageId}.wasm`,
    ];

    return [...basePaths, ...cdnPaths];
  }

  parseCode(code: string, languageId: string): ParseResult {
    if (!this.initialized) {
      throw new Error('TreeSitterService not initialized. Call initialize() first.');
    }

    const parser = this.parsers.get(languageId);
    if (!parser) {
      throw new Error(`Language ${languageId} not loaded. Call loadLanguage() first.`);
    }

    try {
      const tree = parser.parse(code);
      if (!tree) {
        throw new Error('Failed to parse code - parser returned null');
      }

      const rootNode = tree.rootNode;

      return {
        language: languageId,
        rootNode: {
          type: rootNode.type,
          startPosition: {
            row: rootNode.startPosition.row,
            column: rootNode.startPosition.column
          },
          endPosition: {
            row: rootNode.endPosition.row,
            column: rootNode.endPosition.column
          },
          text: rootNode.text,
          children: this.convertNodeChildren(rootNode)
        },
        nodeCount: this.countNodes(rootNode),
        hasError: rootNode.hasError
      };
    } catch (error) {
      throw new Error(`Failed to parse code: ${error}`);
    }
  }

  queryCode(code: string, languageId: string, queryString: string): QueryResult {
    if (!this.initialized) {
      throw new Error('TreeSitterService not initialized. Call initialize() first.');
    }

    const parser = this.parsers.get(languageId);
    const language = this.languages.get(languageId);

    if (!parser || !language) {
      throw new Error(`Language ${languageId} not loaded. Call loadLanguage() first.`);
    }

    try {
      const tree = parser.parse(code);
      if (!tree) {
        throw new Error('Failed to parse code - parser returned null');
      }

      const query = language.query(queryString);
      const matches = query.matches(tree.rootNode);

      return {
        matches: matches.map((match) => ({
          pattern: match.patternIndex,
          captures: match.captures.map((capture) => ({
            name: capture.name,
            node: {
              type: capture.node.type,
              text: capture.node.text,
              startPosition: {
                row: capture.node.startPosition.row,
                column: capture.node.startPosition.column
              },
              endPosition: {
                row: capture.node.endPosition.row,
                column: capture.node.endPosition.column
              }
            }
          }))
        }))
      };
    } catch (error) {
      throw new Error(`Failed to query code: ${error}`);
    }
  }

  getNodeAtPosition(code: string, languageId: string, row: number, column: number): NodeInfo | null {
    if (!this.initialized) {
      throw new Error('TreeSitterService not initialized. Call initialize() first.');
    }

    const parser = this.parsers.get(languageId);
    if (!parser) {
      throw new Error(`Language ${languageId} not loaded. Call loadLanguage() first.`);
    }

    try {
      const tree = parser.parse(code);
      if (!tree) {
        throw new Error('Failed to parse code - parser returned null');
      }

      const node = tree.rootNode.descendantForPosition({ row, column });

      if (!node) return null;

      return this.convertNodeToInfo(node);
    } catch (error) {
      throw new Error(`Failed to get node at position: ${error}`);
    }
  }

  getSyntaxTree(code: string, languageId: string): string {
    if (!this.initialized) {
      throw new Error('TreeSitterService not initialized. Call initialize() first.');
    }

    const parser = this.parsers.get(languageId);
    if (!parser) {
      throw new Error(`Language ${languageId} not loaded. Call loadLanguage() first.`);
    }

    try {
      const tree = parser.parse(code);
      if (!tree) {
        throw new Error('Failed to parse code - parser returned null');
      }

      return tree.rootNode.toString();
    } catch (error) {
      throw new Error(`Failed to get syntax tree: ${error}`);
    }
  }

  getAvailableLanguages(): string[] {
    return Array.from(this.languages.keys());
  }

  private convertNodeChildren(node: TreeSitter.Node): any[] {
    const children = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        children.push({
          type: child.type,
          text: child.text,
          startPosition: {
            row: child.startPosition.row,
            column: child.startPosition.column
          },
          endPosition: {
            row: child.endPosition.row,
            column: child.endPosition.column
          },
          children: this.convertNodeChildren(child)
        });
      }
    }
    return children;
  }

  private convertNodeToInfo(node: TreeSitter.Node): NodeInfo {
    return {
      type: node.type,
      text: node.text,
      startPosition: {
        row: node.startPosition.row,
        column: node.startPosition.column
      },
      endPosition: {
        row: node.endPosition.row,
        column: node.endPosition.column
      },
      children: this.convertNodeChildren(node),
      parent: node.parent ? this.convertNodeToInfo(node.parent) : undefined
    };
  }

  private countNodes(node: TreeSitter.Node): number {
    let count = 1;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        count += this.countNodes(child);
      }
    }
    return count;
  }

  public extractSymbols(code: string, language: string): Symbol[] {
    const symbols: Symbol[] = [];

    // Define common query patterns for different languages
    const queries = this.getSymbolQueries(language);

    for (const query of queries) {
      try {
        const result = this.queryCode(code, language, query.pattern);

        for (const match of result.matches) {
          for (const capture of match.captures) {
            if (capture.name === query.symbolName) {
              symbols.push({
                name: capture.node.text,
                type: query.type as any,
                startPosition: capture.node.startPosition,
                endPosition: capture.node.endPosition,
                text: capture.node.text
              });
            }
          }
        }
      } catch (error) {
        // Skip invalid queries for this language
        continue;
      }
    }

    return symbols;
  }

  public analyzeStructure(code: string, language: string): any {
    const parseResult = this.parseCode(code, language);
    const symbols = this.extractSymbols(code, language);

    return {
      language,
      hasError: parseResult.hasError,
      nodeCount: parseResult.nodeCount,
      symbols: {
        functions: symbols.filter(s => s.type === 'function').length,
        classes: symbols.filter(s => s.type === 'class').length,
        variables: symbols.filter(s => s.type === 'variable').length,
        methods: symbols.filter(s => s.type === 'method').length,
        properties: symbols.filter(s => s.type === 'property').length
      },
      topLevelNodes: parseResult.rootNode.children.map(child => child.type),
      symbolList: symbols
    };
  }

  private getSymbolQueries(language: string): Array<{pattern: string, symbolName: string, type: string}> {
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'js':
      case 'typescript':
      case 'ts':
      case 'tsx':
        return [
          {
            pattern: '(function_declaration name: (identifier) @function)',
            symbolName: 'function',
            type: 'function'
          },
          {
            pattern: '(class_declaration name: (identifier) @class)',
            symbolName: 'class',
            type: 'class'
          },
          {
            pattern: '(method_definition name: (property_identifier) @method)',
            symbolName: 'method',
            type: 'method'
          },
          {
            pattern: '(variable_declarator name: (identifier) @variable)',
            symbolName: 'variable',
            type: 'variable'
          }
        ];

      case 'python':
      case 'py':
        return [
          {
            pattern: '(function_definition name: (identifier) @function)',
            symbolName: 'function',
            type: 'function'
          },
          {
            pattern: '(class_definition name: (identifier) @class)',
            symbolName: 'class',
            type: 'class'
          }
        ];

      default:
        return [];
    }
  }
}