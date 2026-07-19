import { describe, expect, it } from "vitest";
import { extractSolePythonBlock } from "./agentCode";

describe("extractSolePythonBlock", () => {
  it("extracts code from a message that is only a python fence", () => {
    expect(extractSolePythonBlock("```python\nprint(2 + 2)\n```")).toBe("print(2 + 2)");
  });

  it("accepts the py alias", () => {
    expect(extractSolePythonBlock("```py\nprint(1)\n```")).toBe("print(1)");
  });

  it("tolerates surrounding whitespace", () => {
    expect(extractSolePythonBlock("\n\n```python\nprint(1)\n```\n\n")).toBe("print(1)");
  });

  it("tolerates prose before the block", () => {
    expect(extractSolePythonBlock("Here's the code:\n```python\nprint(1)\n```")).toBe("print(1)");
  });

  it("tolerates prose after the block", () => {
    expect(extractSolePythonBlock("```python\nprint(1)\n```\nThat should work.")).toBe("print(1)");
  });

  it("returns null for a non-python fence", () => {
    expect(extractSolePythonBlock("```javascript\nconsole.log(1)\n```")).toBeNull();
  });

  it("returns null for plain text with no code fence", () => {
    expect(extractSolePythonBlock("The answer is 4.")).toBeNull();
  });

  it("returns null for multiple code blocks", () => {
    expect(
      extractSolePythonBlock("```python\nprint(1)\n```\n\n```python\nprint(2)\n```")
    ).toBeNull();
  });
});
