import { z } from 'zod';

/**
 * Query strings are text, so the numbers arrive as strings: coerce before
 * validating, or every request fails on type.
 */
const pageRequestSchema = z.object({
  pageNumber: z.coerce.number().int().min(0).default(0),
  perPage: z.coerce.number().int().min(1).max(200).default(20),
});

export const pageRequestDtoSchema = pageRequestSchema;

export type PageRequestDTO = z.infer<typeof pageRequestSchema>;
