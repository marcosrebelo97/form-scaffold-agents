import { randomUUID } from 'node:crypto';
import type { Model, Row } from './model.js';

/**
 * Storage of form rows. The in-memory implementation enforces what a database would: unknown
 * columns and nulls in NOT NULL columns are errors, so a model that disagrees with the service
 * fails in tests, not in production.
 */
export interface Repository {
  insert(model: Model, row: Row): Promise<Row>;
  get(model: Model, id: string): Promise<Row | undefined>;
  list(model: Model): Promise<Row[]>;
}

export class ConstraintError extends Error {
  override name = 'ConstraintError';
}

export class MemoryRepository implements Repository {
  private readonly tables = new Map<string, Map<string, Row>>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async insert(model: Model, row: Row): Promise<Row> {
    for (const column of Object.keys(row)) {
      if (!(column in model.columns)) throw new ConstraintError(`${model.table}: unknown column "${column}"`);
    }
    for (const [name, column] of Object.entries(model.columns)) {
      if (!column.nullable && (row[name] === null || row[name] === undefined)) {
        throw new ConstraintError(`${model.table}: null value in column "${name}" violates not-null constraint`);
      }
    }
    const stored: Row = { ...structuredClone(row), id: randomUUID(), created_at: this.now().toISOString() };
    this.table(model).set(stored.id as string, stored);
    return structuredClone(stored);
  }

  async get(model: Model, id: string): Promise<Row | undefined> {
    const row = this.table(model).get(id);
    return row && structuredClone(row);
  }

  async list(model: Model): Promise<Row[]> {
    return [...this.table(model).values()].map((row) => structuredClone(row));
  }

  private table(model: Model): Map<string, Row> {
    let table = this.tables.get(model.table);
    if (!table) {
      table = new Map();
      this.tables.set(model.table, table);
    }
    return table;
  }
}
