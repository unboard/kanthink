/**
 * Types for lib/db/migrations.mjs.
 *
 * The implementation is plain ESM so `node` can run it during the deploy step with no
 * build tooling; this file gives TypeScript consumers the same guarantees.
 */
export declare const ALTER_STATEMENTS: string[]
export declare const CREATE_TABLE_STATEMENTS: string[]
export declare const DATA_MIGRATIONS: string[]
export declare const INDEX_STATEMENTS: string[]
export declare const ALL_STATEMENTS: string[]
export declare const REQUIRED_COLUMNS: Array<[string, string]>
export declare function isBenignMigrationError(error: unknown): boolean
