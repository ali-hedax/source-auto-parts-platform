import { z } from 'zod';
import { idSchema } from './common.js';

export const sendMessageSchema = z
  .object({
    conversationId: idSchema,
    /** Client-generated id; the server deduplicates on (conversation, sender, clientMessageId) (A16). */
    clientMessageId: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/),
    body: z.string().trim().max(4000).default(''),
    attachmentIds: z.array(idSchema).max(10).default([]),
  })
  .refine((m) => m.body.length > 0 || m.attachmentIds.length > 0, { message: 'Message is empty', path: ['body'] });
export type SendMessage = z.infer<typeof sendMessageSchema>;

export const markReadSchema = z.object({ conversationId: idSchema, lastReadMessageId: idSchema });
export const internalNoteSchema = z.object({ body: z.string().trim().min(1).max(4000) });

export const startSupportConversationSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(4000),
  clientMessageId: z.string().min(16).max(64),
});

export type AttachmentStatus = 'UPLOADING' | 'SCANNING' | 'READY' | 'REJECTED' | 'DELETED';

export interface AttachmentView {
  id: string;
  filename: string;
  sizeBytes: number;
  mime: string | null;
  status: AttachmentStatus;
  rejectReason: string | null;
  /** Only present when status is READY and the viewer is authorized; short-lived. */
  downloadUrl: string | null;
}

export interface MessageView {
  id: string;
  conversationId: string;
  clientMessageId: string | null;
  sender: { kind: 'CUSTOMER' | 'STAFF' | 'SYSTEM'; displayName: string; isSelf: boolean };
  body: string;
  attachments: AttachmentView[];
  /** A structured quote card; plain message text is never payable. */
  quoteCard: { quoteVersionId: string; versionNumber: number; reference: string } | null;
  createdAt: string;
  readByOther: boolean;
}

export interface ConversationSummary {
  id: string;
  subject: string;
  subjectKind: 'SUPPORT' | 'SOURCING_REQUEST' | 'STOCK_ORDER' | 'PROCUREMENT';
  subjectId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  /** The preview is a system message (stored in both languages; see systemTextFor). */
  lastMessageFromSystem: boolean;
  unreadCount: number;
  assignee: string | null;
}

export const uploadIntentSchema = z.object({
  purpose: z.enum(['MESSAGE', 'SOURCING_REQUEST', 'RETURN_REQUEST', 'BUSINESS_VERIFICATION', 'PRODUCT_MEDIA', 'IMPORT']),
  files: z.array(z.object({ filename: z.string().min(1).max(255), sizeBytes: z.number().int().min(1) })).min(1).max(10),
});

export interface UploadPolicyView {
  maxFiles: number;
  maxFileBytes: number;
  maxBatchBytes: number;
  acceptedExtensions: string[];
  importExtensions: string[];
}

