const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");

const PORT = 4317;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TITLEBAR_HEIGHT = 68;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const STANDALONE_DIR = path.join(__dirname, "..", ".next", "standalone");
const SERVER_ENTRY = path.join(STANDALONE_DIR, "server.js");

let mainWindow = null;
let serverProcess = null;

function startServer() {
  if (!fs.existsSync(SERVER_ENTRY)) {
    throw new Error(
      `Build not found at ${SERVER_ENTRY}. Run "npm run build:electron" first.`,
    );
  }
  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: STANDALONE_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: "inherit",
  });
  serverProcess.on("exit", () => {
    serverProcess = null;
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        })
        .on("error", retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server at ${url} did not become ready in time`));
        return;
      }
      setTimeout(attempt, 200);
    };
    attempt();
  });
}

async function createWindow() {
  startServer();
  await waitForServer(`${ORIGIN}/api/health`);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 500,
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#0c0e0d",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0c0e0d",
      symbolColor: "#e8e7df",
      height: TITLEBAR_HEIGHT,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`${ORIGIN}/`)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(
        permission === "clipboard-read" ||
          permission === "clipboard-sanitized-write",
      );
    },
  );

  mainWindow.webContents.session.on("will-download", (_event, item) => {
    item.setSavePath(path.join(app.getPath("downloads"), item.getFilename()));
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`${ORIGIN}/`);
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle("titlebar:set-colors", (event, colors) => {
    if (process.platform === "darwin") return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (
      !win ||
      !colors ||
      !HEX_COLOR.test(colors.color) ||
      !HEX_COLOR.test(colors.symbolColor)
    ) {
      return;
    }
    try {
      win.setTitleBarOverlay({
        color: colors.color,
        symbolColor: colors.symbolColor,
        height: TITLEBAR_HEIGHT,
      });
    } catch {
      // Overlay recoloring is best-effort.
    }
  });

  app.whenReady().then(async () => {
    try {
      await createWindow();
    } catch (err) {
      console.error(err.message);
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    stopServer();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", stopServer);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
