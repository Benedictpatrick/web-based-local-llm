import { describe, expect, it } from "vitest";
import { guessLanguage } from "./codeLanguage";

describe("guessLanguage", () => {
  it("keeps an explicit language tag", () => {
    expect(guessLanguage("rust", "fn main() {}")).toBe("rust");
  });

  it("detects javascript when the model tags the fence as text", () => {
    const code = 'function reverseString(str) {\n  return str.split("").reverse().join("");\n}';
    expect(guessLanguage("text", code)).toBe("javascript");
  });

  it("detects python in an untagged fence", () => {
    const code = "def is_prime(n):\n    if n <= 1:\n        return False\n    return True";
    expect(guessLanguage("", code)).toBe("python");
  });

  it("detects java from a class with main", () => {
    const code = 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("hi");\n  }\n}';
    expect(guessLanguage("plaintext", code)).toBe("java");
  });

  it("detects cpp from includes", () => {
    expect(guessLanguage("", "#include <iostream>\nint main() { return 0; }")).toBe("cpp");
  });

  it("detects sql", () => {
    expect(guessLanguage("text", "SELECT name FROM users WHERE id = 1;")).toBe("sql");
  });

  it("leaves prose alone", () => {
    expect(guessLanguage("text", "just a plain sentence with no code")).toBe("text");
  });
});
