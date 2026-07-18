const GENERIC_TAGS = new Set(["", "text", "plaintext", "plain", "txt", "code", "output"]);

const LANGUAGE_SIGNATURES: [string, RegExp][] = [
  [
    "python",
    /(^|\n)\s*(def |class \w+\s*[:(]|import \w|from \S+ import |print\(|if __name__ == ['"]__main__['"])/,
  ],
  ["java", /(^|\n)\s*(public\s+(class|static)\b|System\.out\.println)/],
  ["csharp", /(^|\n)\s*(using System\b|Console\.WriteLine|namespace \w)/],
  ["cpp", /(^|\n)\s*(#include\s*<|std::|int main\s*\()/],
  ["sql", /(^|\n)\s*(SELECT|INSERT INTO|CREATE TABLE|UPDATE|DELETE FROM)\b/i],
  ["html", /(^|\n)\s*<(!DOCTYPE|html|head|body|div|span|p|ul|form)\b/i],
  ["css", /(^|\n)\s*[.#]?[\w-]+\s*\{[^}]*[\w-]+\s*:\s*[^}]+\}/],
  ["bash", /(^|\n)\s*(#!\/bin\/(ba)?sh|echo |sudo |apt(-get)? |grep |curl )/],
  [
    "javascript",
    /(^|\n)\s*(function\s+\w+\s*\(|const \w+\s*=|let \w+\s*=|console\.log\(|export (default |const |function )|=>)/,
  ],
];

export function guessLanguage(tag: string, code: string): string {
  if (!GENERIC_TAGS.has(tag.toLowerCase())) return tag;
  for (const [language, signature] of LANGUAGE_SIGNATURES) {
    if (signature.test(code)) return language;
  }
  return tag;
}
