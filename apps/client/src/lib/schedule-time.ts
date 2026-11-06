export function formatVenueDateTime(value: string, venueTimezone: string | undefined): string {
  const unavailable = 'Время зала недоступно';
  const instant = new Date(value);
  // Scheduling read models emit UTC instants. Reject invalid/naive values,
  // including dates normalized by Date (for example February 30).
  if (
    !venueTimezone || !value.endsWith('Z') || !Number.isFinite(instant.getTime())
    || instant.toISOString().slice(0, 19) !== value.slice(0, 19)
  ) return unavailable;
  try {
    return `${new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23', timeZone: venueTimezone, timeZoneName: 'shortOffset',
    }).format(instant)} · время зала`;
  } catch {
    return unavailable;
  }
}
