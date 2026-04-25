const fs = require('fs');
const path = require('path');
const os = require('os');
const { getStatusSnapshot, appendLog, getSanitizedLogs, clearLogs } = require('../utils/status.store.js');
const { SignerService } = require('../services/sign.service.js');

const projectRoot = path.resolve(__dirname, '..', '..');
// If running under Electron packaged app, a writable user .env may be provided
const envFilePath = process.env.USER_CONFIG_PATH || path.join(projectRoot, '.env');

const readEnvFile = () => {
  try {
    return fs.readFileSync(envFilePath, { encoding: 'utf-8' });
  } catch (err) {
    return '';
  }
};

const writeEnvFile = (content) => {
  try {
    // Ensure directory exists for user config (when envFilePath is in userData)
    const dir = path.dirname(envFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(envFilePath, content, { encoding: 'utf-8' });
  } catch (e) {
    console.error('[admin] Failed to write env file to', envFilePath, e && e.message);
    throw e;
  }
};

const setEnvVar = (key, value, escapeForWindows = false) => {
  let content = readEnvFile();
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

exports.getConfigHandler = async (_req, res) => {
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
      userEnvFilePath: envFilePath,
      userEnvFileExists: fs.existsSync(envFilePath),
      autoStartEnabled: (process.env.APP_AUTO_START === 'true') || false,
    };
    res.json({ success: true, data: cfg });
  } catch (error) {
    console.error('[admin] getConfigHandler error:', error);
    res.status(500).json({ success: false, error: 'Failed to read config' });
  }
};

exports.getStatusHandler = async (_req, res) => {
  try {
    const snapshot = getStatusSnapshot();
    try {
      const probe = SignerService.probeTokenInfo();
      if (probe) {
        snapshot.tokenDetected = true;
        snapshot.tokenInfo = probe.tokenInfo;
        snapshot.detectedDriver = { name: probe.driverName, path: probe.driverPath };
      } else {
        snapshot.tokenDetected = false;
      }
    } catch (e) {
      snapshot.tokenDetected = false;
    }
    res.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('[admin] getStatusHandler error:', error);
    res.status(500).json({ success: false, error: 'Failed to read status' });
  }
};

exports.getLogsHandler = async (_req, res) => {
  try {
    const logs = getSanitizedLogs();
    // Ensure logs are returned newest-first; include rawTimestamp for client sorting
    return res.json({ success: true, data: logs });
  } catch (e) {
    console.error('[admin] getLogsHandler error:', e);
    return res.status(500).json({ success: false, error: 'Failed to read logs' });
  }
};

exports.updateDriverPathHandler = async (req, res) => {
  try {
    const { driverPath, applyTo } = req.body || {};
    if (!driverPath || typeof driverPath !== 'string') return res.status(400).json({ success: false, error: 'driverPath is required' });
    const platform = os.platform();
    const scope = applyTo || 'platform';
    const windowsKey = 'PKCS11_LIBRARY_PATH_WINDOWS';
    const linuxKey = 'PKCS11_LIBRARY_PATH_LINUX';
    const darwinKey = 'PKCS11_LIBRARY_PATH_DARWIN';
    const genericKey = 'PKCS11_LIBRARY_PATH';
    const updated = {};
    const updateKey = (key, escapeForWindows = false) => {
      setEnvVar(key, driverPath, escapeForWindows);
      process.env[key] = escapeForWindows && platform === 'win32' ? driverPath.replace(/\\/g, '\\') : driverPath;
      updated[key] = process.env[key];
    };
    if (scope === 'generic') {
      updateKey(genericKey, false);
    } else if (scope === 'both') {
      updateKey(genericKey, false);
      if (platform === 'win32') updateKey(windowsKey, true);
      if (platform === 'linux') updateKey(linuxKey, false);
      if (platform === 'darwin') updateKey(darwinKey, false);
    } else {
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

exports.appendLogHandler = async (req, res) => {
  try {
    const { type, text } = req.body || {};
    const t = typeof type === 'string' && ['info', 'error', 'success', 'warning'].includes(type) ? type : 'info';
    const msg = typeof text === 'string' ? text : JSON.stringify(text || '');
    appendLog(t, msg);
    return res.json({ success: true });
  } catch (e) {
    console.error('[admin] appendLogHandler error:', e);
    return res.status(500).json({ success: false, error: 'Failed to append log' });
  }
};

exports.getLogsFileHandler = async (_req, res) => {
  try {
    const logsPath = path.join(projectRoot, 'logs', 'logs.json');
    if (!fs.existsSync(logsPath)) return res.status(404).json({ success: false, error: 'Logs file not found' });
    return res.download(logsPath, 'logs.json');
  } catch (e) {
    console.error('[admin] getLogsFileHandler error:', e);
    return res.status(500).json({ success: false, error: 'Failed to read logs file' });
  }
};

exports.clearLogsHandler = async (_req, res) => {
  try {
    clearLogs();
    return res.json({ success: true });
  } catch (e) {
    console.error('[admin] clearLogsHandler error:', e);
    return res.status(500).json({ success: false, error: 'Failed to clear logs' });
  }
};
