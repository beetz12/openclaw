import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  selectProjectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("select-project-folder"),
  getAppInfo: (): Promise<{ version: string; isPackaged: boolean }> =>
    ipcRenderer.invoke("get-app-info"),
  isElectron: true as const,
});
