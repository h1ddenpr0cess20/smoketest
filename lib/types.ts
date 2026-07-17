import type { ProviderId } from "./providers";

export type Mode = "ask" | "plan" | "build";

export type Attachment = {
  id: string;
  name: string;
  content: string;
  size: number;
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
