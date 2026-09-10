import { DurableObject } from "cloudflare:workers"

type Waiter = {
  resolve: (text: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

function waiterKey(sessionId: string, id: string): string {
  return `${sessionId}\0${id}`
}

/** In-memory waiters keyed by `${sessionId}\0${id}`. */
export class MailboxWaiters {
  private readonly pending = new Map<string, Waiter>()

  ask(sessionId: string, id: string, timeoutMs: number): Promise<string> {
    const key = waiterKey(sessionId, id)
    if (this.pending.has(key)) throw new Error("duplicate ask id")
    return new Promise<string>((resolve, reject) => {
      const finish = (fn: () => void) => {
        const waiter = this.pending.get(key)
        if (!waiter) return
        this.pending.delete(key)
        clearTimeout(waiter.timer)
        fn()
      }
      const timer = setTimeout(
        () => finish(() => reject(new Error("ask_user_question timed out"))),
        timeoutMs,
      )
      this.pending.set(key, {
        resolve: (text) => finish(() => resolve(text)),
        reject: (error) => finish(() => reject(error)),
        timer,
      })
    })
  }

  answer(sessionId: string, id: string, text: string): boolean {
    const waiter = this.pending.get(waiterKey(sessionId, id))
    if (!waiter) return false
    waiter.resolve(text)
    return true
  }

  abort(sessionId: string, id: string): boolean {
    const waiter = this.pending.get(waiterKey(sessionId, id))
    if (!waiter) return false
    waiter.reject(new Error("ask_user_question cancelled"))
    return true
  }
}

export class ControlMailbox extends DurableObject {
  private readonly waiters = new MailboxWaiters()

  async ask(sessionId: string, id: string, timeoutMs: number): Promise<string> {
    return this.waiters.ask(sessionId, id, timeoutMs)
  }

  async answer(sessionId: string, id: string, text: string): Promise<boolean> {
    return this.waiters.answer(sessionId, id, text)
  }

  async abort(sessionId: string, id: string): Promise<boolean> {
    return this.waiters.abort(sessionId, id)
  }
}
