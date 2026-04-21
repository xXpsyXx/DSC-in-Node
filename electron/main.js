const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const waitOn = require("wait-on");
const getPort = require("get-port");

let backendProcess;

async function startBackend() {
  const port = await getPort({ port: 3000 });

  const isDev = !app.isPackaged;

  const backendPath = isDev
    ? path.join(__dirname, "../backend/dist/main.js")
    : path.join(process.resourcesPath, "backend/main.js");

  backendProcess = spawn(process.execPath, [backendPath], {
    env: { ...process.env, PORT: port },
  });

  backendProcess.stdout.on("data", (data) => {
    console.log(`Nest: ${data}`);
  });

  backendProcess.stderr.on("data", (data) => {
    console.error(`Nest ERROR: ${data}`);
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
  const port = await startBackend();
  await createWindow(port);
});

app.on("will-quit", () => {
  if (backendProcess) backendProcess.kill();
});
