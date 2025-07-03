import * as os from 'os';

export interface TreeSitterMCPConfig {
  // Worker configuration
  useWorkers: boolean;
  workerPoolSize: number;
  workerTimeout: number;
  maxRequestsPerWorker: number;
  restartWorkersOnError: boolean;
  
  // Performance configuration
  enableCaching: boolean;
  cacheSize: {
    parsers: number;
    wasmBytes: number; // in MB
    trees: number;
  };
  cacheTTL: {
    parsers: number; // in ms
    wasmBytes: number; // in ms
    trees: number; // in ms
  };
  
  // Language preloading
  preloadLanguages: boolean;
  languagesToPreload: string[];
  
  // Debug configuration
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  logWorkerStats: boolean;
}

export function getDefaultConfig(): TreeSitterMCPConfig {
  const cpuCount = os.cpus().length;
  
  return {
    // Worker configuration
    useWorkers: process.env.TREESITTER_USE_WORKERS !== 'false',
    workerPoolSize: parseInt(process.env.TREESITTER_WORKER_POOL_SIZE || '') || Math.min(4, cpuCount - 1),
    workerTimeout: parseInt(process.env.TREESITTER_WORKER_TIMEOUT || '') || 30000,
    maxRequestsPerWorker: parseInt(process.env.TREESITTER_MAX_REQUESTS_PER_WORKER || '') || 1000,
    restartWorkersOnError: process.env.TREESITTER_RESTART_WORKERS !== 'false',
    
    // Performance configuration
    enableCaching: process.env.TREESITTER_ENABLE_CACHE !== 'false',
    cacheSize: {
      parsers: parseInt(process.env.TREESITTER_PARSER_CACHE_SIZE || '') || 10,
      wasmBytes: parseInt(process.env.TREESITTER_WASM_CACHE_SIZE_MB || '') || 50,
      trees: parseInt(process.env.TREESITTER_TREE_CACHE_SIZE || '') || 100
    },
    cacheTTL: {
      parsers: parseInt(process.env.TREESITTER_PARSER_CACHE_TTL || '') || 3600000, // 1 hour
      wasmBytes: parseInt(process.env.TREESITTER_WASM_CACHE_TTL || '') || 86400000, // 24 hours
      trees: parseInt(process.env.TREESITTER_TREE_CACHE_TTL || '') || 60000 // 1 minute
    },
    
    // Language preloading
    preloadLanguages: process.env.TREESITTER_PRELOAD_LANGUAGES === 'true',
    languagesToPreload: process.env.TREESITTER_LANGUAGES_TO_PRELOAD?.split(',').map(l => l.trim()) || [
      'javascript', 'typescript', 'python', 'go', 'rust'
    ],
    
    // Debug configuration
    logLevel: (process.env.TREESITTER_LOG_LEVEL as any) || 'error',
    logWorkerStats: process.env.TREESITTER_LOG_WORKER_STATS === 'true'
  };
}

export function loadConfig(): TreeSitterMCPConfig {
  const config = getDefaultConfig();
  
  // Validate configuration
  if (config.workerPoolSize < 1) {
    config.workerPoolSize = 1;
  }
  
  if (config.workerTimeout < 1000) {
    config.workerTimeout = 1000; // Minimum 1 second
  }
  
  if (config.maxRequestsPerWorker < 10) {
    config.maxRequestsPerWorker = 10;
  }
  
  // Log configuration if debug level
  if (config.logLevel === 'debug') {
    console.error('Tree-sitter MCP Configuration:', JSON.stringify(config, null, 2));
  }
  
  return config;
}