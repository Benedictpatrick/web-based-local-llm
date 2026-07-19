const PYTHON_FENCE_RE = /```(?:python|py)\s*\n([\s\S]*?)\n```/g;

/**
 * Returns the code inside a message's fenced python block, or null if the
 * message doesn't contain exactly one. Used to detect when a model response
 * is "run this for me" rather than a normal answer. Tolerates incidental
 * prose around the fence, since small local models don't reliably follow
 * "output only the code block" instructions.
 */
export function extractSolePythonBlock(text: string): string | null {
  const matches = [...text.matchAll(PYTHON_FENCE_RE)];
  return matches.length === 1 ? matches[0][1] : null;
}
