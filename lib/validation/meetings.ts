import { z } from "zod";

export const createMeetingSchema = z.object({
  title: z.string().trim().min(3, "Meeting title must be at least 3 characters."),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  scheduledStartAt: z.string().optional().or(z.literal("")),
  maxParticipants: z.coerce.number().int().min(1).max(250).default(35)
});

export const joinMeetingSchema = z.object({
  code: z.string().trim().min(4, "Enter a meeting code.").max(16, "Meeting code is too long.")
});

export const meetingIdSchema = z.object({
  meetingId: z.string().uuid()
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type JoinMeetingInput = z.infer<typeof joinMeetingSchema>;
