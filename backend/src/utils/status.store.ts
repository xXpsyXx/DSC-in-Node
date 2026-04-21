type LogEntry = { timestamp: string; type: 'info' | 'error' | 'success' | 'warning'; text: string };

const MAX_LOGS = 200;
let logs: LogEntry[] = [];
let lastAction: string | null = null;
// Helper: sanitize log text to remove internal tags and make messages human-friendly
const sanitizeLogText = (text: string): string => {
  if (!text) return '';
  let out = String(text);
  // Remove bracketed prefixes like "[getCertDetails] "
  out = out.replace(/^\s*\[[^\]]+\]\s*/g, '');
  // Collapse USB token detection messages to a short, user-friendly message
  const lower = out.toLowerCase();
  if (/no\s+usb\s+token/i.test(out) || /no\s+token\s+detected/i.test(out) || lower.includes('no usb token') || (lower.includes('please connect') && lower.includes('usb'))) {
    return 'No USB token detected';
  }
  // Replace common PKCS11 error codes with readable text
  out = out.replace(/CKR_PIN_INCORRECT/gi, 'Incorrect PIN');
  // Normalize whitespace
  out = out.replace(/\s+/g, ' ').trim();
  return out;
};

// Clean up any existing logs in memory (best-effort)
// Format a date or ISO string into IST (Asia/Kolkata) 12-hour format: "DD-MM-YYYY hh:mm:ss AM/PM IST"
const formatTimestampIST = (input?: string | Date): string => {
  const d = input instanceof Date ? input : input ? new Date(String(input)) : new Date();
  if (isNaN(d.getTime())) return String(input || '');
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  };
  // e.g. "21/04/2026, 05:12:34 PM" -> convert to dashes and append IST
  const formatted = new Intl.DateTimeFormat('en-GB', opts).format(d).replace(/\//g, '-').replace(',', '').trim();
  return `${formatted} IST`;
};

const sanitizeExistingLogs = (): void => {
  logs = logs
    .map((l) => ({ ...l, text: sanitizeLogText(l.text), timestamp: formatTimestampIST(l.timestamp) }))
    .filter((l) => {
      const t = (l.text || '').toLowerCase();
      // Remove JavaScript reference errors leaked into logs
      if (t.includes('is not defined') && t.includes('getlogshandler')) return false;
      // Remove empty messages
      if (!t) return false;
      return true;
    });
};
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const logsDir = path.join(projectRoot, 'logs');
const logsFile = path.join(logsDir, 'logs.json');

const loadLogsFromFile = (): void => {
  try {
    if (!fs.existsSync(logsFile)) return;
    const raw = fs.readFileSync(logsFile, { encoding: 'utf-8' });
    const parsed = JSON.parse(raw || '{}');
    const fileLogs = Array.isArray(parsed?.logs) ? parsed.logs : [];
    // Map and sanitize entries from file into memory
    logs = fileLogs
      .map((l: any) => ({
        timestamp: l?.timestamp || new Date().toISOString(),
        type: l?.type || 'info',
        text: sanitizeLogText(l?.text || ''),
      }))
      .map((l: LogEntry) => ({ ...l, timestamp: formatTimestampIST(l.timestamp) }));
    // Persist back to ensure uniform formatting
    persistLogsToFile();
  } catch (e) {
    console.error('[status.store] Failed to load logs from file:', e);
  }
};

const persistLogsToFile = () => {
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    // Sanitize entries before persisting so logs are human-friendly
    const sanitized = logs.map((l) => ({ timestamp: l.timestamp, type: l.type, text: l.text }));
    fs.writeFileSync(logsFile, JSON.stringify({ updated: formatTimestampIST(new Date()), logs: sanitized }, null, 2), { encoding: 'utf-8' });
  } catch (e) {
    console.error('[status.store] Failed to persist logs:', e);
  }
};

// Load persisted logs and sanitize/normalize timestamps on module load
loadLogsFromFile();

export const appendLog = (type: LogEntry['type'], text: string) => {
  const sanitizedText = sanitizeLogText(text || '');
  logs.unshift({ timestamp: formatTimestampIST(new Date()), type, text: sanitizedText });
  if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);
  persistLogsToFile();
};

export const setLastAction = (text: string) => {
  lastAction = text;
  appendLog('info', `Last action: ${text}`);
};

export const getLogs = (): LogEntry[] => logs.slice(0, MAX_LOGS);
// Return sanitized logs for API consumption
export const getSanitizedLogs = (): LogEntry[] => getLogs().map((l) => ({ timestamp: l.timestamp, type: l.type, text: l.text }));

export const getLastAction = (): string | null => lastAction;

export const clearLogs = () => {
  logs = [];
};

export const getStatusSnapshot = (): {
  serviceRunning: boolean;
  lastAction: string | null;
  logs: LogEntry[];
  agentTime: string;
  driverPath?: string | null;
} => {
  return {
    serviceRunning: true,
    lastAction,
    logs: getLogs(),
    agentTime: formatTimestampIST(new Date()),
    driverPath: process.env.PKCS11_LIBRARY_PATH || process.env.PKCS11_LIBRARY_PATH_WINDOWS || process.env.PKCS11_LIBRARY_PATH_LINUX || null,
  };
};
