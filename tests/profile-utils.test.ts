import { describe, expect, it } from "bun:test";
import { stripProfileEmbeddings } from "../src/services/user-profile/profile-utils.js";

describe("stripProfileEmbeddings", () => {
  it("removes centroid and anchor from every item type", () => {
    const data = {
      preferences: [{ description: "a", centroid: [1, 2], anchor: [3, 4], confidence: 0.5 }],
      patterns: [{ description: "b", centroid: [1], anchor: [2], frequency: 3 }],
      workflows: [{ description: "c", centroid: [1], anchor: [2], steps: ["x"] }],
    };

    const result = stripProfileEmbeddings(data);

    expect(result).toBe(data);
    for (const key of ["preferences", "patterns", "workflows"] as const) {
      for (const item of result[key]) {
        expect(item.centroid).toBeUndefined();
        expect(item.anchor).toBeUndefined();
      }
    }
    expect(result.preferences[0].confidence).toBe(0.5);
    expect(result.patterns[0].frequency).toBe(3);
    expect(result.workflows[0].steps).toEqual(["x"]);
  });

  it("tolerates missing, malformed or non-object sections", () => {
    expect(stripProfileEmbeddings(undefined as any)).toBeUndefined();
    expect(stripProfileEmbeddings(null as any)).toBeNull();
    expect(stripProfileEmbeddings({} as any)).toEqual({});
    expect(stripProfileEmbeddings({ preferences: "not-an-array" } as any)).toEqual({
      preferences: "not-an-array",
    });
    expect(() => stripProfileEmbeddings({ patterns: [null, 1, "x"] } as any)).not.toThrow();
  });
});
