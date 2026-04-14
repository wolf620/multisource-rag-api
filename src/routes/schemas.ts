import { z } from "zod";

export const chatRequestSchema = z.object({
  session_id: z.string().uuid().optional(),
  query: z.string().min(3)
});

export const sessionParamsSchema = z.object({
  id: z.string().uuid()
});
