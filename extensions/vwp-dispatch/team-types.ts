/**
 * Shared types for team configuration and onboarding.
 *
 * Uses Zod schemas for runtime validation of team data that flows
 * through HTTP routes and is persisted to disk.
 */

import { z } from "zod";

export const TeamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  description: z.string(),
  skills: z.array(z.string()),
  required: z.boolean(),
  active: z.boolean(),
});

export const TeamConfigSchema = z.object({
  businessType: z.enum(["consulting", "ecommerce", "custom"]),
  businessName: z.string(),
  members: z.array(TeamMemberSchema),
  updatedAt: z.number(),
});

export const OnboardingPayloadSchema = z.object({
  businessType: z.enum(["consulting", "ecommerce", "custom"]),
  businessName: z.string(),
  userName: z.string(),
  team: z.array(TeamMemberSchema),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type TeamConfig = z.infer<typeof TeamConfigSchema>;
export type OnboardingPayload = z.infer<typeof OnboardingPayloadSchema>;
