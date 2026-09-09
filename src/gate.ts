import { DurableObject } from "cloudflare:workers"

interface Waiter {
  resolve: (text: string) => void
  reject: (error: Error) => void
}

/** Separate DO so answering a question is not queued behind the paused turn. */
export class QuestionGate extends DurableObject {
  private readonly pending = new Map<string, Waiter>()

  async ask(id: string, timeoutMs: number): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error("ask_user_question timed out"))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (text) => {
          clearTimeout(timer)
          resolve(text)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
    })
  }

  async answer(id: string, text: string): Promise<boolean> {
    const waiter = this.pending.get(id)
    if (!waiter) return false
    this.pending.delete(id)
    waiter.resolve(text)
    return true
  }
}
