# Worker Thread Infrastructure

This document describes the worker thread infrastructure implemented for the Tree-sitter MCP server to move CPU-intensive parsing operations off the main thread.

## Overview

The worker infrastructure consists of three main components:

1. **Worker Pool** (`src/workers/worker-pool.ts`) - Manages a pool of worker threads
2. **Parser Worker** (`src/workers/parser-worker.ts`) - Individual worker thread implementation
3. **Types** (`src/workers/types.ts`) - Shared type definitions and message contracts

## Architecture

### Worker Pool (`WorkerPool`)

The `WorkerPool` class manages multiple worker threads and provides a promise-based API that matches the original `TreeSitterService` interface:

- **Round-robin scheduling** - Distributes requests evenly across workers
- **Queue management** - Handles high load scenarios with request queuing
- **Worker lifecycle** - Creates, monitors, and restarts workers as needed
- **Timeout handling** - Configurable timeouts with automatic retry
- **Graceful shutdown** - Properly terminates workers and completes pending requests

#### Key Features:

- **Automatic scaling**: Pool size defaults to `Math.min(4, os.cpus().length - 1)`
- **Error recovery**: Workers restart automatically on crashes
- **Request limits**: Workers restart after processing a configurable number of requests
- **Health monitoring**: Tracks worker performance and error rates

### Parser Worker (`parser-worker.ts`)

Each worker thread runs its own instance of `TreeSitterService` and handles:

- **Language loading**: WebAssembly grammars loaded independently in each worker
- **Code parsing**: CPU-intensive AST generation
- **Query execution**: Tree-sitter query processing
- **Cache management**: Each worker maintains its own caches

#### Worker Lifecycle:

1. **Initialization**: Worker starts and initializes Tree-sitter
2. **Ready signal**: Sends ready message to pool
3. **Request processing**: Handles incoming parse requests
4. **Error handling**: Reports errors and can restart on failure
5. **Shutdown**: Graceful cleanup on termination

### Message Protocol

Workers communicate via a structured message protocol defined in `types.ts`:

```typescript
// Request types
- PARSE_CODE
- QUERY_CODE
- GET_NODE_AT_POSITION
- GET_SYNTAX_TREE
- LOAD_LANGUAGE
- GET_AVAILABLE_LANGUAGES
- GET_CACHE_STATS
- CLEAR_CACHE
- PRELOAD_COMMON_LANGUAGES

// Response types
- SUCCESS
- ERROR
- READY
```

## Configuration

The worker infrastructure is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `TREESITTER_USE_WORKERS` | `true` | Enable/disable worker mode |
| `TREESITTER_WORKER_POOL_SIZE` | `Math.min(4, cpus-1)` | Number of worker threads |
| `TREESITTER_WORKER_TIMEOUT` | `30000` | Request timeout (ms) |
| `TREESITTER_MAX_REQUESTS_PER_WORKER` | `1000` | Worker restart threshold |
| `TREESITTER_RESTART_WORKERS` | `true` | Auto-restart on errors |

## Usage

The worker infrastructure is transparent to the API. The server automatically chooses between direct mode and worker mode based on configuration:

```typescript
// Configuration determines mode
const config = loadConfig();

if (config.useWorkers) {
  // Worker pool mode
  const result = await workerPool.parseCode(code, language);
} else {
  // Direct mode  
  const result = await treeSitterService.parseCode(code, language);
}
```

## Performance Benefits

### CPU-Intensive Operations

Tree-sitter parsing is CPU-intensive, especially for large files. Workers prevent blocking:

- **Main thread**: Remains responsive for MCP protocol handling
- **Worker threads**: Handle AST generation and query processing
- **Parallel processing**: Multiple requests can be processed simultaneously

### Memory Isolation

Each worker maintains its own memory space:

- **Independent caches**: Parsers, WASM bytes, and trees cached per worker
- **Memory safety**: Worker crashes don't affect the main process
- **Resource limits**: Workers can be restarted to prevent memory leaks

### Scalability

The pool adapts to system resources:

- **CPU cores**: Pool size scales with available cores
- **Request queuing**: Handles burst traffic gracefully  
- **Load balancing**: Round-robin distribution prevents hot spots

## Monitoring

### Worker Statistics

The `get_worker_stats` tool provides real-time monitoring:

```json
{
  "pool": {
    "size": 4,
    "active": 4,
    "busy": 2,
    "idle": 2
  },
  "requests": {
    "pending": 0,
    "queued": 0,
    "total": 1247,
    "errors": 0
  },
  "workers": [
    {
      "id": 1,
      "busy": true,
      "requestCount": 312,
      "errorCount": 0,
      "uptime": 125340
    }
  ]
}
```

### Health Indicators

- **Utilization**: Percentage of workers currently busy
- **Health**: Based on error count (healthy/degraded/unhealthy)
- **Load**: Current system load (low/moderate/high)

## Error Handling

### Worker Crashes

When a worker crashes:

1. **Request failure**: Active request fails with `WorkerCrashedError`
2. **Worker restart**: New worker spawned automatically
3. **Queue processing**: Queued requests distributed to other workers

### Timeout Handling

Requests that exceed the timeout:

1. **Timeout error**: Request fails with `WorkerTimeoutError`
2. **Worker restart**: Unresponsive worker is terminated and restarted
3. **Retry logic**: Can be implemented at the application level

### Graceful Degradation

If workers fail to start:

1. **Fallback**: System can fall back to direct mode
2. **Error reporting**: Clear error messages for debugging
3. **Configuration**: Easy to disable workers via environment variables

## Development

### Adding New Operations

To add a new worker operation:

1. **Define message types** in `types.ts`
2. **Add handler** in `parser-worker.ts`
3. **Add method** to `WorkerPool` class
4. **Update main index.ts** to use new method

### Testing

Test both modes independently:

```bash
# Test direct mode
TREESITTER_USE_WORKERS=false npm test

# Test worker mode  
TREESITTER_USE_WORKERS=true npm test
```

### Debugging

Enable debug logging:

```bash
TREESITTER_LOG_LEVEL=debug TREESITTER_LOG_WORKER_STATS=true npm start
```

## Troubleshooting

### Common Issues

1. **Worker timeout**: Increase `TREESITTER_WORKER_TIMEOUT`
2. **High memory usage**: Decrease `TREESITTER_MAX_REQUESTS_PER_WORKER`
3. **Slow startup**: Workers need time to initialize WebAssembly
4. **Node.js compatibility**: Use Node.js 18.x for best results

### Performance Tuning

- **Pool size**: Adjust based on CPU cores and memory
- **Request limits**: Lower for memory-constrained environments
- **Timeouts**: Balance responsiveness vs. processing time
- **Cache settings**: Configure per-worker cache sizes

## Future Enhancements

Potential improvements to the worker infrastructure:

1. **Worker specialization**: Dedicate workers to specific languages
2. **Load-based scaling**: Dynamic pool sizing based on load
3. **Persistent workers**: Keep workers alive across server restarts
4. **Shared memory**: Share parsed trees between workers
5. **Metrics collection**: Detailed performance and usage metrics