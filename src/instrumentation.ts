/** Runs once when the Next.js server starts: load the prompt files now, so a missing one fails at startup. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { prompts } = await import("@/lib/prompts");
  const { logger } = await import("@/lib/core/utils/logger");
  logger.info(`Loaded ${Object.keys(prompts).length} prompts from src/prompts/`);
}
