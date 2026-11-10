/**
 * D1 database access layer for Cloudflare Pages.
 *
 * Replaces the Prisma+SQLite client. Exposes a Prisma-like fluent API
 * backed by Cloudflare D1 SQL so API routes need minimal changes.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

export type D1Database = {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<unknown>;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
};

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta?: { changes?: number };
}

function getDB(): D1Database {
  const ctx = getCloudflareContext() as { env?: { DB?: D1Database } };
  const db = ctx.env?.DB;
  if (!db) throw new Error("D1 database binding 'DB' is not available");
  return db;
}

/** Generate a CUID-like unique id. */
function cuid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Build a WHERE clause from a Prisma-like filter object. */
function buildWhere(
  where: Record<string, unknown> | undefined
): { clause: string; params: unknown[] } {
  if (!where || Object.keys(where).length === 0) {
    return { clause: "", params: [] };
  }
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined || value === null) continue;
    if (key === "OR" && Array.isArray(value)) {
      const orParts: string[] = [];
      for (const cond of value) {
        const sub = buildWhere(cond as Record<string, unknown>);
        orParts.push(sub.clause);
        params.push(...sub.params);
      }
      if (orParts.length) parts.push(`(${orParts.join(" OR ")})`);
    } else {
      parts.push(`${key} = ?`);
      params.push(value);
    }
  }
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

interface FindManyOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, "asc" | "desc">;
  take?: number;
}

interface FindUniqueOptions {
  where: Record<string, unknown>;
}

interface UpsertOptions {
  where: Record<string, unknown>;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

/** Map camelCase composite keys (e.g. userId_contentId) to SQL. */
function compositeWhere(where: Record<string, unknown>): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined || value === null) continue;
    parts.push(`${key} = ?`);
    params.push(value);
  }
  return { clause: `WHERE ${parts.join(" AND ")}`, params };
}

class TableClient<T extends Record<string, unknown>> {
  constructor(private name: string, private uniqueFields: string[] = []) {}

  async findMany(opts: FindManyOptions = {}): Promise<T[]> {
    const db = getDB();
    const { clause, params } = buildWhere(opts.where);
    let sql = `SELECT * FROM ${this.name} ${clause}`;
    if (opts.orderBy) {
      const orderParts = Object.entries(opts.orderBy).map(
        ([col, dir]) => `${col} ${dir.toUpperCase()}`
      );
      sql += ` ORDER BY ${orderParts.join(", ")}`;
    }
    if (opts.take) sql += ` LIMIT ${opts.take}`;
    const result = await db.prepare(sql).bind(...params).all<T>();
    return result.results ?? [];
  }

  async findUnique(opts: FindUniqueOptions): Promise<T | null> {
    const db = getDB();
    const { clause, params } = compositeWhere(opts.where);
    const sql = `SELECT * FROM ${this.name} ${clause} LIMIT 1`;
    return db.prepare(sql).bind(...params).first<T>();
  }

  async create({ data }: { data: Record<string, unknown> }): Promise<T> {
    const db = getDB();
    const id = data.id ?? cuid();
    const cols = ["id", ...Object.keys(data).filter((k) => k !== "id")];
    const vals: unknown[] = [id, ...cols.slice(1).map((c) => data[c])];
    const placeholders = cols.map(() => "?").join(", ");
    const sql = `INSERT INTO ${this.name} (${cols.join(", ")}) VALUES (${placeholders})`;
    await db.prepare(sql).bind(...vals).run();
    const created = await db
      .prepare(`SELECT * FROM ${this.name} WHERE id = ?`)
      .bind(id)
      .first<T>();
    return created ?? ({ ...data, id } as T);
  }

  async update({
    where,
    data,
  }: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<T> {
    const db = getDB();
    const setParts = Object.keys(data).filter((k) => data[k] !== undefined);
    const setVals = setParts.map((k) => data[k]);
    const { clause, params: whereParams } = compositeWhere(where);
    const sql = `UPDATE ${this.name} SET ${setParts
      .map((c) => `${c} = ?`)
      .join(", ")} ${clause}`;
    await db.prepare(sql).bind(...setVals, ...whereParams).run();
    const updated = await db
      .prepare(`SELECT * FROM ${this.name} ${clause} LIMIT 1`)
      .bind(...whereParams)
      .first<T>();
    return updated ?? ({ ...data } as T);
  }

  async upsert(opts: UpsertOptions): Promise<T> {
    const db = getDB();
    const existing = await this.findUnique({ where: opts.where });
    if (existing) {
      return this.update({ where: opts.where, data: opts.update });
    }
    return this.create({ data: { ...opts.where, ...opts.create } });
  }

  async delete({ where }: { where: Record<string, unknown> }): Promise<void> {
    const db = getDB();
    const { clause, params } = compositeWhere(where);
    await db.prepare(`DELETE FROM ${this.name} ${clause}`).bind(...params).run();
  }

  async deleteMany({
    where,
  }: {
    where?: Record<string, unknown>;
  }): Promise<void> {
    const db = getDB();
    const { clause, params } = buildWhere(where);
    await db.prepare(`DELETE FROM ${this.name} ${clause}`).bind(...params).run();
  }
}

export const db = {
  watchHistory: new TableClient("WatchHistory"),
  bookmark: new TableClient("Bookmark"),
  catalogCache: new TableClient("CatalogCache"),
  videoNote: new TableClient("VideoNote"),
  doubt: new TableClient("Doubt"),
  practiceAttempt: new TableClient("PracticeAttempt"),
  downloadCache: new TableClient("DownloadCache"),
};
