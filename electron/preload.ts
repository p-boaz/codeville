import { contextBridge, ipcRenderer } from 'electron';

import type {
  ApprovalDecision,
  ApprovalRequestView,
  CodevilleBridge,
  ProjectVillageEvent,
  InputRequestUpdate,
} from '../src/shared/village-events';

const bridge: CodevilleBridge = {
  getEnvironment: () => ipcRenderer.invoke('environment:get'),
  selectProject: (slot) => ipcRenderer.invoke('project:select', slot),
  prepareDemoVillage: () => ipcRenderer.invoke('project:demo-village'),
  startSession: (input) => ipcRenderer.invoke('session:start', input),
  interruptSession: (projectId) => ipcRenderer.invoke('session:interrupt', projectId),
  respondToApproval: (requestId: string, decision: ApprovalDecision) =>
    ipcRenderer.invoke('approval:respond', requestId, decision),
  respondToInput: (projectId, requestId, answers) => ipcRenderer.invoke('input:respond', projectId, requestId, answers),
  continueSession: (projectId, reply) => ipcRenderer.invoke('session:continue', projectId, reply),
  getConnectionProof: (projectId) => ipcRenderer.invoke('connection:proof', projectId),
  handoffToGhostty: (projectId) => ipcRenderer.invoke('session:handoff', projectId),
  reclaimFromGhostty: (projectId) => ipcRenderer.invoke('session:reclaim', projectId),
  getPendingScaffold: (projectId) => ipcRenderer.invoke('scaffold:pending', projectId),
  getSessionDiff: (projectId) => ipcRenderer.invoke('scaffold:diff', projectId),
  applySession: (projectId) => ipcRenderer.invoke('scaffold:apply', projectId),
  keepSession: (projectId) => ipcRenderer.invoke('scaffold:keep', projectId),
  discardSession: (projectId) => ipcRenderer.invoke('scaffold:discard', projectId),
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
  onInputRequest: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, update: InputRequestUpdate) => listener(update);
    ipcRenderer.on('input:request', wrapped);
    return () => ipcRenderer.removeListener('input:request', wrapped);
  },
  onFocusProject: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, projectId: string) => listener(projectId);
    ipcRenderer.on('village:focus-project', wrapped);
    return () => ipcRenderer.removeListener('village:focus-project', wrapped);
  },
};

contextBridge.exposeInMainWorld('codeville', bridge);
