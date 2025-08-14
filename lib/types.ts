import { z } from "zod";

export const DocumentMetaSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
});

export type DocumentMeta = z.infer<typeof DocumentMetaSchema>;

export type ImportDocxResponse = {
  html: string;
  metadata?: Partial<DocumentMeta>;
  messages?: string[];
};
