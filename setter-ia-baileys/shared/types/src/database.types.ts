export interface DatabaseConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

export interface RedisConnection {
  host: string;
  port: number;
  password?: string;
  database?: number;
  maxRetries?: number;
}

export interface QueryResult<T = any> {
  rows: T[];
  count: number;
  affectedRows?: number;
}

export interface Transaction {
  id: string;
  query<T>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export enum DatabaseEventType {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  QUERY = 'query',
  SLOW_QUERY = 'slow_query'
}

export interface DatabaseEvent {
  type: DatabaseEventType;
  timestamp: Date;
  details?: any;
}

export interface DatabaseMetrics {
  activeConnections: number;
  totalConnections: number;
  queryCount: number;
  averageQueryTime: number;
  slowQueries: number;
  errors: number;
  uptime: number;
}