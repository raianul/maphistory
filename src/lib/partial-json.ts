/**
 * Reads JSON that is still being streamed, e.g. `{"name":"আজিম` → { name: "আজিম" }.
 * Closes whatever string, array or object is still open; if the text ends
 * mid-key or mid-number, steps back until it parses. Returns undefined when
 * nothing usable has arrived yet.
 */
export function parsePartialJson<T = unknown>(text: string): T | undefined {
  // Stepping back at most this many characters covers a half-written key or literal.
  const maxBack = 80;
  for (let end = text.length; end > 0 && text.length - end <= maxBack; end--) {
    const candidate = close(text.slice(0, end));
    if (candidate === undefined) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try a shorter prefix
    }
  }
  return undefined;
}

function close(s: string): string | undefined {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (escaped) return undefined;
  let out = inString ? s + '"' : s;
  // A dangling comma or colon can't be closed into valid JSON.
  out = out.replace(/[\s,]+$/, "");
  if (/:\s*$/.test(out)) return undefined;
  return out + stack.reverse().join("");
}
