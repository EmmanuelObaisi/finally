import { describe, expect, it } from "vitest";
import { fmtMoney, fmtPct, fmtQty, fmtSigned, MISSING, toneClass } from "./format";

const missing = [null, undefined, NaN, Infinity, -Infinity];

describe("fmtMoney", () => {
  it("formats dollars with separators and two decimals", () => {
    expect(fmtMoney(1234.5)).toBe("$1,234.50");
  });

  it("treats zero as a value, not as missing", () => {
    expect(fmtMoney(0)).toBe("$0.00");
  });

  it("handles a billion and negatives", () => {
    expect(fmtMoney(1000000000)).toBe("$1,000,000,000.00");
    expect(fmtMoney(-12.3)).toBe("-$12.30");
  });
});

describe("fmtQty", () => {
  it("trims trailing zeros up to six decimals", () => {
    expect(fmtQty(1.5)).toBe("1.5");
    expect(fmtQty(10)).toBe("10");
    expect(fmtQty(0.1234567)).toBe("0.123457");
    expect(fmtQty(1234)).toBe("1,234");
  });
});

describe("fmtSigned", () => {
  it("signs everything except zero", () => {
    expect(fmtSigned(12.3)).toBe("+12.30");
    expect(fmtSigned(-12.3)).toBe("-12.30");
    expect(fmtSigned(0)).toBe("0.00");
  });
});

describe("fmtPct", () => {
  it("treats change_percent as already in percent units", () => {
    expect(fmtPct(0.63)).toBe("+0.63%");
    expect(fmtPct(-0.63)).toBe("-0.63%");
  });

  it("renders a value that rounds to zero without a sign", () => {
    expect(fmtPct(0)).toBe("0.00%");
    expect(fmtPct(-0.001)).toBe("0.00%");
  });
});

describe("missing values", () => {
  it.each(missing)("every formatter returns -- for %s", (value) => {
    for (const fmt of [fmtMoney, fmtQty, fmtSigned, fmtPct]) {
      expect(fmt(value)).toBe(MISSING);
    }
  });
});

describe("toneClass", () => {
  it("maps formatted text to a color class", () => {
    expect(toneClass("--")).toBe("text-muted");
    expect(toneClass("+0.63%")).toBe("text-up");
    expect(toneClass("-0.63%")).toBe("text-down");
    expect(toneClass("0.00%")).toBe("text-fg");
  });
});
