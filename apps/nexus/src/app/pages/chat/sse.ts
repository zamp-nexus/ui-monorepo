/**
 * Low-level SSE frame parsing, shared by every hand-rolled stream reader in
 * this surface.
 *
 * The browser's own `EventSource` cannot set an `Authorization` header, and
 * every stream here is bearer-protected, so each is read by hand: `fetch`
 * plus a reader over the response body. `parseSseFrames` is the one place
 * that turns a raw chunk boundary into whole `event:`/`data:` frames — a
 * chunk boundary falls wherever the network decides, so a half-received
 * `data:` line is not a malformed frame, it is one that has not finished
 * arriving yet.
 */

export interface SseFrame {
  readonly event: string;
  readonly data: string;
}

const DEFAULT_EVENT = 'message';

export const parseSseFrames = (
  buffer: string,
): { readonly frames: SseFrame[]; readonly rest: string } => {
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  const frames: SseFrame[] = [];

  for (const block of blocks) {
    let event = DEFAULT_EVENT;
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      // A line opening with ':' is a comment — that is what a heartbeat is.
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }
    const data = dataLines.join('\n');
    if (!data) continue;
    frames.push({ event, data });
  }

  return { frames, rest };
};
