// Get timezone from environment variable (must match backend)
// Use NEXT_PUBLIC_APPOINTMENT_TIMEZONE to match frontend, with fallback for backward compatibility
export const APPOINTMENT_TIMEZONE = process.env.NEXT_PUBLIC_APPOINTMENT_TIMEZONE || process.env.APPOINTMENT_TIMEZONE || 'America/Los_Angeles';

/**
 * Extract date/time components from a Date object as they appear in a specific timezone.
 * This ensures the frontend sends time components that match what the backend expects.
 * 
 * @param date The Date object (represents a moment in time)
 * @param timezone IANA timezone string (e.g., 'America/Los_Angeles')
 * @returns Object with year, month, day, hour, minute, second in the specified timezone
 */
export function extractComponentsInTimezone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  
  return {
    year: parseInt(parts.find(p => p.type === 'year')?.value || '0'),
    month: parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1, // 0-indexed
    day: parseInt(parts.find(p => p.type === 'day')?.value || '0'),
    hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
    minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0'),
    second: parseInt(parts.find(p => p.type === 'second')?.value || '0'),
  };
}

/**
 * Convert a Date object to show what it looks like in the appointment timezone.
 * This creates a "fake" Date object that, when displayed using local time methods,
 * shows the same values as the original date in the target timezone.
 * 
 * @param date The Date object (represents a moment in time)
 * @param timezone IANA timezone string (e.g., 'America/Los_Angeles')
 * @returns A Date object that displays as the target timezone when using local time methods
 */
export function convertToTimezoneDisplayDate(date: Date, timezone: string): Date {
  const components = extractComponentsInTimezone(date, timezone);
  // Create a Date object using the components as if they were local time
  // This makes the DatePicker show the correct time in the appointment timezone
  return new Date(
    components.year,
    components.month,
    components.day,
    components.hour,
    components.minute,
    components.second
  );
}

/**
 * Convert a Date object (from DatePicker, showing appointment timezone) back to UTC.
 * The DatePicker gives us a Date that represents the selected time as if it were local time,
 * but we need to interpret it as being in the appointment timezone.
 * 
 * @param localDate The Date object from DatePicker (represents time in appointment timezone, displayed as local)
 * @param timezone IANA timezone string (e.g., 'America/Los_Angeles')
 * @returns A Date object representing the correct UTC moment
 */
export function convertFromTimezoneDisplayDate(localDate: Date, timezone: string): Date {
  // Extract components as if they were in the appointment timezone
  const year = localDate.getFullYear();
  const month = localDate.getMonth();
  const day = localDate.getDate();
  const hour = localDate.getHours();
  const minute = localDate.getMinutes();
  const second = localDate.getSeconds();
  
  // Now convert these components (interpreted as being in the appointment timezone) to UTC
  // We'll use a similar approach to the backend's convertToTimezoneUTC
  let candidateUTC = Date.UTC(year, month, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  // Iterate to find the correct UTC time
  for (let i = 0; i < 10; i++) {
    const candidateDate = new Date(candidateUTC);
    const parts = formatter.formatToParts(candidateDate);
    
    const tzYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const tzMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const tzDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    
    if (tzYear === year && tzMonth === month && tzDay === day && tzHour === hour && tzMinute === minute) {
      return candidateDate;
    }
    
    const hourDiff = hour - tzHour;
    const minuteDiff = minute - tzMinute;
    const dayDiff = day - tzDay;
    const totalMinutesDiff = dayDiff * 24 * 60 + hourDiff * 60 + minuteDiff;
    candidateUTC += totalMinutesDiff * 60 * 1000;
  }
  
  return new Date(candidateUTC);
}

/**
 * Get a human-readable timezone name (e.g., "Pacific Time" from "America/Los_Angeles")
 */
export function getTimezoneDisplayName(timezone: string): string {
  try {
    // Use Intl.DateTimeFormat to get the long timezone name
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'long'
    });
    const parts = formatter.formatToParts(new Date());
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value || timezone;
    
    // Remove "Standard Time" or "Daylight Time" suffix to get just the base timezone name
    // e.g., "Pacific Standard Time" -> "Pacific Time", "Eastern Daylight Time" -> "Eastern Time"
    return tzName.replace(/\s(Standard|Daylight)\sTime$/, ' Time');
  } catch {
    return timezone;
  }
}

/**
 * Format a date/time in a specific timezone
 */
export function formatInTimezone(date: Date, timezone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: timezone,
  }).format(date);
}

/**
 * Format time only in appointment timezone (e.g., "2:00 PM")
 */
export function formatTimeInAppointmentTimezone(date: Date): string {
  return formatInTimezone(date, APPOINTMENT_TIMEZONE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format full date in appointment timezone (e.g., "Monday, January 15, 2024")
 */
export function formatFullDateInAppointmentTimezone(date: Date): string {
  return formatInTimezone(date, APPOINTMENT_TIMEZONE, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format date/time in appointment timezone (e.g., "Jan 15, 2024, 2:00 PM")
 */
export function formatDateTimeInAppointmentTimezone(date: Date): string {
  return formatInTimezone(date, APPOINTMENT_TIMEZONE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format full date/time in appointment timezone (e.g., "January 15, 2024, 2:00 PM")
 * Used for displaying selected appointment time in submit form
 */
export function formatFullDateTimeInAppointmentTimezone(date: Date): string {
  return formatInTimezone(date, APPOINTMENT_TIMEZONE, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Convert date/time components to UTC ISO string, treating them as being in the specified timezone.
 * This interprets the provided components (e.g., "Jan 15, 2:00 PM") as being in the target timezone,
 * then converts to UTC for storage.
 * 
 * @param year Year (e.g., 2024)
 * @param month Month (0-11)
 * @param day Day of month (1-31)
 * @param hour Hour (0-23)
 * @param minute Minute (0-59)
 * @param second Second (0-59, default 0)
 * @param timezone IANA timezone (e.g., 'America/Los_Angeles')
 * @returns ISO string in UTC
 */
export function convertComponentsToTimezoneUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string
): string {
  // Strategy: Find the UTC time that, when displayed in the target timezone,
  // shows our desired date/time components
  
  // Start with an approximate UTC time using the components directly
  let candidateUTC = Date.UTC(year, month, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  // Binary search / iteration to find correct UTC
  for (let i = 0; i < 10; i++) {
    const candidateDate = new Date(candidateUTC);
    const parts = formatter.formatToParts(candidateDate);
    
    const tzYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const tzMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const tzDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    
    // Check if we have a match
    if (tzYear === year && tzMonth === month && tzDay === day && tzHour === hour && tzMinute === minute) {
      return candidateDate.toISOString();
    }
    
    // Calculate adjustment needed
    // If timezone shows 1PM but we want 2PM, we need to add 1 hour to UTC
    const hourDiff = hour - tzHour;
    const minuteDiff = minute - tzMinute;
    const dayDiff = day - tzDay;
    
    // Adjust UTC time
    const totalMinutesDiff = dayDiff * 24 * 60 + hourDiff * 60 + minuteDiff;
    candidateUTC += totalMinutesDiff * 60 * 1000;
  }
  
  // Return the best candidate we found
  return new Date(candidateUTC).toISOString();
}

