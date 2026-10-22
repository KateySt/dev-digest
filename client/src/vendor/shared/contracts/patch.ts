import { z } from 'zod';

/**
 * `.partial()` for PATCH/PUT bodies.
 *
 * zod 4 applies `.default()` even under `.optional()`, so a plain `.partial()`
 * of a schema with defaults turns "update one field" into "reset every omitted
 * field to its default" (e.g. `PUT /settings { theme }` would also reset
 * `automatic_reviews`). This strips the defaults first so absent keys stay
 * absent; the object's unknown-key mode (`.passthrough()`) is kept. Types are
 * the same as `.partial()`'s.
 */
export function patchOf<S extends z.ZodRawShape, C extends z.core.$ZodObjectConfig>(
  schema: z.ZodObject<S, C>,
): z.ZodObject<{ [K in keyof S]: z.ZodOptional<S[K]> }, C> {
  const undefaulted: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    if (field instanceof z.ZodDefault) undefaulted[key] = (field.unwrap() as z.ZodType).optional();
  }
  return schema.partial().extend(undefaulted) as unknown as z.ZodObject<{ [K in keyof S]: z.ZodOptional<S[K]> }, C>;
}
