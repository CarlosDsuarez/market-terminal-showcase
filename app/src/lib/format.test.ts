import { describe, expect, it } from "vitest";
import {
  fmtBps,
  fmtDate,
  fmtInt,
  fmtPct,
  fmtPctFromDecimal,
  fmtPrice,
  fmtTime,
  fmtVolume,
  spreadBps,
} from "./format";

// The suite runs under TZ=Etc/GMT+5 (fixed UTC-5) so the date assertions
// actually exercise the negative-offset case they are guarding.

describe("fmtVolume", () => {
  it("abbreviates positive magnitudes", () => {
    expect(fmtVolume(1.4e9)).toBe("1.40B");
    expect(fmtVolume(3.4e6)).toBe("3.40M");
    expect(fmtVolume(2.5e12)).toBe("2.50T");
    expect(fmtVolume(1500)).toBe("1.50K");
  });

  it("abbreviates negative magnitudes instead of dumping raw digits", () => {
    expect(fmtVolume(-5.2e9)).toBe("-5.20B");
    expect(fmtVolume(-3.4e6)).toBe("-3.40M");
    expect(fmtVolume(-2.5e12)).toBe("-2.50T");
    expect(fmtVolume(-1500)).toBe("-1.50K");
  });

  it("leaves sub-thousand values as plain digits", () => {
    expect(fmtVolume(999)).toBe("999");
    expect(fmtVolume(-250)).toBe("-250");
    expect(fmtVolume(0)).toBe("0");
  });

  it("renders missing values as an em dash", () => {
    expect(fmtVolume(null)).toBe("—");
    expect(fmtVolume(undefined)).toBe("—");
    expect(fmtVolume(NaN)).toBe("—");
  });
});

describe("spreadBps", () => {
  it("converts a difference of normalized decimals into basis points", () => {
    expect(spreadBps(0.0468, 0.0423)).toBeCloseTo(45, 6);
    expect(spreadBps(0.0468, 0.0382)).toBeCloseTo(86, 6);
  });

  it("keeps the sign of an inverted curve", () => {
    expect(spreadBps(0.0423, 0.0468)).toBeCloseTo(-45, 6);
  });

  it("returns undefined when either leg is missing", () => {
    expect(spreadBps(0.0468, undefined)).toBeUndefined();
    expect(spreadBps(null, 0.0423)).toBeUndefined();
    expect(spreadBps(NaN, 0.0423)).toBeUndefined();
  });
});

describe("fmtBps", () => {
  it("signs and rounds to whole basis points", () => {
    expect(fmtBps(45)).toBe("+45 bps");
    expect(fmtBps(44.9999)).toBe("+45 bps");
    expect(fmtBps(-12.4)).toBe("-12 bps");
    expect(fmtBps(0)).toBe("+0 bps");
  });

  it("renders missing values as an em dash", () => {
    expect(fmtBps(undefined)).toBe("—");
    expect(fmtBps(null)).toBe("—");
  });
});

describe("fmtDate", () => {
  it("keeps the calendar year of a date-only string west of Greenwich", () => {
    // Parsed as UTC this lands on 2025-12-31 and the fiscal year is wrong.
    const rendered = fmtDate("2026-01-01");
    expect(rendered).toContain("26");
    expect(rendered).not.toContain("25");
  });

  it("keeps the calendar day of a date-only string", () => {
    expect(fmtDate("2026-07-30")).toContain("30");
    expect(fmtDate("2026-07-30")).not.toContain("29");
  });

  it("still handles full timestamps", () => {
    expect(fmtDate("2026-07-30T18:45:00Z")).toContain("30");
  });

  it("falls back to the raw input when unparseable", () => {
    expect(fmtDate("not-a-date")).toBe("not-a-date");
    expect(fmtDate(undefined)).toBe("—");
  });
});

describe("fmtTime", () => {
  it("keeps the calendar day of a date-only string", () => {
    expect(fmtTime("2026-07-30")).toContain("30");
  });

  it("falls back to the raw input when unparseable", () => {
    expect(fmtTime("not-a-date")).toBe("not-a-date");
  });
});

describe("percent and number helpers", () => {
  it("signs percentages", () => {
    expect(fmtPct(1.234)).toBe("+1.23%");
    expect(fmtPct(-1.234)).toBe("-1.23%");
    expect(fmtPct(null)).toBe("—");
  });

  it("scales decimals into percentages", () => {
    expect(fmtPctFromDecimal(0.0605)).toBe("+6.05%");
    expect(fmtPctFromDecimal(0.0035)).toBe("+0.35%");
    expect(fmtPctFromDecimal(undefined)).toBe("—");
  });

  it("formats prices and integers", () => {
    expect(fmtPrice(308.9)).toBe("308.90");
    expect(fmtPrice(null)).toBe("—");
    expect(fmtInt(1234.6)).toBe("1,235");
    expect(fmtInt(undefined)).toBe("—");
  });
});
