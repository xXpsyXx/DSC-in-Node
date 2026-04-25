const fs = require('fs');
const path = require('path');

const MAX_LOGS = 200;
let logs = [];
let lastAction = null;

const sanitizeLogText = (text) => {
  if (!text) return '';
  let out = String(text);
  out = out.replace(/^\s*\[[^\]]+\]\s*/g, '');
  const lower = out.toLowerCase();
  if (/no\s+usb\s+token/i.test(out) || /no\s+token\s+detected/i.test(out) || lower.includes('no usb token') || (lower.includes('please connect') && lower.includes('usb'))) {
    return 'No USB token detected';
  }
  out = out.replace(/CKR_PIN_INCORRECT/gi, 'Incorrect PIN');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
};

const formatTimestampIST = (input) => {
  const d = input instanceof Date ? input : input ? new Date(String(input)) : new Date();
  if (isNaN(d.getTime())) return String(input || '');
  const opts = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  };
  const formatted = new Intl.DateTimeFormat('en-GB', opts).format(d).replace(/\//g, '-').replace(',', '').trim();
  return `${formatted} IST`;
};

const sanitizeExistingLogs = () => {
  logs = logs
    .map((l) => ({ ...l, text: sanitizeLogText(l.text), timestamp: formatTimestampIST(l.timestamp) }))
    .filter((l) => {
      const t = (l.text || '').toLowerCase();
      if (t.includes('is not defined') && t.includes('getlogshandler')) return false;
      if (!t) return false;
      return true;
    });
};

const projectRoot = path.resolve(__dirname, '..', '..');
const logsDir = path.join(projectRoot, 'logs');
const logsFile = path.join(logsDir, 'logs.json');

const loadLogsFromFile = () => {
  try {
    if (!fs.existsSync(logsFile)) return;
    const raw = fs.readFileSync(logsFile, { encoding: 'utf-8' });
    const parsed = JSON.parse(raw || '{}');
    const fileLogs = Array.isArray(parsed?.logs) ? parsed.logs : [];
    logs = fileLogs
      .map((l) => ({
        // Keep both a raw ISO timestamp and a formatted display timestamp
        rawTimestamp: l?.rawTimestamp || l?.timestamp || new Date().toISOString(),
        timestamp: formatTimestampIST(l?.rawTimestamp || l?.timestamp || new Date().toISOString()),
        type: l?.type || 'info',
        text: sanitizeLogText(l?.text || ''),
      }))
      ;
    persistLogsToFile();
  } catch (e) {
    console.error('[status.store] Failed to load logs from file:', e);
  }
};

const persistLogsToFile = () => {
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const sanitized = logs.map((l) => ({ rawTimestamp: l.rawTimestamp || new Date().toISOString(), timestamp: l.timestamp, type: l.type, text: l.text }));
    fs.writeFileSync(logsFile, JSON.stringify({ updated: formatTimestampIST(new Date()), logs: sanitized }, null, 2), { encoding: 'utf-8' });
    try { console.debug(`[status.store] persisted ${sanitized.length} logs to ${logsFile}`); } catch (e) {}
  } catch (e) {
    console.error('[status.store] Failed to persist logs:', e);
  }
};

loadLogsFromFile();

const appendLog = (type, text) => {
  const nowIso = new Date().toISOString();
  const sanitizedText = sanitizeLogText(text || '');
  try {
    logs.unshift({ rawTimestamp: nowIso, timestamp: formatTimestampIST(nowIso), type, text: sanitizedText });
    if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);
    persistLogsToFile();
    try { console.debug(`[status.store] appendLog: ${nowIso} ${type} ${sanitizedText}`); } catch (e) {}
  } catch (e) {
    console.error('[status.store] appendLog failed:', e);
  }
};

const setLastAction = (text) => {
  lastAction = text;
  appendLog('info', `Last action: ${text}`);
};

const getLogs = () => logs.slice(0, MAX_LOGS);
const getSanitizedLogs = () => getLogs().map((l) => ({ rawTimestamp: l.rawTimestamp, timestamp: l.timestamp, type: l.type, text: l.text }));
const getLastAction = () => lastAction;
const clearLogs = () => { 
  logs = []; 
  try { persistLogsToFile(); } catch (e) { console.error('[status.store] Failed to persist cleared logs:', e); }
  try { console.debug('[status.store] cleared logs'); } catch (e) {}
};

const getStatusSnapshot = () => {
  return {
    serviceRunning: true,
    lastAction,
    logs: getLogs(),
    agentTime: formatTimestampIST(new Date()),
    driverPath: process.env.PKCS11_LIBRARY_PATH || process.env.PKCS11_LIBRARY_PATH_WINDOWS || process.env.PKCS11_LIBRARY_PATH_LINUX || null,
  };
};

module.exports = {
  appendLog,
  setLastAction,
  getLogs,
  getSanitizedLogs,
  getLastAction,
  clearLogs,
  getStatusSnapshot,
};
