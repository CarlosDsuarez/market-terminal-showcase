import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "./export";

describe("csvEscape", () => {
  it("leaves plain cells alone", () => {
    expect(csvEscape("AAPL")).toBe("AAPL");
  });

  it("quotes cells with commas, quotes or newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("a\nb")).toBe('"a\nb"');
  });
});

describe("toCsv", () => {
  it("joins header and rows with newlines", () => {
    expect(toCsv(["A", "B"], [["1", "2"], ["3", "4"]])).toBe("A,B\n1,2\n3,4");
  });
});
