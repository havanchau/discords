import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  displayName: z.string().min(1).max(64).optional(),
  password: z.string().min(8).max(128)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const createServerSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional()
});

export const createChannelSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(['TEXT', 'VOICE']).default('TEXT'),
  topic: z.string().max(250).optional()
});

export const createMessageSchema = z.object({
  content: z.string().max(4000).default(''),
  replyToMessageId: z.string().cuid().optional()
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateServerInput = z.infer<typeof createServerSchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
