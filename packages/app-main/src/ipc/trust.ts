// Which frames may call into main. Only the Skeleton renderer itself: never the
// user's project (which runs in its own webview from Phase 2) or anything it opens.

export type RendererLocation =
  { kind: "url"; url: string } | { kind: "file"; path: string };

export function isTrustedSender(
  senderUrl: string | undefined,
  renderer: RendererLocation,
): boolean {
  if (!senderUrl) return false;
  let sender: URL;
  try {
    sender = new URL(senderUrl);
  } catch {
    // Not a URL, so not our renderer.
    return false;
  }
  if (renderer.kind === "url") {
    return sender.origin === new URL(renderer.url).origin;
  }
  return (
    sender.protocol === "file:" &&
    decodeURIComponent(sender.pathname) === toFileUrlPath(renderer.path)
  );
}

function toFileUrlPath(filePath: string): string {
  // Windows paths come through as /C:/..., POSIX paths unchanged.
  const posix = filePath.replaceAll("\\", "/");
  return posix.startsWith("/") ? posix : `/${posix}`;
}
