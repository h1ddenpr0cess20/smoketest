import type { ProviderId } from "./providers";
import type { RoundtableConfig } from "./roundtable/types";
import type { GeneratedFile } from "./stream";

export type Mode = "ask" | "plan" | "build";
export type PlanStyle = "solo" | "roundtable";

export type Attachment = {
  id: string;
  name: string;
  content: string;
  size: number;
  // Directory uploads routed into the local RAG index keep their text in
  // IndexedDB only; the attachment carries no content so threads (which are
  // persisted to localStorage) stay small.
  indexedOnly?: boolean;
};

// A retained previous version of a regenerated assistant reply. Mode and plan
// state ride along so switching variants restores the reply's own nature —
// without them a plan proposal viewed next to an ask regeneration could show
// approve/revise buttons on the wrong variant.
export type MessageVariant = {
  content: string;
  model?: string;
  provider?: ProviderId;
  mode?: Mode;
  planState?: "proposed" | "approved" | "changes_requested";
  toolActivity?: string[];
  generatedFiles?: GeneratedFile[];
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
  // UI status lines (compaction confirmations, toggle feedback). Rendered in
  // the transcript but never sent to the model and never counted toward the
  // history budget.
  notice?: boolean;
  planState?: "proposed" | "approved" | "changes_requested";
  variants?: MessageVariant[];
  variantIndex?: number;
  toolActivity?: string[];
  generatedFiles?: GeneratedFile[];
  roundtableRunId?: string;
  participantId?: string;
  displayName?: string;
  participantColor?: string;
};

export type Thread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  roundtableConfig?: RoundtableConfig;
  // A running summary that replaces older turns in the request history (see
  // lib/compaction.ts). `compactedThroughId` is the id of the last message
  // already folded into `compactedSummary`.
  compactedSummary?: string;
  compactedThroughId?: string;
};

export type ProviderConfig = {
  apiKey: string;
  model: string;
  priorityProcessing: boolean;
  webSearch: boolean;
  xSearch: boolean;
  codeInterpreter: boolean;
  fileSearch: boolean;
  vectorStoreId: string;
  localRag: boolean;
  embeddingModel: string;
};

export type ProviderSettings = Record<ProviderId, ProviderConfig>;

export type McpServerEntry = {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
};
