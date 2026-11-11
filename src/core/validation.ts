import type { Context } from 'hono';
import { z } from 'zod';

/** User-facing texts of a form, in pt-BR: one per input field, one per business rule. */
export interface Messages {
  fields: Record<string, string>;
  rules: Record<string, string>;
}

export interface InputError {
  /** The field the error is about; empty for the body as a whole. */
  field: string;
  message: string;
  /** Set when a business rule (R1, R2, ...) rejected the input. */
  rule?: string;
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; errors: InputError[] };

/**
 * Validates a body and turns Zod issues into messages. Structural problems use the field's
 * message, once per field; a rule raises a custom issue with `params: { rule }` and its own
 * message. With `withRules`, the two never mix: rules only see structurally valid input.
 */
export function parseInput<T>(schema: z.ZodType<T>, body: unknown, messages: Messages): Parsed<T> {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };

  const errors: InputError[] = [];
  const seen = new Set<string>();
  const push = (error: InputError) => {
    const key = `${error.field}\u0000${error.rule ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push(error);
  };

  for (const issue of result.error.issues) {
    const field = typeof issue.path[0] === 'string' ? issue.path[0] : '';
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) push({ field: key, message: 'Campo não reconhecido neste formulário.' });
    } else if (issue.code === 'custom' && typeof issue.params?.rule === 'string') {
      push({ field, message: issue.message, rule: issue.params.rule });
    } else if (field === '') {
      push({ field, message: 'O corpo da requisição deve ser um objeto JSON.' });
    } else {
      push({ field, message: messages.fields[field] ?? issue.message });
    }
  }
  return { ok: false, errors };
}

/**
 * Adds the business rules to an input schema. They run only when the structure is valid: Zod
 * would otherwise run them after a broken bound too (a blank text, say), and a rule error would
 * hide what is wrong with the value, from the client and from the checker.
 */
export function withRules<S extends z.ZodObject>(
  schema: S,
  rules: (value: z.output<S>, ctx: z.RefinementCtx<z.output<S>>) => void,
): S {
  return schema.check(z.superRefine(rules, { when: (payload) => payload.issues.length === 0 })) as S;
}

/**
 * Raises a business-rule issue inside `withRules`. The rule id travels in `params`, so the
 * API reports which rule rejected the input.
 */
export function ruleIssue(ctx: z.RefinementCtx, rule: string, messages: Messages, field: string): void {
  ctx.addIssue({ code: 'custom', path: [field], message: messages.rules[rule] ?? rule, params: { rule } });
}

/** The JSON body, or `undefined` when it is not valid JSON (parseInput then reports it). */
export async function readBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
