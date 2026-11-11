import { z } from 'zod';
import type { FieldSpec, FormSpec } from './schema.js';

/**
 * The structural input schema a spec implies: types, bounds, required fields, and absent as
 * the only way to leave a field empty (text is trimmed, lists need an item). No business
 * rules. The checker compares a module's schema with this one, and a spec's example must
 * pass it. It is what a template generator would produce, and nothing more.
 */
export function referenceSchema(spec: FormSpec): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fieldsOf(spec)) {
    const schema = fieldSchema(field);
    shape[field.name] = field.required ? schema : schema.optional();
  }
  return z.strictObject(shape);
}

function fieldSchema(field: FieldSpec): z.ZodType {
  switch (field.type) {
    case 'text':
      // trim() first: "   " must not count as a filled-in field.
      return z.string().trim().min(field.minLength).max(field.maxLength);
    case 'integer':
    case 'decimal': {
      let schema = field.type === 'integer' ? z.int() : z.number();
      if (field.min !== undefined) schema = schema.min(field.min);
      if (field.max !== undefined) schema = schema.max(field.max);
      return schema;
    }
    case 'boolean':
      return z.boolean();
    case 'date':
      return z.iso.date();
    case 'enum':
      return z.enum(field.options as [string, ...string[]]);
    case 'photos':
      return z.array(z.string().trim().min(1)).min(field.minItems).max(field.maxItems);
  }
}

export function fieldsOf(spec: FormSpec): FieldSpec[] {
  return spec.sections.flatMap((section) => section.fields);
}

/** `codigoEquipamento` → `codigo_equipamento`; `inspecao-equipamento` → `inspecao_equipamento`. */
export function snakeCase(name: string): string {
  return name.replace(/-/g, '_').replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
