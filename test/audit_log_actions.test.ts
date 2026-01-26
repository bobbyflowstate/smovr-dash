import { describe, expect, it } from "vitest";
import {
  AUDIT_LOG_ACTIONS,
  VALID_AUDIT_ACTIONS,
  AUDIT_LOG_MESSAGES,
  isValidAuditAction,
  // Backward compatibility aliases
  LOG_ACTIONS,
  VALID_ACTIONS,
  LOG_MESSAGES,
  isValidAction,
} from "../src/lib/audit-log-actions";

describe("audit-log-actions", () => {
  it("declares the expected valid actions", () => {
    expect(VALID_AUDIT_ACTIONS).toEqual([
      AUDIT_LOG_ACTIONS.FIFTEEN_LATE,
      AUDIT_LOG_ACTIONS.THIRTY_LATE,
      AUDIT_LOG_ACTIONS.RESCHEDULE_CANCEL,
    ]);
  });

  it("has a log message for every valid action", () => {
    for (const action of VALID_AUDIT_ACTIONS) {
      expect(typeof AUDIT_LOG_MESSAGES[action]).toBe("string");
      expect(AUDIT_LOG_MESSAGES[action].length).toBeGreaterThan(0);
    }
  });

  it("isValidAuditAction accepts only known actions", () => {
    expect(isValidAuditAction("15-late")).toBe(true);
    expect(isValidAuditAction("30-late")).toBe(true);
    expect(isValidAuditAction("reschedule-cancel")).toBe(true);

    expect(isValidAuditAction("")).toBe(false);
    expect(isValidAuditAction("late")).toBe(false);
    expect(isValidAuditAction("15")).toBe(false);
    expect(isValidAuditAction("15-late ")).toBe(false);
  });

  describe("backward compatibility aliases", () => {
    it("LOG_ACTIONS is aliased to AUDIT_LOG_ACTIONS", () => {
      expect(LOG_ACTIONS).toBe(AUDIT_LOG_ACTIONS);
    });

    it("VALID_ACTIONS is aliased to VALID_AUDIT_ACTIONS", () => {
      expect(VALID_ACTIONS).toBe(VALID_AUDIT_ACTIONS);
    });

    it("LOG_MESSAGES is aliased to AUDIT_LOG_MESSAGES", () => {
      expect(LOG_MESSAGES).toBe(AUDIT_LOG_MESSAGES);
    });

    it("isValidAction is aliased to isValidAuditAction", () => {
      expect(isValidAction).toBe(isValidAuditAction);
    });
  });
});

