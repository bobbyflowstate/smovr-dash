// Shared constants for audit log actions across the application
// These track patient responses to appointment notifications (e.g., "running late")

export const AUDIT_LOG_ACTIONS = {
  FIFTEEN_LATE: '15-late',
  THIRTY_LATE: '30-late',
  RESCHEDULE_CANCEL: 'reschedule-cancel',
} as const;

export type AuditLogAction = typeof AUDIT_LOG_ACTIONS[keyof typeof AUDIT_LOG_ACTIONS];

export const VALID_AUDIT_ACTIONS: readonly AuditLogAction[] = [
  AUDIT_LOG_ACTIONS.FIFTEEN_LATE,
  AUDIT_LOG_ACTIONS.THIRTY_LATE,
  AUDIT_LOG_ACTIONS.RESCHEDULE_CANCEL,
] as const;

export const AUDIT_LOG_MESSAGES: Record<AuditLogAction, string> = {
  [AUDIT_LOG_ACTIONS.FIFTEEN_LATE]: 'Patient indicated they are running 15 minutes late',
  [AUDIT_LOG_ACTIONS.THIRTY_LATE]: 'Patient indicated they are running 30 minutes late',
  [AUDIT_LOG_ACTIONS.RESCHEDULE_CANCEL]: 'Patient visited the reschedule or cancel page',
};

export function isValidAuditAction(action: string): action is AuditLogAction {
  return VALID_AUDIT_ACTIONS.includes(action as AuditLogAction);
}

// Backward compatibility aliases (deprecated - use new names)
/** @deprecated Use AUDIT_LOG_ACTIONS instead */
export const LOG_ACTIONS = AUDIT_LOG_ACTIONS;
/** @deprecated Use AuditLogAction instead */
export type LogAction = AuditLogAction;
/** @deprecated Use VALID_AUDIT_ACTIONS instead */
export const VALID_ACTIONS = VALID_AUDIT_ACTIONS;
/** @deprecated Use AUDIT_LOG_MESSAGES instead */
export const LOG_MESSAGES = AUDIT_LOG_MESSAGES;
/** @deprecated Use isValidAuditAction instead */
export const isValidAction = isValidAuditAction;

