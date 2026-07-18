import { describe, expect, it } from "vitest";
import {
  enqueueMessage,
  nextQueuedMessageForThread,
  removeQueuedMessage,
  type QueuedMessage,
} from "../lib/messageQueue";

function queued(id: string, threadId: string): QueuedMessage {
  return {
    id,
    threadId,
    content: `message ${id}`,
    mode: "ask",
    attachments: [],
  };
}

describe("message queue", () => {
  it("appends messages without mutating the existing queue", () => {
    const first = queued("one", "thread-a");
    const original = [first];
    const next = enqueueMessage(original, queued("two", "thread-a"));

    expect(original).toEqual([first]);
    expect(next.map((message) => message.id)).toEqual(["one", "two"]);
  });

  it("selects the oldest queued message for the requested thread", () => {
    const queue = [
      queued("other", "thread-b"),
      queued("first", "thread-a"),
      queued("second", "thread-a"),
    ];

    expect(nextQueuedMessageForThread(queue, "thread-a")?.id).toBe("first");
    expect(nextQueuedMessageForThread(queue, "missing")).toBeUndefined();
  });

  it("removes only the requested queued message", () => {
    const queue = [
      queued("first", "thread-a"),
      queued("second", "thread-a"),
      queued("other", "thread-b"),
    ];

    expect(
      removeQueuedMessage(queue, "second").map((message) => message.id),
    ).toEqual(["first", "other"]);
  });
});
