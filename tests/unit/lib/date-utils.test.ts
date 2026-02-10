import { describe, it, expect } from "vitest";
import {
    getStartOfWeek,
    getEndOfWeek,
    getStartOfMonth,
    getEndOfMonth,
    getStartOfYear,
    getEndOfYear,
    getDateRange,
    addPeriod,
    formatDateTimeForApi,
    parseDateRangeStart,
    parseDateRangeEnd,
} from "@/lib/date-utils";

describe("date-utils", () => {
    describe("getStartOfWeek", () => {
        it("returns Monday for a mid-week date", () => {
            // 2026-02-04 is Wednesday
            const result = getStartOfWeek(new Date("2026-02-04"));
            expect(result.getDay()).toBe(1); // Monday
            expect(result.getDate()).toBe(2); // Feb 2
        });

        it("returns same day for Monday", () => {
            // 2026-02-02 is Monday
            const result = getStartOfWeek(new Date("2026-02-02"));
            expect(result.getDay()).toBe(1);
            expect(result.getDate()).toBe(2);
        });

        it("returns previous Monday for Sunday", () => {
            // 2026-02-08 is Sunday
            const result = getStartOfWeek(new Date("2026-02-08"));
            expect(result.getDay()).toBe(1);
            expect(result.getDate()).toBe(2);
        });
    });

    describe("getEndOfWeek", () => {
        it("returns Sunday for a mid-week date", () => {
            // 2026-02-04 is Wednesday
            const result = getEndOfWeek(new Date("2026-02-04"));
            expect(result.getDay()).toBe(0); // Sunday
            expect(result.getDate()).toBe(8); // Feb 8
        });
    });

    describe("getStartOfMonth", () => {
        it("returns first day of month", () => {
            const result = getStartOfMonth(new Date("2026-02-15"));
            expect(result.getDate()).toBe(1);
            expect(result.getMonth()).toBe(1); // February (0-indexed)
        });
    });

    describe("getEndOfMonth", () => {
        it("returns last day of February (non-leap year)", () => {
            const result = getEndOfMonth(new Date("2026-02-15"));
            expect(result.getDate()).toBe(28);
        });

        it("returns last day of January (31 days)", () => {
            const result = getEndOfMonth(new Date("2026-01-15"));
            expect(result.getDate()).toBe(31);
        });
    });

    describe("getStartOfYear", () => {
        it("returns January 1st", () => {
            const result = getStartOfYear(new Date("2026-06-15"));
            expect(result.getMonth()).toBe(0);
            expect(result.getDate()).toBe(1);
        });
    });

    describe("getEndOfYear", () => {
        it("returns December 31st", () => {
            const result = getEndOfYear(new Date("2026-06-15"));
            expect(result.getMonth()).toBe(11);
            expect(result.getDate()).toBe(31);
        });
    });

    describe("getDateRange", () => {
        it("returns week range", () => {
            const result = getDateRange(new Date("2026-02-04"), "week");
            expect(result.startDate.getDay()).toBe(1); // Monday
            expect(result.endDate.getDay()).toBe(0); // Sunday
        });

        it("returns month range", () => {
            const result = getDateRange(new Date("2026-02-15"), "month");
            expect(result.startDate.getDate()).toBe(1);
            expect(result.endDate.getDate()).toBe(28);
        });

        it("returns year range", () => {
            const result = getDateRange(new Date("2026-06-15"), "year");
            expect(result.startDate.getMonth()).toBe(0);
            expect(result.startDate.getDate()).toBe(1);
            expect(result.endDate.getMonth()).toBe(11);
            expect(result.endDate.getDate()).toBe(31);
        });
    });

    describe("addPeriod", () => {
        it("adds weeks correctly", () => {
            const date = new Date("2026-02-04");
            const result = addPeriod(date, "week", 2);
            expect(result.getDate()).toBe(18);
        });

        it("adds months correctly", () => {
            const date = new Date("2026-02-04");
            const result = addPeriod(date, "month", 1);
            expect(result.getMonth()).toBe(2); // March
        });

        it("adds years correctly", () => {
            const date = new Date("2026-02-04");
            const result = addPeriod(date, "year", 1);
            expect(result.getFullYear()).toBe(2027);
        });

        it("handles negative periods", () => {
            const date = new Date("2026-02-04");
            const result = addPeriod(date, "month", -1);
            expect(result.getMonth()).toBe(0); // January
        });
    });

    describe("formatDateTimeForApi", () => {
        it("formats date as yyyy-MM-dd using local time", () => {
            const date = new Date(2026, 1, 4); // Feb 4, 2026 local
            const result = formatDateTimeForApi(date);
            expect(result).toBe("2026-02-04");
        });

        it("returns undefined for undefined input", () => {
            const result = formatDateTimeForApi(undefined);
            expect(result).toBeUndefined();
        });

        it("pads month and day correctly", () => {
            const date = new Date(2026, 0, 5); // Jan 5
            const result = formatDateTimeForApi(date);
            expect(result).toBe("2026-01-05");
        });
    });

    describe("parseDateRangeStart", () => {
        it("parses date string to start of day", () => {
            const result = parseDateRangeStart("2026-02-04");
            expect(result).not.toBeNull();
            expect(result!.getHours()).toBe(0);
            expect(result!.getMinutes()).toBe(0);
            expect(result!.getSeconds()).toBe(0);
        });

        it("returns null for null input", () => {
            expect(parseDateRangeStart(null)).toBeNull();
        });

        it("returns null for undefined input", () => {
            expect(parseDateRangeStart(undefined)).toBeNull();
        });

        it("returns null for invalid date string", () => {
            expect(parseDateRangeStart("not-a-date")).toBeNull();
        });

        it("handles ISO strings", () => {
            const result = parseDateRangeStart("2026-02-04T15:30:00Z");
            expect(result).not.toBeNull();
            expect(result!.getHours()).toBe(0);
        });
    });

    describe("parseDateRangeEnd", () => {
        it("parses date string to end of day", () => {
            const result = parseDateRangeEnd("2026-02-04");
            expect(result).not.toBeNull();
            expect(result!.getHours()).toBe(23);
            expect(result!.getMinutes()).toBe(59);
            expect(result!.getSeconds()).toBe(59);
        });

        it("returns null for null input", () => {
            expect(parseDateRangeEnd(null)).toBeNull();
        });

        it("returns null for invalid date string", () => {
            expect(parseDateRangeEnd("invalid")).toBeNull();
        });
    });
});
