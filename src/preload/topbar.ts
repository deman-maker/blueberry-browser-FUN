import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

// TopBar specific APIs
const topBarAPI = {
  // Tab management
  createTab: (url?: string) =>
    electronAPI.ipcRenderer.invoke("create-tab", url),
  closeTab: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("close-tab", tabId),
  switchTab: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("switch-tab", tabId),
  pinTab: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("pin-tab", tabId),
  unpinTab: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("unpin-tab", tabId),
  togglePinTab: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("toggle-pin-tab", tabId),
  getTabs: () => electronAPI.ipcRenderer.invoke("get-tabs"),

  // Tab navigation
  navigateTab: (tabId: string, url: string) =>
    electronAPI.ipcRenderer.invoke("navigate-tab", tabId, url),
  goBack: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-go-back", tabId),
  goForward: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-go-forward", tabId),
  reload: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-reload", tabId),

  // Tab actions
  tabScreenshot: (tabId: string) =>
    electronAPI.ipcRenderer.invoke("tab-screenshot", tabId),
  tabRunJs: (tabId: string, code: string) =>
    electronAPI.ipcRenderer.invoke("tab-run-js", tabId, code),

  // Tab group management (Firefox-style)
  toggleGroupCollapse: (groupId: string) =>
    electronAPI.ipcRenderer.invoke("toggle-group-collapse", groupId),
  moveTabToGroup: (tabId: string, targetGroupId: string | null) =>
    electronAPI.ipcRenderer.invoke("move-tab-to-group", tabId, targetGroupId),
  reorderTabInGroup: (tabId: string, newIndex: number) =>
    electronAPI.ipcRenderer.invoke("reorder-tab-in-group", tabId, newIndex),
  createTabInGroup: (url: string | undefined, groupId: string) =>
    electronAPI.ipcRenderer.invoke("create-tab-in-group", url, groupId),
  saveAndCloseGroup: (groupId: string) =>
    electronAPI.ipcRenderer.invoke("save-and-close-group", groupId),
  ungroupTabs: (groupId: string) =>
    electronAPI.ipcRenderer.invoke("ungroup-tabs", groupId),
  getAllGroupsWithTabs: () =>
    electronAPI.ipcRenderer.invoke("get-all-groups-with-tabs"),
  getTabGroups: () =>
    electronAPI.ipcRenderer.invoke("get-tab-groups"),
  createGroup: (criteria: { tabIds?: string[]; groupName: string; color?: string }) =>
    electronAPI.ipcRenderer.invoke("create-tab-group", criteria),
  deleteGroup: (groupId: string) =>
    electronAPI.ipcRenderer.invoke("delete-tab-group", groupId),
  moveTabGroup: (groupId: string, newIndex: number) =>
    electronAPI.ipcRenderer.invoke("move-tab-group", groupId, newIndex),
  closeDuplicateTabs: () =>
    electronAPI.ipcRenderer.invoke("close-duplicate-tabs"),
  suggestTabsForGrouping: (seedTabIds: string[], excludeTabIds?: string[]) =>
    electronAPI.ipcRenderer.invoke("suggest-tabs-for-grouping", seedTabIds, excludeTabIds || []),
  suggestMultipleGroups: (excludeTabIds?: string[]) =>
    electronAPI.ipcRenderer.invoke("suggest-multiple-groups", excludeTabIds || []),
  autoGroupTabs: () =>
    electronAPI.ipcRenderer.invoke("auto-group-tabs"),
  organizeTabsByDomain: () =>
    electronAPI.ipcRenderer.invoke("organize-tabs-by-domain"),
  moveTabsToWorkspace: (workspaceId: string, criteria: { tabIds?: string[]; domain?: string; titlePattern?: string }) =>
    electronAPI.ipcRenderer.invoke("move-tabs-to-workspace", workspaceId, criteria),
  pinTabs: (criteria: { tabIds?: string[]; domain?: string; titlePattern?: string; urlPattern?: string; action: "pin" | "unpin" | "toggle" }) =>
    electronAPI.ipcRenderer.invoke("pin-tabs", criteria),

  // Sidebar
  toggleSidebar: () =>
    electronAPI.ipcRenderer.invoke("toggle-sidebar"),

  // Topbar resizing
  expand: () => electronAPI.ipcRenderer.invoke("topbar-expand"),
  collapse: () => electronAPI.ipcRenderer.invoke("topbar-collapse"),

  // Tab commands (AI-powered)
  processTabCommand: (command: string) =>
    electronAPI.ipcRenderer.invoke("process-tab-command", command),
  undoTabCommand: () =>
    electronAPI.ipcRenderer.invoke("undo-tab-command"),

  // Tab update events
  onTabsUpdated: (callback: (tabs: any[]) => void) => {
    electronAPI.ipcRenderer.on("tabs-updated", (_, tabs) => callback(tabs));
  },

  removeTabsUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("tabs-updated");
  },

  // Workspace update events
  onWorkspacesUpdated: (callback: (data: { workspaces: any[]; activeWorkspace: any }) => void) => {
    electronAPI.ipcRenderer.on("workspaces-updated", (_, data) => callback(data));
  },

  removeWorkspacesUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("workspaces-updated");
  },

  // Workspace management
  getWorkspaces: () => electronAPI.ipcRenderer.invoke("get-workspaces"),
  getActiveWorkspace: () => electronAPI.ipcRenderer.invoke("get-active-workspace"),
  createWorkspace: (name: string, color?: string, icon?: string, defaultContainerId?: string) =>
    electronAPI.ipcRenderer.invoke("create-workspace", name, color, icon, defaultContainerId),
  switchWorkspace: (workspaceId: string) =>
    electronAPI.ipcRenderer.invoke("switch-workspace", workspaceId),
  updateWorkspace: (workspaceId: string, updates: { name?: string; color?: string; icon?: string; defaultContainerId?: string }) =>
    electronAPI.ipcRenderer.invoke("update-workspace", workspaceId, updates),
  deleteWorkspace: (workspaceId: string) =>
    electronAPI.ipcRenderer.invoke("delete-workspace", workspaceId),

  // Container management
  getContainers: () => electronAPI.ipcRenderer.invoke("get-containers"),
  createContainer: (name: string, color?: string, icon?: string) =>
    electronAPI.ipcRenderer.invoke("create-container", name, color, icon),
  updateContainer: (containerId: string, updates: { name?: string; color?: string; icon?: string }) =>
    electronAPI.ipcRenderer.invoke("update-container", containerId, updates),
  deleteContainer: (containerId: string) =>
    electronAPI.ipcRenderer.invoke("delete-container", containerId),
  assignContainerToTab: (tabId: string, containerId: string) =>
    electronAPI.ipcRenderer.invoke("assign-container-to-tab", tabId, containerId),

  // Folder management
  getFoldersInWorkspace: (workspaceId: string) =>
    electronAPI.ipcRenderer.invoke("get-folders-in-workspace", workspaceId),
  createFolder: (workspaceId: string, name: string, parentFolderId?: string) =>
    electronAPI.ipcRenderer.invoke("create-folder", workspaceId, name, parentFolderId),
  updateFolder: (folderId: string, updates: { name?: string }) =>
    electronAPI.ipcRenderer.invoke("update-folder", folderId, updates),
  deleteFolder: (folderId: string) =>
    electronAPI.ipcRenderer.invoke("delete-folder", folderId),
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("topBarAPI", topBarAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.topBarAPI = topBarAPI;
}

