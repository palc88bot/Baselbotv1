/**
 * Type declarations for Bun Native SQLite
 */
declare module "bun:sqlite" {
  export class Database {
    constructor(filename: string, options?: { create?: boolean });
    run(sql: string, ...params: any[]): any;
    query(sql: string): {
      all(...params: any[]): any[];
      get(...params: any[]): any;
      run(...params: any[]): any;
    };
    close(): void;
  }
}
