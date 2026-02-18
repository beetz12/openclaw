/**
 * Type declarations for the Electron preload API.
 * When running in the Electron shell, window.electronAPI is available.
 * In browser mode, it is undefined.
 */
interface ElectronAPI {
  /** Open native folder picker dialog */
  selectProjectFolder: () => Promise<string | null>;
  /** Get app version and packaging info */
  getAppInfo: () => Promise<{ version: string; isPackaged: boolean }>;
  /** Always true when running in Electron */
  isElectron: true;
}

interface Window {
  electronAPI?: ElectronAPI;
}
