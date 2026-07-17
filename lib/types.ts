import type { ProviderId } from "./providers";

export type Mode = "ask" | "plan" | "build";

export type Attachment = {
  id: string;
  name: string;
  content: string;
  size: number;
};

// A retained previous version of a regenerated assistant reply.
export type MessageVariant = {
  content: string;
  model?: string;
  provider?: ProviderId;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  provider?: ProviderId;
  model?: string;
  mode?: Mode;
  attachments?: Attachment[];
  error?: boolean;
  planState?: "proposed" | "approved" | "changes_requested";
  variants?: MessageVariant[];
  variantIndex?: number;
};

export type Thread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
};

export type ProviderSettings = Record<
  ProviderId,
  { apiKey: string; model: string }
>;
