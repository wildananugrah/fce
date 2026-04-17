export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Parse SSE events from a fetch() response body stream. Yields one event per
 * complete `event: ...\ndata: ...\n\n` block.
 */
export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      // Events separated by double-newline.
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const evt = parseEvent(raw);
        if (evt) yield evt;
      }
    }
    // Flush trailing buffer if it contains a final event.
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const evt = parseEvent(buffer);
      if (evt) yield evt;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseEvent(raw: string): SSEEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}
