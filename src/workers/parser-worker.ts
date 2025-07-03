import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { TreeSitterService } from '../tree-sitter-service';
import {
  WorkerMessage,
  WorkerMessageType,
  WorkerRequest,
  WorkerResponse,
  SuccessResponse,
  ErrorResponse,
  ReadyResponse,
  isParseCodeRequest,
  isQueryCodeRequest,
  isGetNodeAtPositionRequest,
  isGetSyntaxTreeRequest,
  isLoadLanguageRequest,
  isGetAvailableLanguagesRequest,
  isGetCacheStatsRequest,
  isClearCacheRequest,
  isPreloadCommonLanguagesRequest,
  isShutdownRequest
} from './types';

// Ensure we're running in a worker thread
if (isMainThread) {
  throw new Error('This file must be run as a worker thread');
}

if (!parentPort) {
  throw new Error('No parent port available');
}

// Create TreeSitterService instance for this worker
const treeSitterService = new TreeSitterService();
const workerId = workerData?.workerId || process.pid;

// Track request processing for debugging
let requestsProcessed = 0;
let lastRequestTime = Date.now();

// Send ready message
const sendMessage = (message: WorkerResponse) => {
  if (parentPort) {
    parentPort.postMessage(message);
  }
};

// Handle errors consistently
const handleError = (id: string, error: any): void => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorResponse: ErrorResponse = {
    id,
    type: WorkerMessageType.ERROR,
    error: errorMessage,
    stack: error instanceof Error ? error.stack : undefined
  };
  sendMessage(errorResponse);
};

// Handle messages from main thread
const handleMessage = async (message: WorkerRequest): Promise<void> => {
  const startTime = Date.now();
  requestsProcessed++;
  lastRequestTime = startTime;

  try {
    // Ensure service is initialized
    await treeSitterService.initialize();

    // Handle different request types
    if (isParseCodeRequest(message)) {
      // Load language if needed
      if (message.wasmPath || !treeSitterService.getAvailableLanguages().includes(message.language)) {
        await treeSitterService.loadLanguage(message.language, message.wasmPath);
      }
      
      const result = treeSitterService.parseCode(message.code, message.language);
      const response: SuccessResponse = {
        id: message.id,
        type: WorkerMessageType.SUCCESS,
        result
      };
      sendMessage(response);
    }
    else if (isQueryCodeRequest(message)) {
      // Load language if needed
      if (message.wasmPath || !treeSitterService.getAvailableLanguages().includes(message.language)) {
        await treeSitterService.loadLanguage(message.language, message.wasmPath);
      }
      
      const result = treeSitterService.queryCode(message.code, message.language, message.query);
      const response: SuccessResponse = {
        id: message.id,
        type: WorkerMessageType.SUCCESS,
        result
      };
      sendMessage(response);
    }
    else if (isGetNodeAtPositionRequest(message)) {
      // Load language if needed
      if (message.wasmPath || !treeSitterService.getAvailableLanguages().includes(message.language)) {
        await treeSitterService.loadLanguage(message.language, message.wasmPath);
      }
      
      const result = treeSitterService.getNodeAtPosition(
        message.code,
        message.language,
        message.row,
        message.column
      );
      const response: SuccessResponse = {
        id: message.id,
        type: WorkerMessageType.SUCCESS,
        result
      };
      sendMessage(response);
    }
    else if (isGetSyntaxTreeRequest(message)) {
      // Load language if needed
      if (message.wasmPath || !treeSitterService.getAvailableLanguages().includes(message.language)) {
        await treeSitterService.loadLanguage(message.language, message.wasmPath);
      }
      
      const result = treeSitterService.getSyntaxTree(message.code, message.language);
      const response: SuccessResponse = {
        id: message.id,
        type: WorkerMessageType.SUCCESS,
        result
      };
      sendMessage(response);
    }
    else if (isLoadLanguageRequest(message)) {
      await treeSitterService.loadLanguage(message.language, message.wasmPath);
      const response: SuccessResponse = {
        id: message.id,
        type: WorkerMessageType.SUCCESS,
        result: { loaded: true, language: message.language }
      };
      sendMessage(response);
    }
    else if (isGetAvailableLanguagesRequest(message)) {
      const result = treeSitterService.getAvailableLanguages();
      const response: SuccessResponse = {
        id: message.id,
        type: WorkerMessageType.SUCCESS,
        result
      };
      sendMessage(response);
    }
    else if (isGetCacheStatsRequest(message)) {
      const result = treeSitterService.getCacheStats();
      const response: SuccessResponse = {
        id: message.id,
        type: WorkerMessageType.SUCCESS,
        result
      };
      sendMessage(response);
    }
    else if (isClearCacheRequest(message)) {
      treeSitterService.clearCache();
      const response: SuccessResponse = {
        id: message.id,
        type: WorkerMessageType.SUCCESS,
        result: { cleared: true }
      };
      sendMessage(response);
    }
    else if (isPreloadCommonLanguagesRequest(message)) {
      await treeSitterService.preloadCommonLanguages();
      const response: SuccessResponse = {
        id: message.id,
        type: WorkerMessageType.SUCCESS,
        result: { preloaded: true, languages: treeSitterService.getAvailableLanguages() }
      };
      sendMessage(response);
    }
    else if (isShutdownRequest(message)) {
      // Clean up before exit
      treeSitterService.clearCache();
      const response: SuccessResponse = {
        id: message.id,
        type: WorkerMessageType.SUCCESS,
        result: { shutdown: true }
      };
      sendMessage(response);
      
      // Give time for message to be sent
      setTimeout(() => {
        process.exit(0);
      }, 100);
    }
    else {
      throw new Error(`Unknown message type: ${(message as any).type}`);
    }

    const duration = Date.now() - startTime;
    if (duration > 1000) {
      console.error(`Worker ${workerId}: Slow request ${message.type} took ${duration}ms`);
    }
  } catch (error) {
    handleError(message.id, error);
  }
};

// Set up message listener
parentPort.on('message', (message: WorkerRequest) => {
  handleMessage(message).catch(error => {
    console.error(`Worker ${workerId}: Fatal error handling message:`, error);
    handleError(message.id, error);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`Worker ${workerId}: Uncaught exception:`, error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`Worker ${workerId}: Unhandled rejection at:`, promise, 'reason:', reason);
  process.exit(1);
});

// Initialize and send ready message
(async () => {
  try {
    await treeSitterService.initialize();
    const readyMessage: ReadyResponse = {
      id: 'worker-ready',
      type: WorkerMessageType.READY,
      workerId
    };
    sendMessage(readyMessage);
    console.error(`Worker ${workerId}: Ready for requests`);
  } catch (error) {
    console.error(`Worker ${workerId}: Failed to initialize:`, error);
    process.exit(1);
  }
})();