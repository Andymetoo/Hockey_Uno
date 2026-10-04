export const RECORDER_PAGE_SIZE = 100;

// Historical pages use an absolute end index, so arriving events never move
// the page being inspected. null follows the latest events.
export function recorderWindow(log, end = null) {
  const to = end === null ? log.length : Math.min(log.length, Math.max(0, end));
  const from = Math.max(0, to - RECORDER_PAGE_SIZE);
  return { events: log.slice(from, to), from, to, total: log.length };
}
