import { z } from "zod";

// ---- Managed subdomains ----

export const SUBDOMAIN_STATUSES = ["PENDING", "ACTIVE", "FAILED", "REMOVED"] as const;
export type SubdomainStatus = (typeof SUBDOMAIN_STATUSES)[number];

export const managedSubdomainSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetPort: z.number(),
  status: z.enum(SUBDOMAIN_STATUSES),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ManagedSubdomainDto = z.infer<typeof managedSubdomainSchema>;

export const createSubdomainSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.gulyaly\.pro$/, "Must be a subdomain of gulyaly.pro"),
  targetPort: z.number().int().min(1024).max(65535),
});
export type CreateSubdomainInput = z.infer<typeof createSubdomainSchema>;

