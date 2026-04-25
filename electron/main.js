const { app, BrowserWindow, ipcMain, nativeImage, Menu, Tray } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const dotenv = require('dotenv');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const SERVER_PORT = 45763;

let mainWindow = null;
let tray = null;
let trayStatusInterval = null;
let isQuiting = false;
// Minimum window size to prevent UI from shrinking too small
// Increased by 30px per user request
const MIN_WINDOW_WIDTH = 930;
const MIN_WINDOW_HEIGHT = 520;

// When running as a packaged Electron app, use a writable .env in userData
const userEnvPath = path.join(app.getPath('userData'), '.env');
process.env.USER_CONFIG_PATH = userEnvPath;

// If packaged, copy the bundled default env into userData on first run so end-users get sensible defaults
try {
  const packagedDefaultEnv = path.join(__dirname, 'default.env');
  if (app.isPackaged && !fs.existsSync(userEnvPath) && fs.existsSync(packagedDefaultEnv)) {
    fs.mkdirSync(path.dirname(userEnvPath), { recursive: true });
    fs.copyFileSync(packagedDefaultEnv, userEnvPath);
    console.log('[electron] Copied packaged default.env to', userEnvPath);
  }
} catch (e) {
  console.warn('[electron] Failed to copy packaged default.env to userData:', e && e.message);
}

// If a user config .env exists in userData, load it into process.env before starting the server
try {
  if (fs.existsSync(userEnvPath)) {
    dotenv.config({ path: userEnvPath });
    console.log('[electron] Loaded user config from', userEnvPath);
  }
} catch (e) {
  console.warn('[electron] Failed to load user config .env:', e && e.message);
}

function startServer() {
  // Require the existing Express server; it starts on import
  require(path.join(projectRoot, 'src', 'server.js'));
}

function waitForServer(port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Server did not start in time'));
        } else {
          setTimeout(check, 200);
        }
      });
      req.end();
    };

    check();
  });
}

function createWindow() {
  const iconPathCandidate = path.join(__dirname, 'assets', 'logo.png');
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Digital Signature App',
    backgroundColor: '#0b0b0b',
    // Use titleBarOverlay on supported Windows versions so titlebar matches the app theme
    titleBarOverlay: {
      color: '#0b0b0b',
      symbolColor: '#ffffff',
      height: 34,
    },
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPathCandidate) ? iconPathCandidate : undefined,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow = win;

  // Intercept window close to hide to tray instead of quitting
  win.on('close', (e) => {
    if (!isQuiting) {
      e.preventDefault();
      try { win.hide(); } catch (err) {}
    }
  });

  const url = `http://127.0.0.1:${SERVER_PORT}/`;
  win.loadURL(url);

  // Ensure the title matches when packaged
  win.setTitle('Digital Signature App');

  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }

  // Enforce minimum size on resize attempts (prevents shrinking below min when dragging from any edge)
  try {
    win.setMinimumSize(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT);
    win.on('will-resize', (e, newBounds) => {
      if (newBounds.width < MIN_WINDOW_WIDTH || newBounds.height < MIN_WINDOW_HEIGHT) {
        e.preventDefault();
      }
    });
  } catch (e) {
    console.warn('[electron] Failed to set minimum window size:', e && e.message);
  }
}

// Create an SVG string for a solid circle of given color and size
const createCircleSvg = (color = '#2ecc71', size = 64) => {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${(size / 2) - 1}" fill="${color}"/></svg>`;
};

const createTray = async () => {
  try {
    // Render SVG to PNG buffers via sharp so Windows tray icon works reliably
    const greenSvg = createCircleSvg('#2ecc71', 64);
    const redSvg = createCircleSvg('#ff4d4f', 64);

    const greenPng = await sharp(Buffer.from(greenSvg)).png().resize(16, 16).toBuffer();
    const redPng = await sharp(Buffer.from(redSvg)).png().resize(16, 16).toBuffer();

    const greenIcon = nativeImage.createFromBuffer(greenPng);
    const redIcon = nativeImage.createFromBuffer(redPng);

    // Use green by default until we poll status
    tray = new Tray(greenIcon);
    tray.setToolTip('Digital Signature App');

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { label: 'Quit', click: () => { isQuiting = true; app.quit(); } },
    ]);

    tray.on('right-click', () => tray.popUpContextMenu(contextMenu));
    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        try { mainWindow.hide(); } catch (e) {}
      } else {
        try { if (mainWindow.isMinimized()) mainWindow.restore(); } catch (e) {}
        try { mainWindow.show(); mainWindow.focus(); } catch (e) {}
      }
    });

    // Poll server status and update tray icon accordingly
    const updateTrayByStatus = async () => {
      try {
        const req = http.request({ hostname: '127.0.0.1', port: SERVER_PORT, path: '/api/admin/status', method: 'GET', timeout: 2000 }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const j = JSON.parse(data || '{}');
              const detected = j && j.data && j.data.tokenDetected;
              try { tray.setImage(detected ? greenIcon : redIcon); } catch (e) {}
              tray.setToolTip(detected ? 'Token connected' : 'Token disconnected');
            } catch (e) {
              try { tray.setImage(redIcon); } catch (e2) {}
              tray.setToolTip('Token disconnected');
            }
          });
        });
        req.on('error', () => {
          try { tray.setImage(redIcon); } catch (e) {}
          tray.setToolTip('Token disconnected');
        });
        req.end();
      } catch (e) {
        try { tray.setImage(redIcon); } catch (e2) {}
      }
    };

    // One immediate check, then periodic
    updateTrayByStatus();
    trayStatusInterval = setInterval(updateTrayByStatus, 5000);
  } catch (e) {
    console.warn('[electron] Failed to create tray:', e && e.message);
  }
};

// Ensure the app is set to auto-launch on login when packaged
const ensureAutoLaunch = () => {
  try {
    if (!app.isPackaged) {
      console.log('[electron] Skipping auto-launch (not packaged)');
      process.env.APP_AUTO_START = 'false';
      return;
    }
    const settings = {
      openAtLogin: true,
      path: process.execPath,
      args: [],
    };
    app.setLoginItemSettings(settings);
    const current = app.getLoginItemSettings();
    process.env.APP_AUTO_START = current && current.openAtLogin ? 'true' : 'false';
    console.log('[electron] Auto-launch set:', process.env.APP_AUTO_START);
  } catch (e) {
    console.warn('[electron] Failed to set auto-launch:', e && e.message);
    process.env.APP_AUTO_START = 'false';
  }
};

// IPC handler to save driver path into the user config .env file so it persists across app restarts
ipcMain.handle('save-driver-path', async (_event, driverPath) => {
  try {
    const key = process.platform === 'win32' ? 'PKCS11_LIBRARY_PATH_WINDOWS' : process.platform === 'linux' ? 'PKCS11_LIBRARY_PATH_LINUX' : 'PKCS11_LIBRARY_PATH_DARWIN';
    const genericKey = 'PKCS11_LIBRARY_PATH';
    let content = '';
    if (fs.existsSync(userEnvPath)) content = fs.readFileSync(userEnvPath, 'utf8');

    const setKey = (k, v) => {
      const regex = new RegExp(`^${k}=.*$`, 'm');
      const line = `${k}=${v}`;
      if (regex.test(content)) content = content.replace(regex, line);
      else {
        if (content && !content.endsWith('\n')) content += '\n';
        content += line + '\n';
      }
    };

    setKey(genericKey, driverPath);
    setKey(key, driverPath.replace(/\\/g, '\\\\'));
    fs.writeFileSync(userEnvPath, content, 'utf8');

    // update process.env immediately so server will use it
    process.env[genericKey] = driverPath;
    process.env[key] = driverPath;

    return { success: true };
  } catch (e) {
    return { success: false, error: (e && e.message) || String(e) };
  }
});

app.whenReady().then(async () => {
  try {
    ensureAutoLaunch();
    startServer();
    await waitForServer(SERVER_PORT);
    createWindow();
    // Create tray after window and server are ready
    await createTray();
  } catch (err) {
    console.error('Failed to start server for Electron:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Do not quit the app when windows are closed — keep running in system tray
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  try {
    // allow close handlers to proceed
    isQuiting = true;
    if (trayStatusInterval) clearInterval(trayStatusInterval);
    if (tray) tray.destroy();
  } catch (e) {}
});
