// ── utils/uptime.js ────────────────────────────────
// Pure computation: turn client_status_history rows into uptime% + incidents.

const RANGE_MS = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 };

function parseRangeMs(range) {
  return RANGE_MS[range] || RANGE_MS['24h'];
}

// priorStatus: status the client was in at windowStart ('online'/'offline')
// historyWithin: rows [{ status, changed_at }] within [windowStart, windowEnd], ascending
function computeUptime(priorStatus, historyWithin, windowStart, windowEnd) {
  const points = [{ time: windowStart, status: priorStatus }];
  for (const row of historyWithin) {
    points.push({ time: new Date(row.changed_at), status: row.status });
  }
  points.push({ time: windowEnd, status: null });

  let offlineMs = 0;
  const incidents = [];
  let openIncident = null;

  for (let i = 0; i < points.length - 1; i++) {
    const segStatus = points[i].status;
    const segStart = points[i].time;
    const segEnd = points[i + 1].time;
    const segMs = segEnd - segStart;

    if (segStatus === 'offline') {
      offlineMs += segMs;
      if (!openIncident) openIncident = segStart;
    } else if (openIncident) {
      incidents.push({
        start: openIncident.toISOString(),
        end: segStart.toISOString(),
        durationSeconds: Math.round((segStart - openIncident) / 1000),
      });
      openIncident = null;
    }
  }

  if (openIncident) {
    incidents.push({
      start: openIncident.toISOString(),
      end: null,
      durationSeconds: Math.round((windowEnd - openIncident) / 1000),
    });
  }

  const windowMs = windowEnd - windowStart;
  const uptimePercent = windowMs > 0
    ? Math.round(((windowMs - offlineMs) / windowMs) * 10000) / 100
    : 100;

  return { uptimePercent, incidents };
}

module.exports = { RANGE_MS, parseRangeMs, computeUptime };
