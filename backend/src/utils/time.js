// "Today" in YOUR timezone (IST by default), not the server's - servers run
// in UTC, and daily limits should reset at your midnight.
function tzOffsetMinutes() {
  const n = Number(process.env.APP_TZ_OFFSET_MINUTES);
  return Number.isFinite(n) ? n : 330; // IST
}

function startOfToday(now = new Date()) {
  const offset = tzOffsetMinutes() * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

function daysFromNow(days, now = new Date()) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

module.exports = { startOfToday, daysFromNow, tzOffsetMinutes };
