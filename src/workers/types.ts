import { ParseResult, QueryResult, NodeInfo, CacheStats } from '../tree-sitter-service';

// Message types
export enum WorkerMessageType {
  // Requests from main thread
  PARSE_CODE = 'PARSE_CODE',
  QUERY_CODE = 'QUERY_CODE',
  GET_NODE_AT_POSITION = 'GET_NODE_AT_POSITION',
  GET_SYNTAX_TREE = 'GET_SYNTAX_TREE',
  LOAD_LANGUAGE = 'LOAD_LANGUAGE',
  GET_AVAILABLE_LANGUAGES = 'GET_AVAILABLE_LANGUAGES',
  GET_CACHE_STATS = 'GET_CACHE_STATS',
  CLEAR_CACHE = 'CLEAR_CACHE',
  PRELOAD_COMMON_LANGUAGES = 'PRELOAD_COMMON_LANGUAGES',
  
  // Responses from worker
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  
  // Worker lifecycle
  READY = 'READY',
  SHUTDOWN = 'SHUTDOWN'
}

// Base message structure
export interface WorkerMessage {
  id: string;
  type: WorkerMessageType;
}

// Request messages
export interface ParseCodeRequest extends WorkerMessage {
  type: WorkerMessageType.PARSE_CODE;
  code: string;
  language: string;
  wasmPath?: string;
}

export interface QueryCodeRequest extends WorkerMessage {
  type: WorkerMessageType.QUERY_CODE;
  code: string;
  language: string;
  query: string;
  wasmPath?: string;
}

export interface GetNodeAtPositionRequest extends WorkerMessage {
  type: WorkerMessageType.GET_NODE_AT_POSITION;
  code: string;
  language: string;
  row: number;
  column: number;
  wasmPath?: string;
}

export interface GetSyntaxTreeRequest extends WorkerMessage {
  type: WorkerMessageType.GET_SYNTAX_TREE;
  code: string;
  language: string;
  wasmPath?: string;
}

export interface LoadLanguageRequest extends WorkerMessage {
  type: WorkerMessageType.LOAD_LANGUAGE;
  language: string;
  wasmPath?: string;
}

export interface GetAvailableLanguagesRequest extends WorkerMessage {
  type: WorkerMessageType.GET_AVAILABLE_LANGUAGES;
}

export interface GetCacheStatsRequest extends WorkerMessage {
  type: WorkerMessageType.GET_CACHE_STATS;
}

export interface ClearCacheRequest extends WorkerMessage {
  type: WorkerMessageType.CLEAR_CACHE;
}

export interface PreloadCommonLanguagesRequest extends WorkerMessage {
  type: WorkerMessageType.PRELOAD_COMMON_LANGUAGES;
}

export interface ShutdownRequest extends WorkerMessage {
  type: WorkerMessageType.SHUTDOWN;
}

export type WorkerRequest = 
  | ParseCodeRequest
  | QueryCodeRequest
  | GetNodeAtPositionRequest
  | GetSyntaxTreeRequest
  | LoadLanguageRequest
  | GetAvailableLanguagesRequest
  | GetCacheStatsRequest
  | ClearCacheRequest
  | PreloadCommonLanguagesRequest
  | ShutdownRequest;

// Response messages
export interface SuccessResponse<T = any> extends WorkerMessage {
  type: WorkerMessageType.SUCCESS;
  result: T;
}

export interface ErrorResponse extends WorkerMessage {
  type: WorkerMessageType.ERROR;
  error: string;
  stack?: string;
}

export interface ReadyResponse extends WorkerMessage {
  type: WorkerMessageType.READY;
  workerId: number;
}

export type WorkerResponse<T = any> = 
  | SuccessResponse<T>
  | ErrorResponse
  | ReadyResponse;

// Type guards
export function isParseCodeRequest(msg: WorkerMessage): msg is ParseCodeRequest {
  return msg.type === WorkerMessageType.PARSE_CODE;
}

export function isQueryCodeRequest(msg: WorkerMessage): msg is QueryCodeRequest {
  return msg.type === WorkerMessageType.QUERY_CODE;
}

export function isGetNodeAtPositionRequest(msg: WorkerMessage): msg is GetNodeAtPositionRequest {
  return msg.type === WorkerMessageType.GET_NODE_AT_POSITION;
}

export function isGetSyntaxTreeRequest(msg: WorkerMessage): msg is GetSyntaxTreeRequest {
  return msg.type === WorkerMessageType.GET_SYNTAX_TREE;
}

export function isLoadLanguageRequest(msg: WorkerMessage): msg is LoadLanguageRequest {
  return msg.type === WorkerMessageType.LOAD_LANGUAGE;
}

export function isGetAvailableLanguagesRequest(msg: WorkerMessage): msg is GetAvailableLanguagesRequest {
  return msg.type === WorkerMessageType.GET_AVAILABLE_LANGUAGES;
}

export function isGetCacheStatsRequest(msg: WorkerMessage): msg is GetCacheStatsRequest {
  return msg.type === WorkerMessageType.GET_CACHE_STATS;
}

export function isClearCacheRequest(msg: WorkerMessage): msg is ClearCacheRequest {
  return msg.type === WorkerMessageType.CLEAR_CACHE;
}

export function isPreloadCommonLanguagesRequest(msg: WorkerMessage): msg is PreloadCommonLanguagesRequest {
  return msg.type === WorkerMessageType.PRELOAD_COMMON_LANGUAGES;
}

export function isShutdownRequest(msg: WorkerMessage): msg is ShutdownRequest {
  return msg.type === WorkerMessageType.SHUTDOWN;
}

export function isErrorResponse(msg: WorkerMessage): msg is ErrorResponse {
  return msg.type === WorkerMessageType.ERROR;
}

export function isSuccessResponse<T = any>(msg: WorkerMessage): msg is SuccessResponse<T> {
  return msg.type === WorkerMessageType.SUCCESS;
}

export function isReadyResponse(msg: WorkerMessage): msg is ReadyResponse {
  return msg.type === WorkerMessageType.READY;
}

// Worker pool types will be defined in worker-pool.ts to avoid import conflicts

export interface WorkerPoolOptions {
  poolSize?: number;
  workerTimeout?: number;
  maxRequestsPerWorker?: number;
  restartOnError?: boolean;
}

export interface PendingRequest {
  id: string;
  request: WorkerRequest;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  startTime: number;
  timeout?: NodeJS.Timeout;
}

// Error types
export class WorkerTimeoutError extends Error {
  constructor(public readonly requestId: string, public readonly duration: number) {
    super(`Worker request ${requestId} timed out after ${duration}ms`);
    this.name = 'WorkerTimeoutError';
  }
}

export class WorkerPoolError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'WorkerPoolError';
  }
}

export class WorkerCrashedError extends Error {
  constructor(public readonly workerId: number, message: string) {
    super(`Worker ${workerId} crashed: ${message}`);
    this.name = 'WorkerCrashedError';
  }
}