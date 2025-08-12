import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File system operations
  showSaveDialog: (options: Electron.SaveDialogOptions) => 
    ipcRenderer.invoke('show-save-dialog', options),
  
  showOpenDialog: (options: Electron.OpenDialogOptions) => 
    ipcRenderer.invoke('show-open-dialog', options),
  
  showMessageBox: (options: Electron.MessageBoxOptions) => 
    ipcRenderer.invoke('show-message-box', options),

  // App information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: (name: string) => ipcRenderer.invoke('get-app-path', name),

  // Menu event listeners
  onMenuNewAssessment: (callback: () => void) => {
    ipcRenderer.on('menu-new-assessment', callback);
    return () => ipcRenderer.removeListener('menu-new-assessment', callback);
  },

  onMenuOpenAssessment: (callback: () => void) => {
    ipcRenderer.on('menu-open-assessment', callback);
    return () => ipcRenderer.removeListener('menu-open-assessment', callback);
  },

  onMenuImportDocuments: (callback: () => void) => {
    ipcRenderer.on('menu-import-documents', callback);
    return () => ipcRenderer.removeListener('menu-import-documents', callback);
  },

  onMenuAdvanceState: (callback: () => void) => {
    ipcRenderer.on('menu-advance-state', callback);
    return () => ipcRenderer.removeListener('menu-advance-state', callback);
  },

  onMenuGenerateReport: (callback: () => void) => {
    ipcRenderer.on('menu-generate-report', callback);
    return () => ipcRenderer.removeListener('menu-generate-report', callback);
  },

  // Platform information
  platform: process.platform,
  isElectron: true
});

// Type definitions for the exposed API
export interface ElectronAPI {
  showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
  showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
  showMessageBox: (options: Electron.MessageBoxOptions) => Promise<Electron.MessageBoxReturnValue>;
  getAppVersion: () => Promise<string>;
  getAppPath: (name: string) => Promise<string>;
  onMenuNewAssessment: (callback: () => void) => () => void;
  onMenuOpenAssessment: (callback: () => void) => () => void;
  onMenuImportDocuments: (callback: () => void) => () => void;
  onMenuAdvanceState: (callback: () => void) => () => void;
  onMenuGenerateReport: (callback: () => void) => () => void;
  platform: string;
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
