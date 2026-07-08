import { z } from "zod";

export const createFolderSchema = z.object({
  name: z
    .string()
    .min(1, "Folder Name is required")
    // Allow any character except a slash (the path delimiter) so names like
    // partition keys (e.g. `year=2026`) are accepted (issue #52).
    .regex(/^[^/]+$/, "Folder Name invalid"),
});

export type CreateFolderSchema = z.infer<typeof createFolderSchema>;
