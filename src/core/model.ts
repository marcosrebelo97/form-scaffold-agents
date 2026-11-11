/** How a form is stored: one table, one column per field (input or computed). */

export type ColumnType = 'text' | 'integer' | 'numeric' | 'boolean' | 'date' | 'text[]';

export interface Column {
  /** The field of the record this column stores (camelCase). */
  field: string;
  type: ColumnType;
  nullable: boolean;
}

export interface Model {
  table: string;
  /** Keyed by column name (snake_case). `id` and `created_at` belong to the repository. */
  columns: Record<string, Column>;
}

export const SYSTEM_COLUMNS = ['id', 'created_at'] as const;

export function defineModel<M extends Model>(model: M): M {
  for (const name of SYSTEM_COLUMNS) {
    if (name in model.columns) throw new Error(`model ${model.table}: column "${name}" is reserved`);
  }
  return model;
}

export type Row = Record<string, unknown>;

/** Record (camelCase fields) → row (snake_case columns). Absent fields become null. */
export function toRow(model: Model, record: Record<string, unknown>): Row {
  const row: Row = {};
  for (const [column, { field }] of Object.entries(model.columns)) row[column] = record[field] ?? null;
  return row;
}

/**
 * Row → record. Null columns are left out, so an optional field that was not sent stays absent.
 * `T` is the module's record type: the checker's round trip proves the model really produces it.
 */
export function fromRow<T = Record<string, unknown>>(model: Model, row: Row): T {
  const record: Record<string, unknown> = { id: row.id, createdAt: row.created_at };
  for (const [column, { field }] of Object.entries(model.columns)) {
    if (row[column] !== null && row[column] !== undefined) record[field] = row[column];
  }
  return record as T;
}
