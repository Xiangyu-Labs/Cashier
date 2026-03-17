import { z } from "zod";

export const sourceDocumentStatusSchema = z.enum(["queued", "processing", "completed", "anomaly", "failed"]);
