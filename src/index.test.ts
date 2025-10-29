import { describe, expect, it } from "vitest";

import { greet } from "./index.js";

describe("greet", () => {
  it("returns a friendly greeting", () => {
    expect(greet("Jeremiah")).toBe("Hello, Jeremiah! 👋");
  });
});
