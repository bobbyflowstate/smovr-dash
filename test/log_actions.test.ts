import { describe, expect, it } from "vitest";
import {
  LOG_ACTIONS,
  VALID_ACTIONS,
  LOG_MESSAGES,
  isValidAction,
} from "../src/lib/log-actions";

describe("log-actions", () => {
  it("declares the expected valid actions", () => {
    expect(VALID_ACTIONS).toEqual([
      LOG_ACTIONS.FIFTEEN_LATE,
      LOG_ACTIONS.THIRTY_LATE,
      LOG_ACTIONS.RESCHEDULE_CANCEL,
    ]);
  });

  it("has a log message for every valid action", () => {
    for (const action of VALID_ACTIONS) {
      expect(typeof LOG_MESSAGES[action]).toBe("string");
      expect(LOG_MESSAGES[action].length).toBeGreaterThan(0);
    }
  });

  it("isValidAction accepts only known actions", () => {
    expect(isValidAction("15-late")).toBe(true);
    expect(isValidAction("30-late")).toBe(true);
    expect(isValidAction("reschedule-cancel")).toBe(true);

    expect(isValidAction("")).toBe(false);
    expect(isValidAction("late")).toBe(false);
    expect(isValidAction("15")).toBe(false);
    expect(isValidAction("15-late ")).toBe(false);
  });
});


