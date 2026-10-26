import { afterEach, describe, expect, it } from "vitest";
import {
  anchorDate, anchorIso, getAsOf, isSimulating, parseIso, setAsOfDate, toIso, todayIso,
} from "./asOf";

afterEach(() => setAsOfDate(null));

describe("parseIso", () => {
  it("builds the date in local time, not UTC", () => {
    // Under a negative UTC offset, `new Date("2015-03-02")` would land on Mar 1.
    const d = parseIso("2015-03-02");
    expect(d.getFullYear()).toBe(2015);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(2);
  });
});

describe("toIso", () => {
  it("round-trips a parsed date", () => {
    expect(toIso(parseIso("2015-03-02"))).toBe("2015-03-02");
  });

  it("does not roll forward late in the day west of Greenwich", () => {
    // toISOString() on this instant reports the next day at UTC-5.
    const evening = new Date(2015, 2, 2, 22, 30);
    expect(toIso(evening)).toBe("2015-03-02");
  });

  it("pads single-digit months and days", () => {
    expect(toIso(new Date(2015, 0, 5))).toBe("2015-01-05");
  });
});

describe("the simulation clock", () => {
  it("reads as live until a date is set", () => {
    expect(getAsOf()).toBeNull();
    expect(isSimulating()).toBe(false);
    expect(anchorIso()).toBe(todayIso());
  });

  it("anchors to the simulation date once set", () => {
    setAsOfDate("2015-03-02");
    expect(getAsOf()).toBe("2015-03-02");
    expect(isSimulating()).toBe(true);
    expect(anchorIso()).toBe("2015-03-02");
    expect(anchorDate().getFullYear()).toBe(2015);
  });

  it("returns to live when cleared", () => {
    setAsOfDate("2015-03-02");
    setAsOfDate(null);
    expect(isSimulating()).toBe(false);
    expect(anchorIso()).toBe(todayIso());
  });
});
