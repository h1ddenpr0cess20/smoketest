import type { Attachment, Mode } from "./types";

export type QueuedMessage = {
  id: string;
  threadId: string;
  content: string;
  mode: Mode;
  attachments: Attachment[];
};

export function enqueueMessage(
  queue: QueuedMessage[],
  message: QueuedMessage,
): QueuedMessage[] {
  return [...queue, message];
}

export function nextQueuedMessageForThread(
  queue: QueuedMessage[],
  threadId: string,
): QueuedMessage | undefined {
  return queue.find((message) => message.threadId === threadId);
}

export function removeQueuedMessage(
  queue: QueuedMessage[],
  messageId: string,
): QueuedMessage[] {
  return queue.filter((message) => message.id !== messageId);
}
