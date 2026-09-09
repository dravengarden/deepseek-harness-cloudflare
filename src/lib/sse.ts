export function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export function sseStream(
  write: (send: (event: unknown) => void) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(sse(event)))
      }
      try {
        await write(send)
      } catch (error) {
        send({
          type: "error",
          payload: { message: error instanceof Error ? error.message : String(error) },
        })
      } finally {
        send({ type: "done", payload: {} })
        controller.close()
      }
    },
  })
}
