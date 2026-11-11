import { z } from 'zod';

/**
 * The declarative spec of a form: the single source of truth every layer is checked against.
 * Structure (fields, constraints, computed values) is machine-checkable; business rules are
 * natural language, turned into code and tests by the agent.
 */

const camelCase = /^[a-z][a-zA-Z0-9]*$/;
/** Form, section and resource ids, and enum options. */
export const kebabCase = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const base = {
  name: z.string().regex(camelCase, 'field names are camelCase'),
  label: z.string().min(1),
  required: z.boolean().default(false),
  help: z.string().optional(),
};

const bounds = {
  min: z.number().optional(),
  max: z.number().optional(),
};

export const fieldSpec = z.discriminatedUnion('type', [
  z.strictObject({
    ...base,
    type: z.literal('text'),
    // Counted after trimming. Never 0: an empty or blank text is a field left out, not a value.
    minLength: z.int().min(1).default(1),
    // Required: every text input has an upper bound.
    maxLength: z.int().min(1),
  }),
  z.strictObject({ ...base, type: z.literal('integer'), ...bounds }),
  z.strictObject({ ...base, type: z.literal('decimal'), ...bounds }),
  z.strictObject({ ...base, type: z.literal('boolean') }),
  z.strictObject({ ...base, type: z.literal('date') }),
  z.strictObject({ ...base, type: z.literal('enum'), options: z.array(z.string().regex(kebabCase)).min(2) }),
  z.strictObject({
    ...base,
    type: z.literal('photos'),
    // Never 0, for the same reason: no photos is an absent field, not an empty list.
    minItems: z.int().min(1).default(1),
    maxItems: z.int().min(1),
  }),
]);

/** Stored and returned, never accepted as input: the service computes it. */
export const computedSpec = z.strictObject({
  name: z.string().regex(camelCase),
  type: z.enum(['integer', 'decimal', 'boolean', 'text']),
  description: z.string().min(1),
});

export const ruleSpec = z.strictObject({
  id: z.string().regex(/^R[0-9]+$/, 'rule ids look like R1, R2, ...'),
  description: z.string().min(1),
});

export const formSpec = z.strictObject({
  id: z.string().regex(kebabCase),
  version: z.int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  /** Path segment of the HTTP resource: POST /<resource>, GET /<resource>, GET /<resource>/:id. */
  resource: z.string().regex(kebabCase),
  sections: z
    .array(z.strictObject({ id: z.string().regex(kebabCase), title: z.string().min(1), fields: z.array(fieldSpec).min(1) }))
    .min(1),
  computed: z.array(computedSpec).default([]),
  rules: z.array(ruleSpec).default([]),
  /** A valid submission: the checker posts it and expects every layer to accept it. */
  example: z.record(z.string(), z.unknown()),
});

export type FieldSpec = z.infer<typeof fieldSpec>;
export type ComputedSpec = z.infer<typeof computedSpec>;
export type RuleSpec = z.infer<typeof ruleSpec>;
export type FormSpec = z.infer<typeof formSpec>;
export type FieldType = FieldSpec['type'];
