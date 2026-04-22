const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const waitOn = require("wait-on");
const getPort = require("get-port");

let backendProcess;

// logger: in dev use console, in packaged builds we'll replace with file logger
let logger = {
  info: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
};

async function startBackend() {
  const port = await getPort({ port: 3000 });

  const isDev = !app.isPackaged;

  const backendPath = isDev
    ? path.join(__dirname, "../backend/dist/main.js")
    : path.join(process.resourcesPath, "backend/main.js");

  const spawnOptions = {
    env: { ...process.env, PORT: port },
  };

  // In packaged builds avoid piping child stdio to the main process (no console)
  if (!isDev) spawnOptions.stdio = "ignore";

  backendProcess = spawn(process.execPath, [backendPath], spawnOptions);

  // Only attach stdout/stderr listeners in dev where console is available
  if (isDev) {
    backendProcess.stdout && backendProcess.stdout.on("data", (data) => {
      logger.info(`Nest: ${data.toString()}`);
    });

    backendProcess.stdout && backendProcess.stdout.on("error", (err) => {
      if (!err || err.code !== "EPIPE") logger.error(`Nest stdout error: ${err}`);
    });

    backendProcess.stderr && backendProcess.stderr.on("data", (data) => {
      logger.error(`Nest ERROR: ${data.toString()}`);
    });

    backendProcess.stderr && backendProcess.stderr.on("error", (err) => {
      if (!err || err.code !== "EPIPE") logger.error(`Nest stderr error: ${err}`);
    });
  }

  backendProcess.on("exit", (code, signal) => {
    logger.info(`Backend exited${code !== null ? ` code=${code}` : ""}${signal ? ` signal=${signal}` : ""}`);
    backendProcess = null;
  });

  backendProcess.on("error", (err) => {
    logger.error(`Backend process error: ${err}`);
  });

  // wait for backend
  await waitOn({
    resources: [`http://localhost:${port}/health`],
    timeout: 15000,
  });

  return port;
}

async function createWindow(port) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: false,
    },
  });

  // inject API URL
  win.webContents.executeJavaScript(`
    window.API_URL = "http://localhost:${port}";
  `);

  const isDev = !app.isPackaged;

  const indexPath = isDev
    ? path.join(__dirname, "../frontend/dist/frontend/index.html")
    : path.join(process.resourcesPath, "frontend/index.html");

  await win.loadFile(indexPath);
}

app.whenReady().then(async () => {
  // in packaged builds write logs to a file under userData to avoid stdout/stderr EPIPE
  if (app.isPackaged) {
    const logFile = path.join(app.getPath("userData"), "main.log");
    logger = {
      info: (...args) => fs.appendFile(logFile, args.map(String).join(" ") + "\n", () => {}),
      error: (...args) => fs.appendFile(logFile, "ERROR: " + args.map(String).join(" ") + "\n", () => {}),
    };
  }

  const port = await startBackend();
  await createWindow(port);
});

app.on("before-quit", () => {
  if (backendProcess) {
    // send SIGINT so the backend can run graceful shutdown handlers
    backendProcess.kill("SIGINT");
    backendProcess = null;
  }
});
