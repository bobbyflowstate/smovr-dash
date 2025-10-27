// Shared constants for log actions across the application

export const LOG_ACTIONS = {
  FIFTEEN_LATE: '15-late',
  THIRTY_LATE: '30-late',
  RESCHEDULE_CANCEL: 'reschedule-cancel',
} as const;

export type LogAction = typeof LOG_ACTIONS[keyof typeof LOG_ACTIONS];

export const VALID_ACTIONS: readonly LogAction[] = [
  LOG_ACTIONS.FIFTEEN_LATE,
  LOG_ACTIONS.THIRTY_LATE,
  LOG_ACTIONS.RESCHEDULE_CANCEL,
] as const;

export const LOG_MESSAGES: Record<LogAction, string> = {
  [LOG_ACTIONS.FIFTEEN_LATE]: 'Patient indicated they are running 15 minutes late',
  [LOG_ACTIONS.THIRTY_LATE]: 'Patient indicated they are running 30 minutes late',
  [LOG_ACTIONS.RESCHEDULE_CANCEL]: 'Patient requested to reschedule or cancel',
};

export function isValidAction(action: string): action is LogAction {
  return VALID_ACTIONS.includes(action as LogAction);
}

