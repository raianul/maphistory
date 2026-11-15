/** Which Gemini model writes stories. `||` so an empty GEMINI_MODEL= line falls back to the default. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
/** Tried when the main model is overloaded (503), which happens on the free tier. */
export const FALLBACK_MODEL = "gemini-3.5-flash-lite";
