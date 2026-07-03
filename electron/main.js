import { app, BrowserWindow, dialog } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startServer } from "../src/server.js";

let mainWindow;
let serverHandle;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    const userDataDir = app.getPath("userData");
    const configPath = join(userDataDir, "config.env");
    const dataDir = join(userDataDir, "data");
    const config = loadEnv(configPath);
    const port = Number(config.PORT || 8787);

    serverHandle = await startServer({
      rootDir: app.getAppPath(),
      configPath,
      dataDir,
      port
    });

    createWindow({
      port: serverHandle.port,
      configured: Boolean(config.FEISHU_APP_ID && config.FEISHU_APP_SECRET)
    });
  } catch (error) {
    dialog.showErrorBox("启动失败", error.message || String(error));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverHandle) {
    createWindow({ port: serverHandle.port, configured: true });
  }
});

app.on("before-quit", () => {
  if (serverHandle?.server) {
    serverHandle.server.close();
  }
});

function createWindow({ port, configured }) {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    title: "Feishu Group Broadcast Bot",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const page = configured ? "/" : "/settings.html";
  mainWindow.loadURL(`http://localhost:${port}${page}`);
}

function loadEnv(filePath) {
  if (!existsSync(filePath)) return {};

  const parsed = {};
  const lines = readFileSync(filePath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    parsed[key] = value;
  }
  return parsed;
}
