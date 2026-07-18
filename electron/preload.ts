import { contextBridge, ipcRenderer } from 'electron';

import type {
  ApprovalDecision,
  ApprovalRequestView,
  CodevilleBridge,
  ProjectVillageEvent,
} from '../src/shared/village-events';

const bridge: CodevilleBridge = {
  getEnvironment: () => ipcRenderer.invoke('environment:get'),
  selectProject: (slot) => ipcRenderer.invoke('project:select', slot),
  prepareDemoVillage: () => ipcRenderer.invoke('project:demo-village'),
  startSession: (input) => ipcRenderer.invoke('session:start', input),
  interruptSession: (projectId) => ipcRenderer.invoke('session:interrupt', projectId),
  respondToApproval: (requestId: string, decision: ApprovalDecision) =>
    ipcRenderer.invoke('approval:respond', requestId, decision),
  getProgression: () => ipcRenderer.invoke('progression:get'),
  resetProgression: () => ipcRenderer.invoke('progression:reset'),
  onVillageEvent: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, villageEvent: ProjectVillageEvent) => listener(villageEvent);
    ipcRenderer.on('village:event', wrapped);
    return () => ipcRenderer.removeListener('village:event', wrapped);
  },
  onApprovalRequest: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, request: ApprovalRequestView | null) => listener(request);
    ipcRenderer.on('approval:request', wrapped);
    return () => ipcRenderer.removeListener('approval:request', wrapped);
  },
};

contextBridge.exposeInMainWorld('codeville', bridge);
