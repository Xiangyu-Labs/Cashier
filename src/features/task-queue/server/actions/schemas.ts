import { z } from "zod";

export const taskRunStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
