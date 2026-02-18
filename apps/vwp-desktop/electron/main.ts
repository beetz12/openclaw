import { app, BrowserWindow, dialog, ipcMain } from "electron";
import * as path from "node:path";
import {
  spawnGateway,
  spawnNextServer,
  shutdownAll,
  onProcessCrash,
} from "./process-manager";
import { waitForPort, isPortInUse, killProcessOnPort } from "./port-utils";

const GATEWAY_PORT = 19001;
const NEXT_PORT = 3000;

/**
 * Resolve project root -- in dev: repo root; in packaged: resources/app.
 * In dev, __dirname is apps/vwp-desktop/dist/electron, so go up four levels.
 */
function resolveProjectRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app");
  }
  return path.resolve(__dirname, "..", "..", "..", "..");
}

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Mission Control",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to access node APIs
    },
  });

  void mainWindow.loadURL(`http://localhost:${NEXT_PORT}`);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function startServices(): Promise<void> {
  const projectRoot = resolveProjectRoot();

  // Check for port conflicts before spawning
  for (const port of [GATEWAY_PORT, NEXT_PORT]) {
    if (await isPortInUse(port)) {
      const { response } = await dialog.showMessageBox({
        type: "warning",
        title: "Port Conflict",
        message: `Port ${port} is already in use.`,
        detail: "Would you like to kill the existing process and continue?",
        buttons: ["Kill & Continue", "Quit"],
        defaultId: 0,
      });
      if (response === 0) {
        await killProcessOnPort(port);
      } else {
        app.quit();
        return;
      }
    }
  }

  // Spawn backend services
  spawnGateway(projectRoot);
  spawnNextServer(projectRoot);

  // Register crash handler
  onProcessCrash((name, code) => {
    console.error(`[Mission Control] ${name} crashed with code ${code}`);
    if (mainWindow) {
      dialog.showErrorBox(
        `${name} Crashed`,
        `${name} exited with code ${code}. It will be automatically restarted.`,
      );
    }
  });

  // Wait for both services to be ready
  try {
    await Promise.all([
      waitForPort(GATEWAY_PORT, 30_000),
      waitForPort(NEXT_PORT, 30_000),
    ]);
  } catch (err) {
    dialog.showErrorBox(
      "Startup Failed",
      `Failed to start services: ${err instanceof Error ? err.message : String(err)}`,
    );
    app.quit();
  }
}

// --- IPC Handlers ---

ipcMain.handle("select-project-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Select Project Folder",
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("get-app-info", () => ({
  version: app.getVersion(),
  isPackaged: app.isPackaged,
}));

// --- App Lifecycle ---

void app.whenReady().then(async () => {
  await startServices();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await shutdownAll();
});

process.on("uncaughtException", (err) => {
  console.error("[Mission Control] Uncaught exception:", err);
  dialog.showErrorBox("Unexpected Error", err.message);
});
