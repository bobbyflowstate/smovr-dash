import { describe, expect, it } from "vitest";
import { format, getDaysInMonth } from "date-fns";

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const date = new Date(2024, i, 1);
  return { value: String(i + 1).padStart(2, '0'), label: format(date, 'MMMM') };
});

function getDaysForMonth(month: string): string[] {
  const count = getDaysInMonth(new Date(2024, parseInt(month, 10) - 1));
  return Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, '0'));
}

function formatBirthday(birthday: string): string {
  const parts = birthday.split('-');
  const mm = parts.length === 3 ? parts[1] : parts[0];
  const dd = parts.length === 3 ? parts[2] : parts[1];
  const date = new Date(2024, parseInt(mm, 10) - 1, parseInt(dd, 10));
  return format(date, 'MMMM d');
}

describe("MONTHS constant", () => {
  it("has 12 entries", () => {
    expect(MONTHS).toHaveLength(12);
  });

  it("starts with January and ends with December", () => {
    expect(MONTHS[0]).toEqual({ value: "01", label: "January" });
    expect(MONTHS[11]).toEqual({ value: "12", label: "December" });
  });

  it("values are zero-padded two-digit strings", () => {
    for (const m of MONTHS) {
      expect(m.value).toMatch(/^\d{2}$/);
    }
  });
});

describe("getDaysForMonth", () => {
  it("returns 31 days for January", () => {
    const days = getDaysForMonth("01");
    expect(days).toHaveLength(31);
    expect(days[0]).toBe("01");
    expect(days[30]).toBe("31");
  });

  it("returns 29 days for February (leap year safe)", () => {
    const days = getDaysForMonth("02");
    expect(days).toHaveLength(29);
  });

  it("returns 30 days for April", () => {
    const days = getDaysForMonth("04");
    expect(days).toHaveLength(30);
  });

  it("returns zero-padded day strings", () => {
    const days = getDaysForMonth("03");
    expect(days[0]).toBe("01");
    expect(days[8]).toBe("09");
    expect(days[9]).toBe("10");
  });
});

describe("formatBirthday", () => {
  it("formats MM-DD to 'Month day'", () => {
    expect(formatBirthday("01-15")).toBe("January 15");
    expect(formatBirthday("12-25")).toBe("December 25");
    expect(formatBirthday("07-04")).toBe("July 4");
  });

  it("handles legacy YYYY-MM-DD format gracefully", () => {
    expect(formatBirthday("1990-03-08")).toBe("March 8");
    expect(formatBirthday("2000-11-30")).toBe("November 30");
  });

  it("handles single-digit days without leading zero", () => {
    expect(formatBirthday("06-01")).toBe("June 1");
    expect(formatBirthday("09-09")).toBe("September 9");
  });
});
