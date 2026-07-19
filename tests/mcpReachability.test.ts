import { afterEach, describe, expect, it, vi } from "vitest";
import {
  probeMcpServer,
  reachableMcpServers,
  withMcpReachability,
} from "../lib/mcpReachability";

afterEach(() => vi.restoreAllMocks());

describe("probeMcpServer", () => {
  it("resolves true when fetch succeeds, even with a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );
    await expect(probeMcpServer("https://mcp.example.com")).resolves.toBe(true);
  });

  it("resolves false when fetch rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(probeMcpServer("https://mcp.example.com")).resolves.toBe(
      false,
    );
  });
});

describe("withMcpReachability", () => {
  it("sets and overwrites a server's reachability", () => {
    const first = withMcpReachability({}, "a", true);
    expect(first).toEqual({ a: true });
    expect(withMcpReachability(first, "a", false)).toEqual({ a: false });
  });
});

describe("reachableMcpServers", () => {
  const servers = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("excludes only servers confirmed unreachable", () => {
    expect(reachableMcpServers(servers, { a: false, b: true })).toEqual([
      { id: "b" },
      { id: "c" },
    ]);
  });

  it("includes not-yet-checked servers optimistically", () => {
    expect(reachableMcpServers(servers, {})).toEqual(servers);
  });
});
