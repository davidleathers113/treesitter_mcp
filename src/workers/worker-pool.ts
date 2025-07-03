import { Worker } from 'worker_threads';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkerPoolOptions,
  PendingRequest,
  WorkerRequest,
  WorkerResponse,
  WorkerMessageType,
  WorkerTimeoutError,
  WorkerPoolError,
  WorkerCrashedError,
  isErrorResponse,
  isSuccessResponse,
  isReadyResponse,
  ParseCodeRequest,
  QueryCodeRequest,
  GetNodeAtPositionRequest,
  GetSyntaxTreeRequest,
  LoadLanguageRequest,
  GetAvailableLanguagesRequest,
  GetCacheStatsRequest,
  ClearCacheRequest,
  PreloadCommonLanguagesRequest
} from './types';

import { ParseResult, QueryResult, NodeInfo, CacheStats } from '../tree-sitter-service';

export interface WorkerInfo {
  id: number;
  worker: Worker;
  busy: boolean;
  activeRequest?: string;
  requestCount: number;
  errorCount: number;
  lastError?: string;
  startTime: number;
}

export class WorkerPool {
  private workers: WorkerInfo[] = [];
  private pendingRequests = new Map<string, PendingRequest>();
  private requestQueue: PendingRequest[] = [];
  private nextWorkerId = 0;
  private currentWorkerIndex = 0;
  private isShuttingDown = false;
  
  private readonly options: Required<WorkerPoolOptions>;
  private readonly workerPath: string;

  constructor(options: WorkerPoolOptions = {}) {
    this.options = {
      poolSize: options.poolSize ?? Math.min(4, os.cpus().length - 1),
      workerTimeout: options.workerTimeout ?? 30000, // 30 seconds
      maxRequestsPerWorker: options.maxRequestsPerWorker ?? 1000,
      restartOnError: options.restartOnError ?? true
    };

    // Ensure at least 1 worker
    this.options.poolSize = Math.max(1, this.options.poolSize);
    
    // Resolve worker path
    const ext = path.extname(__filename);
    this.workerPath = path.join(__dirname, `parser-worker${ext}`);
  }

  async initialize(): Promise<void> {
    if (this.workers.length > 0) {
      return; // Already initialized
    }

    console.error(`Initializing worker pool with ${this.options.poolSize} workers`);
    
    const initPromises: Promise<void>[] = [];
    for (let i = 0; i < this.options.poolSize; i++) {
      initPromises.push(this.createWorker());
    }

    await Promise.all(initPromises);
    console.error(`Worker pool initialized with ${this.workers.length} workers`);
  }

  private async createWorker(): Promise<void> {
    const workerId = this.nextWorkerId++;
    
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath, {
        workerData: { workerId }
      });

      const workerInfo: WorkerInfo = {
        id: workerId,
        worker,
        busy: false,
        requestCount: 0,
        errorCount: 0,
        startTime: Date.now()
      };

      // Handle worker messages
      worker.on('message', (message: WorkerResponse) => {
        if (isReadyResponse(message)) {
          this.workers.push(workerInfo);
          console.error(`Worker ${workerId} ready`);
          resolve();
          return;
        }

        // Handle request responses
        const pendingRequest = this.pendingRequests.get(message.id);
        if (!pendingRequest) {
          console.error(`No pending request found for ${message.id}`);
          return;
        }

        // Clear timeout
        if (pendingRequest.timeout) {
          clearTimeout(pendingRequest.timeout);
        }

        // Remove from pending
        this.pendingRequests.delete(message.id);
        workerInfo.busy = false;
        workerInfo.activeRequest = undefined;

        // Handle response
        if (isSuccessResponse(message)) {
          pendingRequest.resolve(message.result);
        } else if (isErrorResponse(message)) {
          pendingRequest.reject(new Error(message.error));
        }

        // Process queued requests
        this.processQueue();
      });

      // Handle worker errors
      worker.on('error', (error) => {
        console.error(`Worker ${workerId} error:`, error);
        workerInfo.errorCount++;
        workerInfo.lastError = error.message;
        
        // Handle initialization error
        if (!this.workers.includes(workerInfo)) {
          reject(error);
          return;
        }

        // Handle runtime error
        this.handleWorkerError(workerInfo, error);
      });

      // Handle worker exit
      worker.on('exit', (code) => {
        console.error(`Worker ${workerId} exited with code ${code}`);
        
        // Remove from pool
        const index = this.workers.findIndex(w => w.id === workerId);
        if (index !== -1) {
          this.workers.splice(index, 1);
        }

        // Handle pending requests
        for (const [requestId, request] of this.pendingRequests.entries()) {
          if (workerInfo.activeRequest === requestId) {
            this.pendingRequests.delete(requestId);
            if (request.timeout) {
              clearTimeout(request.timeout);
            }
            request.reject(new WorkerCrashedError(workerId, `Worker exited with code ${code}`));
          }
        }

        // Restart if needed and not shutting down
        if (this.options.restartOnError && !this.isShuttingDown && this.workers.includes(workerInfo)) {
          console.error(`Restarting worker ${workerId}`);
          this.createWorker().catch(err => {
            console.error(`Failed to restart worker ${workerId}:`, err);
          });
        }
      });

      // Set initialization timeout
      const initTimeout = setTimeout(() => {
        worker.terminate();
        reject(new Error(`Worker ${workerId} failed to initialize within timeout`));
      }, 10000); // 10 second init timeout

      // Clear timeout on ready
      worker.once('message', () => {
        clearTimeout(initTimeout);
      });
    });
  }

  private handleWorkerError(workerInfo: WorkerInfo, error: Error): void {
    // Fail active request
    if (workerInfo.activeRequest) {
      const pendingRequest = this.pendingRequests.get(workerInfo.activeRequest);
      if (pendingRequest) {
        this.pendingRequests.delete(workerInfo.activeRequest);
        if (pendingRequest.timeout) {
          clearTimeout(pendingRequest.timeout);
        }
        pendingRequest.reject(new WorkerCrashedError(workerInfo.id, error.message));
      }
    }

    workerInfo.busy = false;
    workerInfo.activeRequest = undefined;

    // Restart worker if too many errors
    if (workerInfo.errorCount > 5) {
      console.error(`Worker ${workerInfo.id} has too many errors, terminating`);
      workerInfo.worker.terminate();
    }
  }

  private getNextWorker(): WorkerInfo | null {
    if (this.workers.length === 0) {
      return null;
    }

    // Round-robin through workers
    let attempts = 0;
    while (attempts < this.workers.length) {
      const worker = this.workers[this.currentWorkerIndex];
      this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
      
      if (!worker.busy) {
        // Check if worker needs restart due to request limit
        if (worker.requestCount >= this.options.maxRequestsPerWorker) {
          console.error(`Worker ${worker.id} reached request limit, restarting`);
          this.restartWorker(worker);
          attempts++;
          continue;
        }
        
        return worker;
      }
      
      attempts++;
    }

    return null; // All workers busy
  }

  private async restartWorker(workerInfo: WorkerInfo): Promise<void> {
    const index = this.workers.findIndex(w => w.id === workerInfo.id);
    if (index === -1) return;

    // Remove from pool
    this.workers.splice(index, 1);

    // Terminate old worker
    workerInfo.worker.terminate();

    // Create new worker
    try {
      await this.createWorker();
    } catch (error) {
      console.error(`Failed to restart worker:`, error);
    }
  }

  private processQueue(): void {
    while (this.requestQueue.length > 0) {
      const worker = this.getNextWorker();
      if (!worker) {
        break; // No available workers
      }

      const request = this.requestQueue.shift();
      if (!request) continue;

      this.sendToWorker(worker, request);
    }
  }

  private sendToWorker(worker: WorkerInfo, pendingRequest: PendingRequest): void {
    worker.busy = true;
    worker.activeRequest = pendingRequest.id;
    worker.requestCount++;

    // Set timeout
    pendingRequest.timeout = setTimeout(() => {
      this.pendingRequests.delete(pendingRequest.id);
      worker.busy = false;
      worker.activeRequest = undefined;
      
      const duration = Date.now() - pendingRequest.startTime;
      pendingRequest.reject(new WorkerTimeoutError(pendingRequest.id, duration));
      
      // Restart worker if it's not responding
      if (this.options.restartOnError) {
        console.error(`Worker ${worker.id} timed out, restarting`);
        this.restartWorker(worker);
      }
    }, this.options.workerTimeout);

    // Send request to worker
    worker.worker.postMessage(pendingRequest.request);
  }

  private async executeRequest<T>(request: WorkerRequest): Promise<T> {
    if (this.isShuttingDown) {
      throw new WorkerPoolError('Worker pool is shutting down');
    }

    // Ensure pool is initialized
    if (this.workers.length === 0) {
      await this.initialize();
    }

    return new Promise<T>((resolve, reject) => {
      const pendingRequest: PendingRequest = {
        id: request.id,
        request,
        resolve,
        reject,
        startTime: Date.now()
      };

      this.pendingRequests.set(request.id, pendingRequest);

      // Try to get a worker immediately
      const worker = this.getNextWorker();
      if (worker) {
        this.sendToWorker(worker, pendingRequest);
      } else {
        // Queue the request
        this.requestQueue.push(pendingRequest);
      }
    });
  }

  // Public API methods
  async parseCode(code: string, language: string, wasmPath?: string): Promise<ParseResult> {
    const request: ParseCodeRequest = {
      id: uuidv4(),
      type: WorkerMessageType.PARSE_CODE,
      code,
      language,
      wasmPath
    };
    return this.executeRequest<ParseResult>(request);
  }

  async queryCode(code: string, language: string, query: string, wasmPath?: string): Promise<QueryResult> {
    const request: QueryCodeRequest = {
      id: uuidv4(),
      type: WorkerMessageType.QUERY_CODE,
      code,
      language,
      query,
      wasmPath
    };
    return this.executeRequest<QueryResult>(request);
  }

  async getNodeAtPosition(code: string, language: string, row: number, column: number, wasmPath?: string): Promise<NodeInfo | null> {
    const request: GetNodeAtPositionRequest = {
      id: uuidv4(),
      type: WorkerMessageType.GET_NODE_AT_POSITION,
      code,
      language,
      row,
      column,
      wasmPath
    };
    return this.executeRequest<NodeInfo | null>(request);
  }

  async getSyntaxTree(code: string, language: string, wasmPath?: string): Promise<string> {
    const request: GetSyntaxTreeRequest = {
      id: uuidv4(),
      type: WorkerMessageType.GET_SYNTAX_TREE,
      code,
      language,
      wasmPath
    };
    return this.executeRequest<string>(request);
  }

  async loadLanguage(language: string, wasmPath?: string): Promise<void> {
    const request: LoadLanguageRequest = {
      id: uuidv4(),
      type: WorkerMessageType.LOAD_LANGUAGE,
      language,
      wasmPath
    };
    await this.executeRequest<{ loaded: boolean }>(request);
  }

  async getAvailableLanguages(): Promise<string[]> {
    const request: GetAvailableLanguagesRequest = {
      id: uuidv4(),
      type: WorkerMessageType.GET_AVAILABLE_LANGUAGES
    };
    return this.executeRequest<string[]>(request);
  }

  async getCacheStats(): Promise<CacheStats> {
    const request: GetCacheStatsRequest = {
      id: uuidv4(),
      type: WorkerMessageType.GET_CACHE_STATS
    };
    return this.executeRequest<CacheStats>(request);
  }

  async clearCache(): Promise<void> {
    const request: ClearCacheRequest = {
      id: uuidv4(),
      type: WorkerMessageType.CLEAR_CACHE
    };
    await this.executeRequest<{ cleared: boolean }>(request);
  }

  async preloadCommonLanguages(): Promise<void> {
    const request: PreloadCommonLanguagesRequest = {
      id: uuidv4(),
      type: WorkerMessageType.PRELOAD_COMMON_LANGUAGES
    };
    await this.executeRequest<{ preloaded: boolean }>(request);
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Clear request queue
    for (const request of this.requestQueue) {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      request.reject(new WorkerPoolError('Worker pool shutting down'));
    }
    this.requestQueue = [];

    // Wait for pending requests to complete (with timeout)
    const shutdownTimeout = 5000; // 5 seconds
    const startTime = Date.now();
    
    while (this.pendingRequests.size > 0 && Date.now() - startTime < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Cancel remaining requests
    for (const [id, request] of this.pendingRequests.entries()) {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      request.reject(new WorkerPoolError('Worker pool shut down'));
    }
    this.pendingRequests.clear();

    // Terminate all workers
    const terminatePromises = this.workers.map(worker => {
      return worker.worker.terminate();
    });

    await Promise.all(terminatePromises);
    this.workers = [];
    
    console.error('Worker pool shut down');
  }

  // Get pool statistics
  getPoolStats(): {
    poolSize: number;
    activeWorkers: number;
    busyWorkers: number;
    queueLength: number;
    pendingRequests: number;
    totalRequests: number;
    totalErrors: number;
    workers: Array<{
      id: number;
      busy: boolean;
      requestCount: number;
      errorCount: number;
      uptime: number;
    }>;
  } {
    const totalRequests = this.workers.reduce((sum, w) => sum + w.requestCount, 0);
    const totalErrors = this.workers.reduce((sum, w) => sum + w.errorCount, 0);
    const busyWorkers = this.workers.filter(w => w.busy).length;

    return {
      poolSize: this.options.poolSize,
      activeWorkers: this.workers.length,
      busyWorkers,
      queueLength: this.requestQueue.length,
      pendingRequests: this.pendingRequests.size,
      totalRequests,
      totalErrors,
      workers: this.workers.map(w => ({
        id: w.id,
        busy: w.busy,
        requestCount: w.requestCount,
        errorCount: w.errorCount,
        uptime: Date.now() - w.startTime
      }))
    };
  }
}