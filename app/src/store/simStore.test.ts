import { describe, expect, it } from "vitest";
import { todayIso } from "@/lib/asOf";
import { sanitizeSim, step } from "./simStore";

describe("sanitizeSim", () => {
  it("keeps a well-formed past date", () => {
    expect(sanitizeSim({ asOf: "2015-03-02" })).toEqual({ asOf: "2015-03-02" });
  });

  it("falls back to live for anything malformed", () => {
    expect(sanitizeSim(undefined)).toEqual({ asOf: null });
    expect(sanitizeSim({})).toEqual({ asOf: null });
    expect(sanitizeSim({ asOf: 20150302 })).toEqual({ asOf: null });
    expect(sanitizeSim({ asOf: "03/02/2015" })).toEqual({ asOf: null });
    expect(sanitizeSim({ asOf: "2015-3-2" })).toEqual({ asOf: null });
  });

  it("refuses a date that does not exist", () => {
    expect(sanitizeSim({ asOf: "2015-02-30" })).toEqual({ asOf: null });
  });

  it("refuses a future date, which would be live data plus lookahead", () => {
    expect(sanitizeSim({ asOf: "2999-01-01" })).toEqual({ asOf: null });
  });
});

describe("step", () => {
  it("advances a day without losing one to the timezone", () => {
    // The suite runs under TZ=Etc/GMT+5 (fixed UTC-5); a UTC-based implementation
    // returns 2015-03-02 here.
    expect(step("2015-03-02", "D", 1)).toBe("2015-03-03");
  });

  it("crosses month and year boundaries", () => {
    expect(step("2015-03-31", "D", 1)).toBe("2015-04-01");
    expect(step("2015-12-31", "D", 1)).toBe("2016-01-01");
  });

  it("handles a leap day", () => {
    expect(step("2016-02-28", "D", 1)).toBe("2016-02-29");
    expect(step("2015-02-28", "D", 1)).toBe("2015-03-01");
  });

  it("steps weeks, months and years", () => {
    expect(step("2015-03-02", "W", 1)).toBe("2015-03-09");
    expect(step("2015-03-02", "M", 1)).toBe("2015-04-02");
    expect(step("2015-03-02", "Y", 1)).toBe("2016-03-02");
  });

  it("steps backwards", () => {
    expect(step("2015-03-02", "D", -1)).toBe("2015-03-01");
    expect(step("2015-01-01", "Y", -1)).toBe("2014-01-01");
  });

  it("clamps at today so the simulation never runs into the future", () => {
    expect(step(todayIso(), "Y", 10)).toBe(todayIso());
    expect(step(todayIso(), "D", 1)).toBe(todayIso());
  });
});
