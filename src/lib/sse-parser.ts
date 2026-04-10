import type { SSEEvent } from './types.js';

/**
 * Parse a Server-Sent Events stream into structured events.
 *
 * SSE format:
 *   event: text
 *   data: {"content":"hello"}
 *
 *   event: complete
 *   data: {"success":true}
 */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const reader = body.pipeThrough(new TextDecoderStream() as any).getReader();

  let buffer = '';
  let currentEvent = '';
  let currentData = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split('\n');
      // Keep the last incomplete line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          // Empty line = end of event
          try {
            const data = JSON.parse(currentData);
            yield { event: currentEvent, data };
          } catch {
            yield { event: currentEvent, data: { raw: currentData } };
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }

    // Flush any remaining event
    if (currentEvent && currentData) {
      try {
        const data = JSON.parse(currentData);
        yield { event: currentEvent, data };
      } catch {
        yield { event: currentEvent, data: { raw: currentData } };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
