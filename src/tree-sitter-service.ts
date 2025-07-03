import * as TreeSitter from 'web-tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsp } from 'fs';
import { z } from 'zod';
import { LRUCache } from 'lru-cache';

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

interface TreeCache {
  tree: TreeSitter.Tree;
  code: string;
}

export interface CacheStats {
  parserCache: {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
  wasmCache: {
    size: number;
    sizeInBytes: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
  treeCache: {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
}

export class TreeSitterService {
  private initialized = false;
  
  // LRU caches with specific configurations
  private parserCache: LRUCache<string, { parser: TreeSitter.Parser; language: TreeSitter.Language }>;
  private wasmBytesCache: LRUCache<string, Uint8Array>;
  private treeCache: LRUCache<string, TreeCache>;
  
  // Cache statistics
  private parserCacheStats = { hits: 0, misses: 0 };
  private wasmCacheStats = { hits: 0, misses: 0 };
  private treeCacheStats = { hits: 0, misses: 0 };
  
  // Common languages to preload
  private readonly commonLanguages = [
    'javascript', 'typescript', 'python', 'java', 'c', 'cpp',
    'go', 'rust', 'ruby', 'php', 'html', 'css', 'json'
  ];
  
  // Security: Allowed hosts for loading WASM files
  private readonly allowedHosts = [
    'cdn.jsdelivr.net',
    'unpkg.com',
    'github.com',
    'raw.githubusercontent.com'
  ];
  
  constructor() {
    // Initialize parser cache: max 10 entries, 1 hour TTL, ~5MB per parser
    this.parserCache = new LRUCache<string, { parser: TreeSitter.Parser; language: TreeSitter.Language }>({
      max: 10,
      ttl: 1000 * 60 * 60, // 1 hour
      dispose: (value) => {
        // Properly dispose of parser when evicted
        try {
          value.parser.delete();
        } catch (e) {
          console.error('Error disposing parser:', e);
        }
      },
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
    
    // Initialize WASM bytes cache: max 50MB total, 24 hours TTL
    this.wasmBytesCache = new LRUCache<string, Uint8Array>({
      maxSize: 50 * 1024 * 1024, // 50MB total
      ttl: 1000 * 60 * 60 * 24, // 24 hours
      sizeCalculation: (value) => value.byteLength,
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
    
    // Initialize tree cache: max 100 entries, 1 minute TTL
    this.treeCache = new LRUCache<string, TreeCache>({
      max: 100,
      ttl: 1000 * 60, // 1 minute
      dispose: () => {
        // Trees are automatically garbage collected
      },
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
  }
  
  // Zod schema for language ID validation
  private readonly languageIdSchema = z.string()
    .min(1, 'Language ID cannot be empty')
    .max(50, 'Language ID too long')
    .refine(
      (val) => val.split('').every(char => 
        (char >= 'a' && char <= 'z') ||
        (char >= 'A' && char <= 'Z') ||
        (char >= '0' && char <= '9') ||
        char === '_' ||
        char === '-'
      ),
      'Language ID can only contain alphanumeric characters, underscores, and hyphens'
    );

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async readWasmBytes(filePath: string): Promise<Buffer> {
    return fsp.readFile(filePath);
  }
  
  private validateWasmUrl(url: string): void {
    const parsedUrl = new URL(url);
    
    // Enforce HTTPS
    if (parsedUrl.protocol !== 'https:') {
      throw new Error(`Security: Only HTTPS URLs are allowed for WASM loading. Received: ${url}`);
    }
    
    // Check against allowlist
    if (!this.allowedHosts.includes(parsedUrl.hostname)) {
      throw new Error(`Security: Host '${parsedUrl.hostname}' is not in the allowed list. Allowed hosts: ${this.allowedHosts.join(', ')}`);
    }
  }
  
  private getCachedTree(code: string, languageId: string): TreeSitter.Tree | null {
    const cacheKey = `${languageId}:${code}`;
    const cached = this.treeCache.get(cacheKey);
    
    if (!cached) {
      this.treeCacheStats.misses++;
      return null;
    }
    
    // Verify code hasn't changed (extra safety check)
    if (cached.code !== code) {
      this.treeCache.delete(cacheKey);
      this.treeCacheStats.misses++;
      return null;
    }
    
    this.treeCacheStats.hits++;
    return cached.tree;
  }
  
  private setCachedTree(code: string, languageId: string, tree: TreeSitter.Tree): void {
    const cacheKey = `${languageId}:${code}`;
    this.treeCache.set(cacheKey, {
      tree,
      code
    });
  }
  
  private parseWithCache(code: string, languageId: string): TreeSitter.Tree {
    // Check cache first
    const cached = this.getCachedTree(code, languageId);
    if (cached) return cached;
    
    // Get parser from cache
    const parserEntry = this.parserCache.get(languageId) || this.parserCache.get(`${languageId}:default`);
    if (!parserEntry) {
      throw new Error(`Language ${languageId} not loaded. Call loadLanguage() first.`);
    }
    
    const tree = parserEntry.parser.parse(code);
    if (!tree) {
      throw new Error('Failed to parse code - parser returned null');
    }
    
    // Cache the result
    this.setCachedTree(code, languageId, tree);
    
    return tree;
  }

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

    // Validate language ID using Zod to prevent injection attacks
    const validationResult = this.languageIdSchema.safeParse(languageId);
    if (!validationResult.success) {
      throw new Error(`Invalid language ID: ${validationResult.error.errors[0].message}`);
    }

    // Generate cache key
    const cacheKey = `${languageId}:${wasmPath || 'default'}`;
    
    // Check if parser is already cached
    if (this.parserCache.has(cacheKey)) {
      this.parserCacheStats.hits++;
      return;
    }
    
    this.parserCacheStats.misses++;

    const loadAttempts: { source: string; error?: string }[] = [];

    try {
      let language;

      if (wasmPath) {
        // Load from custom path (handle URLs vs local files)
        try {
          if (wasmPath.startsWith('http://') || wasmPath.startsWith('https://')) {
            // Validate URL for security
            this.validateWasmUrl(wasmPath);
            
            // Download from URL
            const response = await fetch(wasmPath);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const wasmBytes = await response.arrayBuffer();
            const bytes = new Uint8Array(wasmBytes);
            this.wasmBytesCache.set(wasmPath, bytes);
            language = await TreeSitter.Language.load(bytes);
            loadAttempts.push({ source: `Custom URL: ${wasmPath}` });
          } else {
            // Load from local file
            if (!(await this.fileExists(wasmPath))) {
              throw new Error(`File not found: ${wasmPath}`);
            }
            // Check WASM cache first
            let bytes = this.wasmBytesCache.get(wasmPath);
            if (bytes) {
              this.wasmCacheStats.hits++;
            } else {
              this.wasmCacheStats.misses++;
              const wasmBytes = await this.readWasmBytes(wasmPath);
              bytes = new Uint8Array(wasmBytes);
              this.wasmBytesCache.set(wasmPath, bytes);
            }
            language = await TreeSitter.Language.load(bytes);
            loadAttempts.push({ source: `Custom file: ${wasmPath}` });
          }
        } catch (e) {
          loadAttempts.push({ source: `Custom path: ${wasmPath}`, error: String(e) });
          throw e;
        }
      } else {
        // Try to load from common locations with detailed error tracking
        const commonPaths = this.getCommonLanguagePaths(languageId);

        for (const pathItem of commonPaths) {
          try {
            if (pathItem.startsWith('http://') || pathItem.startsWith('https://')) {
              // Validate URL for security (skip validation for known CDN paths)
              try {
                this.validateWasmUrl(pathItem);
              } catch (securityError) {
                const errorMsg = securityError instanceof Error ? securityError.message : String(securityError);
                loadAttempts.push({ source: `CDN: ${pathItem}`, error: errorMsg });
                continue;
              }
              
              // Download from URL with better error handling
              const controller = new AbortController();
              // Adaptive timeout: larger files need more time, especially on slower connections
              // Common WASM files are 1-5MB, allow up to 30s for poor connections
              const timeoutMs = 30000; // 30 seconds for WASM files
              const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
              
              try {
                const response = await fetch(pathItem, { 
                  signal: controller.signal,
                  headers: { 'User-Agent': 'tree-sitter-mcp-server/1.0' }
                });
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                // Check WASM cache first
                let bytes = this.wasmBytesCache.get(pathItem);
                if (bytes) {
                  this.wasmCacheStats.hits++;
                } else {
                  this.wasmCacheStats.misses++;
                  const wasmBytes = await response.arrayBuffer();
                  bytes = new Uint8Array(wasmBytes);
                  this.wasmBytesCache.set(pathItem, bytes);
                }
                language = await TreeSitter.Language.load(bytes);
                loadAttempts.push({ source: `CDN: ${pathItem}` });
                break;
              } catch (fetchError) {
                clearTimeout(timeoutId);
                const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
                loadAttempts.push({ source: `CDN: ${pathItem}`, error: errorMsg });
                continue;
              }
            } else {
              // Load from local file with existence check
              if (!(await this.fileExists(pathItem))) {
                loadAttempts.push({ source: `Local: ${pathItem}`, error: 'File not found' });
                continue;
              }
              // Check WASM cache first
              let bytes = this.wasmBytesCache.get(pathItem);
              if (bytes) {
                this.wasmCacheStats.hits++;
              } else {
                this.wasmCacheStats.misses++;
                const wasmBytes = await this.readWasmBytes(pathItem);
                bytes = new Uint8Array(wasmBytes);
                this.wasmBytesCache.set(pathItem, bytes);
              }
              language = await TreeSitter.Language.load(bytes);
              loadAttempts.push({ source: `Local: ${pathItem}` });
              break;
            }
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            loadAttempts.push({ source: pathItem, error: errorMsg });
            continue;
          }
        }

        if (!language) {
          const errorDetails = loadAttempts
            .filter(a => a.error)
            .map(a => `  - ${a.source}: ${a.error}`)
            .join('\n');
          throw new Error(
            `Could not load language ${languageId} from any source.\n\n` +
            `Attempted sources:\n${errorDetails}\n\n` +
            `Please provide a valid .wasm file path or ensure internet connectivity for CDN access.`
          );
        }
      }

      // Create a parser for this language
      const parser = new TreeSitter.Parser();
      parser.setLanguage(language);
      
      // Cache the parser and language
      this.parserCache.set(cacheKey, { parser, language });

      // Log successful load for debugging
      if (loadAttempts.length > 0) {
        const successSource = loadAttempts.find(a => !a.error);
        console.error(`Successfully loaded ${languageId} from: ${successSource?.source || 'unknown source'}`);
      }

    } catch (error) {
      throw new Error(`Failed to load language ${languageId}: ${error}`);
    }
  }

  private getCommonLanguagePaths(languageId: string): string[] {
    const paths: string[] = [];
    
    // 1. First priority: bundled WASM files from tree-sitter-wasms package
    const bundledPath = path.join(__dirname, '..', 'node_modules', 'tree-sitter-wasms', 'out', `tree-sitter-${languageId}.wasm`);
    paths.push(bundledPath);
    
    // Also try from current working directory's node_modules
    const cwdBundledPath = path.join(process.cwd(), 'node_modules', 'tree-sitter-wasms', 'out', `tree-sitter-${languageId}.wasm`);
    if (cwdBundledPath !== bundledPath) {
      paths.push(cwdBundledPath);
    }
    
    // 2. Local project-specific paths
    paths.push(
      `./tree-sitter-${languageId}.wasm`,
      `./grammars/${languageId}.wasm`,
      `./node_modules/tree-sitter-${languageId}/tree-sitter-${languageId}.wasm`
    );
    
    // 3. CDN fallbacks (multiple sources for redundancy)
    const cdnPaths = [
      // jsDelivr (tends to be more reliable)
      `https://cdn.jsdelivr.net/npm/tree-sitter-${languageId}@latest/tree-sitter-${languageId}.wasm`,
      // unpkg
      `https://unpkg.com/tree-sitter-${languageId}/tree-sitter-${languageId}.wasm`,
      // GitHub raw (jeff-hykin's collection)
      `https://github.com/jeff-hykin/common_tree_sitter_languages/raw/main/${languageId}.wasm`,
    ];
    
    // Handle special naming cases
    const languageMap: Record<string, string> = {
      'c_sharp': 'c-sharp',
      'c-sharp': 'c_sharp',
    };
    
    if (languageMap[languageId]) {
      const altName = languageMap[languageId];
      paths.push(
        path.join(__dirname, '..', 'node_modules', 'tree-sitter-wasms', 'out', `tree-sitter-${altName}.wasm`),
        path.join(process.cwd(), 'node_modules', 'tree-sitter-wasms', 'out', `tree-sitter-${altName}.wasm`)
      );
    }
    
    return [...paths, ...cdnPaths];
  }

  parseCode(code: string, languageId: string): ParseResult {
    if (!this.initialized) {
      throw new Error('TreeSitterService not initialized. Call initialize() first.');
    }

    try {
      const tree = this.parseWithCache(code, languageId);

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

    const parserEntry = this.parserCache.get(languageId) || this.parserCache.get(`${languageId}:default`);
    if (!parserEntry) {
      throw new Error(`Language ${languageId} not loaded. Call loadLanguage() first.`);
    }
    const language = parserEntry.language;

    try {
      const tree = this.parseWithCache(code, languageId);

      // Using deprecated signature for compatibility with web-tree-sitter
      const query = (language as any).query(queryString);
      const matches = query.matches(tree.rootNode);

      return {
        matches: matches.map((match: any) => ({
          pattern: match.patternIndex,
          captures: match.captures.map((capture: any) => ({
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

    try {
      const tree = this.parseWithCache(code, languageId);

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

    try {
      const tree = this.parseWithCache(code, languageId);

      return tree.rootNode.toString();
    } catch (error) {
      throw new Error(`Failed to get syntax tree: ${error}`);
    }
  }

  getAvailableLanguages(): string[] {
    const languages = new Set<string>();
    for (const key of this.parserCache.keys()) {
      const [lang] = key.split(':');
      languages.add(lang);
    }
    return Array.from(languages);
  }
  
  /**
   * Clear all caches
   */
  clearCache(): void {
    this.parserCache.clear();
    this.wasmBytesCache.clear();
    this.treeCache.clear();
    
    // Reset statistics
    this.parserCacheStats = { hits: 0, misses: 0 };
    this.wasmCacheStats = { hits: 0, misses: 0 };
    this.treeCacheStats = { hits: 0, misses: 0 };
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    const calculateHitRate = (stats: { hits: number; misses: number }) => {
      const total = stats.hits + stats.misses;
      return total > 0 ? (stats.hits / total) * 100 : 0;
    };
    
    return {
      parserCache: {
        size: this.parserCache.size,
        hits: this.parserCacheStats.hits,
        misses: this.parserCacheStats.misses,
        hitRate: calculateHitRate(this.parserCacheStats)
      },
      wasmCache: {
        size: this.wasmBytesCache.size,
        sizeInBytes: this.wasmBytesCache.calculatedSize || 0,
        hits: this.wasmCacheStats.hits,
        misses: this.wasmCacheStats.misses,
        hitRate: calculateHitRate(this.wasmCacheStats)
      },
      treeCache: {
        size: this.treeCache.size,
        hits: this.treeCacheStats.hits,
        misses: this.treeCacheStats.misses,
        hitRate: calculateHitRate(this.treeCacheStats)
      }
    };
  }
  
  /**
   * Preload common languages to warm the cache
   */
  async preloadCommonLanguages(): Promise<void> {
    const loadPromises = this.commonLanguages.map(async (lang) => {
      try {
        await this.loadLanguage(lang);
        console.error(`Preloaded language: ${lang}`);
      } catch (error) {
        console.error(`Failed to preload language ${lang}:`, error);
      }
    });
    
    await Promise.all(loadPromises);
  }

  private convertNodeChildren(node: TreeSitter.Node): any[] {
    const result: any[] = [];
    const stack: Array<{ node: TreeSitter.Node; parentArr: any[] }> = [];
    
    // Add children to stack in reverse order so they're processed in order
    for (let i = node.childCount - 1; i >= 0; i--) {
      const child = node.child(i);
      if (child) {
        stack.push({ node: child, parentArr: result });
      }
    }
    
    while (stack.length > 0) {
      const { node: currentNode, parentArr } = stack.pop()!;
      const nodeInfo = {
        type: currentNode.type,
        text: currentNode.text,
        startPosition: {
          row: currentNode.startPosition.row,
          column: currentNode.startPosition.column
        },
        endPosition: {
          row: currentNode.endPosition.row,
          column: currentNode.endPosition.column
        },
        children: [] as any[]
      };
      parentArr.push(nodeInfo);
      
      // Add children in reverse order
      for (let i = currentNode.childCount - 1; i >= 0; i--) {
        const child = currentNode.child(i);
        if (child) {
          stack.push({ node: child, parentArr: nodeInfo.children });
        }
      }
    }
    
    return result;
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