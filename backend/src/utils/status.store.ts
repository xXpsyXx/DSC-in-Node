type LogEntry = { timestamp: string; type: 'info' | 'error' | 'success' | 'warning'; text: string };

const MAX_LOGS = 200;
let logs: LogEntry[] = [];
let lastAction: string | null = null;

export const appendLog = (type: LogEntry['type'], text: string) => {
  logs.unshift({ timestamp: new Date().toISOString(), type, text });
  if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);
};

export const setLastAction = (text: string) => {
  lastAction = text;
  appendLog('info', `Last action: ${text}`);
};

export const getLogs = (): LogEntry[] => logs.slice(0, MAX_LOGS);

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
    agentTime: new Date().toISOString(),
    driverPath: process.env.PKCS11_LIBRARY_PATH || process.env.PKCS11_LIBRARY_PATH_WINDOWS || process.env.PKCS11_LIBRARY_PATH_LINUX || null,
  };
};
