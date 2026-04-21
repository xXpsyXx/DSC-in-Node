import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { getStatusSnapshot, appendLog, getSanitizedLogs } from '../utils/status.store.ts';
import { SignerService } from '../services/sign.service.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const envFilePath = path.join(projectRoot, '.env');

const readEnvFile = (): string => {
  try {
    return fs.readFileSync(envFilePath, { encoding: 'utf-8' });
  } catch (err) {
    return '';
  }
};

const writeEnvFile = (content: string): void => {
  fs.writeFileSync(envFilePath, content, { encoding: 'utf-8' });
};

const setEnvVar = (key: string, value: string, escapeForWindows = false) => {
  let content = readEnvFile();
  // Escape backslashes on Windows variables so .env keeps double-slash style
  if (escapeForWindows && os.platform() === 'win32') {
    value = value.replace(/\\/g, '\\\\');
  }

  const keyRegex = new RegExp(`^${key}=.*$`, 'm');
  const newLine = `${key}=${value}`;

  if (keyRegex.test(content)) {
    content = content.replace(keyRegex, newLine);
  } else {
    if (content && !content.endsWith('\n')) content += '\n';
    content += newLine + '\n';
  }

  writeEnvFile(content);
};

export const getConfigHandler = async (_req: Request, res: Response) => {
  try {
    const cfg = {
      port: process.env.PORT || null,
      pkcs11LibraryPath: process.env.PKCS11_LIBRARY_PATH || null,
      pkcs11LibraryPathWindows: process.env.PKCS11_LIBRARY_PATH_WINDOWS || null,
      pkcs11LibraryPathLinux: process.env.PKCS11_LIBRARY_PATH_LINUX || null,
      pkcs11LibraryPathDarwin: process.env.PKCS11_LIBRARY_PATH_DARWIN || null,
      pkcs11SlotIndex: process.env.PKCS11_SLOT_INDEX || null,
      pkcs11CertLabel: process.env.PKCS11_CERT_LABEL || null,
      timestamp: new Date().toISOString(),
    };

    res.json({ success: true, data: cfg });
  } catch (error) {
    console.error('[admin] getConfigHandler error:', error);
    res.status(500).json({ success: false, error: 'Failed to read config' });
  }
};

export const getStatusHandler = async (_req: Request, res: Response) => {
  try {
    const snapshot = getStatusSnapshot();
    // Probe token info if available
    try {
      const probe = SignerService.probeTokenInfo();
      if (probe) {
        (snapshot as any).tokenDetected = true;
        (snapshot as any).tokenInfo = probe.tokenInfo;
        (snapshot as any).detectedDriver = { name: probe.driverName, path: probe.driverPath };
      } else {
        (snapshot as any).tokenDetected = false;
      }
    } catch (e) {
      (snapshot as any).tokenDetected = false;
    }

    res.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('[admin] getStatusHandler error:', error);
    res.status(500).json({ success: false, error: 'Failed to read status' });
  }
};

export const getLogsHandler = async (_req: Request, res: Response) => {
  try {
    // Return the persisted/sanitized logs (from memory)
    const logs = getSanitizedLogs();
    return res.json({ success: true, data: logs });
  } catch (e) {
    console.error('[admin] getLogsHandler error:', e);
    return res.status(500).json({ success: false, error: 'Failed to read logs' });
  }
};

/**
 * Update driver path. Expects JSON: { driverPath: string, applyTo?: 'platform'|'generic'|'both' }
 */
export const updateDriverPathHandler = async (req: Request, res: Response) => {
  try {
    const { driverPath, applyTo } = req.body || {};
    if (!driverPath || typeof driverPath !== 'string') {
      return res.status(400).json({ success: false, error: 'driverPath is required' });
    }

    const platform = os.platform();
    const scope = applyTo || 'platform';

    const windowsKey = 'PKCS11_LIBRARY_PATH_WINDOWS';
    const linuxKey = 'PKCS11_LIBRARY_PATH_LINUX';
    const darwinKey = 'PKCS11_LIBRARY_PATH_DARWIN';
    const genericKey = 'PKCS11_LIBRARY_PATH';

    const updated: Record<string, string> = {};

    const updateKey = (key: string, escapeForWindows = false) => {
      setEnvVar(key, driverPath, escapeForWindows);
      // Also update runtime env so new value is immediately available
      process.env[key] = escapeForWindows && platform === 'win32' ? driverPath.replace(/\\/g, '\\') : driverPath;
      updated[key] = process.env[key] as string;
    };

    if (scope === 'generic') {
      updateKey(genericKey, false);
    } else if (scope === 'both') {
      updateKey(genericKey, false);
      if (platform === 'win32') updateKey(windowsKey, true);
      if (platform === 'linux') updateKey(linuxKey, false);
      if (platform === 'darwin') updateKey(darwinKey, false);
    } else {
      // platform
      if (platform === 'win32') updateKey(windowsKey, true);
      if (platform === 'linux') updateKey(linuxKey, false);
      if (platform === 'darwin') updateKey(darwinKey, false);
    }

    return res.json({ success: true, updated });
  } catch (error) {
    console.error('[admin] updateDriverPathHandler error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update driver path' });
  }
};

/**
 * Append a server-side log entry. Expects JSON: { type: 'info'|'error'|'success'|'warning', text: string }
 */
export const appendLogHandler = async (req: Request, res: Response) => {
  try {
    const { type, text } = req.body || {};
    const t = typeof type === 'string' && ['info', 'error', 'success', 'warning'].includes(type) ? type : 'info';
    const msg = typeof text === 'string' ? text : JSON.stringify(text || '');
    appendLog(t as any, msg);
    return res.json({ success: true });
  } catch (e) {
    console.error('[admin] appendLogHandler error:', e);
    return res.status(500).json({ success: false, error: 'Failed to append log' });
  }
};

export const getLogsFileHandler = async (_req: Request, res: Response) => {
  try {
    const logsPath = path.join(projectRoot, 'logs', 'logs.json');
    if (!fs.existsSync(logsPath)) return res.status(404).json({ success: false, error: 'Logs file not found' });
    return res.download(logsPath, 'logs.json');
  } catch (e) {
    console.error('[admin] getLogsFileHandler error:', e);
    return res.status(500).json({ success: false, error: 'Failed to read logs file' });
  }
};
