import type { Env } from "../types.ts"

/** Official API id for DeepSeek-V4.1-Flash. */
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash"

export function resolveDeepseekModel(env: Pick<Env, "DEEPSEEK_MODEL">): string {
  return env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL
}
