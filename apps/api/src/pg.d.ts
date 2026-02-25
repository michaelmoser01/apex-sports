declare module "pg" {
  export class Client {
    constructor(config?: { connectionString?: string });
    connect(): Promise<void>;
    query<T = unknown>(queryText: string, values?: unknown[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
}
