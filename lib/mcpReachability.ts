// Best-effort liveness tracking for user-configured MCP servers, so an
// offline server's tools are never advertised to the model in the first place.

export type McpReachability = Record<string, boolean>;

export const MCP_PROBE_TIMEOUT_MS = 4000;

// A no-cors fetch resolves once the network layer gets any response at all
// (even an opaque, unreadable one), and rejects on DNS/connection/timeout
// failure — enough to tell "is this host up" without needing the MCP server
// to cooperate with CORS or a real protocol handshake.
export async function probeMcpServer(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      mode: "no-cors",
      signal: AbortSignal.timeout(MCP_PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

export function withMcpReachability(
  current: McpReachability,
  id: string,
  reachable: boolean,
): McpReachability {
  return { ...current, [id]: reachable };
}

// Only excludes servers a probe has confirmed dead; not-yet-checked servers
// are included optimistically rather than hidden on first render.
export function reachableMcpServers<T extends { id: string }>(
  servers: T[],
  reachability: McpReachability,
): T[] {
  return servers.filter((server) => reachability[server.id] !== false);
}
