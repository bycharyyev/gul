import { z } from "zod";

// ---- Sign-in assistant (the chat on the sign-in page) ----
// Empty name/statusText means "use the built-in translation"; a null logo means "use the built-in mark".

export const assistantSettingsSchema = z.object({
  logoUrl: z.string().nullable(),
  name: z.string(),
  statusText: z.string(),
});
export type AssistantSettingsDto = z.infer<typeof assistantSettingsSchema>;

export const updateAssistantSettingsSchema = z.object({
  logoUrl: z.string().max(500).nullable().optional(),
  name: z.string().trim().max(40).optional(),
  statusText: z.string().trim().max(60).optional(),
});
export type UpdateAssistantSettingsInput = z.infer<typeof updateAssistantSettingsSchema>;
