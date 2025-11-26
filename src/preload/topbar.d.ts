import { ElectronAPI } from "@electron-toolkit/preload";

interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
  isPinned?: boolean;
  groupId?: string;
  groupName?: string;
  groupColor?: string;
  groupTabCount?: number;
  containerId?: string;
  containerName?: string;
  containerColor?: string;
}

interface TopBarAPI {
  // Tab management
  createTab: (
    url?: string
  ) => Promise<{ id: string; title: string; url: string } | null>;
  closeTab: (tabId: string) => Promise<boolean>;
  switchTab: (tabId: string) => Promise<boolean>;
  pinTab: (tabId: string) => Promise<boolean>;
  unpinTab: (tabId: string) => Promise<boolean>;
  togglePinTab: (tabId: string) => Promise<boolean>;
  getTabs: () => Promise<TabInfo[]>;

  // Tab navigation
  navigateTab: (tabId: string, url: string) => Promise<void>;
  goBack: (tabId: string) => Promise<void>;
  goForward: (tabId: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;

  // Tab actions
  tabScreenshot: (tabId: string) => Promise<string | null>;
  tabRunJs: (tabId: string, code: string) => Promise<any>;

  // Sidebar
  toggleSidebar: () => Promise<void>;

  // Topbar resizing
  expand: () => Promise<void>;
  collapse: () => Promise<void>;

  // Tab commands (AI-powered)
  processTabCommand: (command: string) => Promise<{
    success: boolean;
    message: string;
    actionSummary?: string;
    undoableAction?: any;
  }>;
  undoTabCommand: () => Promise<{
    success: boolean;
    message: string;
  }>;

  // Tab update events
  onTabsUpdated: (callback: (tabs: TabInfo[]) => void) => void;
  removeTabsUpdatedListener: () => void;

  // AI-powered tab grouping
  suggestTabsForGrouping: (seedTabIds: string[], excludeTabIds?: string[]) => Promise<{ suggestedTabIds: string[]; groupName?: string }>;
  suggestMultipleGroups: (excludeTabIds?: string[]) => Promise<Array<{ groupName: string; tabIds: string[]; confidence: number }>>;
  autoGroupTabs: () => Promise<{ groupsCreated: number }>;
  organizeTabsByDomain: () => Promise<{ createdGroups: number; groups: Array<{ groupId: string; domain: string; tabCount: number }> }>;
  moveTabsToWorkspace: (workspaceId: string, criteria: { tabIds?: string[]; domain?: string; titlePattern?: string }) => Promise<{ movedCount: number }>;
  pinTabs: (criteria: { tabIds?: string[]; domain?: string; titlePattern?: string; urlPattern?: string; action: "pin" | "unpin" | "toggle" }) => Promise<{ pinnedCount: number; unpinnedCount: number; affectedTabIds: string[] }>;
  getAllGroupsWithTabs: () => Promise<Array<{
    id: string;
    name: string;
    color: string;
    collapsed: boolean;
    tabs: Array<{ id: string; title: string; url: string }>;
  }>>;

  // Workspace update events
  onWorkspacesUpdated: (callback: (data: { workspaces: any[]; activeWorkspace: any }) => void) => void;
  removeWorkspacesUpdatedListener: () => void;

  // Workspace management
  getWorkspaces: () => Promise<any[]>;
  getActiveWorkspace: () => Promise<any>;
  createWorkspace: (name: string, color?: string, icon?: string, defaultContainerId?: string) => Promise<{ workspaceId: string }>;
  switchWorkspace: (workspaceId: string) => Promise<boolean>;
  updateWorkspace: (workspaceId: string, updates: { name?: string; color?: string; icon?: string; defaultContainerId?: string }) => Promise<boolean>;
  deleteWorkspace: (workspaceId: string) => Promise<boolean>;

  // Container management
  getContainers: () => Promise<any[]>;
  createContainer: (name: string, color?: string, icon?: string) => Promise<{ containerId: string }>;
  updateContainer: (containerId: string, updates: { name?: string; color?: string; icon?: string }) => Promise<boolean>;
  deleteContainer: (containerId: string) => Promise<boolean>;
  assignContainerToTab: (tabId: string, containerId: string) => Promise<boolean>;

  // Tab Group management
  createGroup: (criteria: { tabIds?: string[]; groupName: string; color?: string }) => Promise<string>;
  toggleGroupCollapse: (groupId: string) => Promise<boolean>;
  moveTabToGroup: (tabId: string, targetGroupId: string | null) => Promise<boolean>;
  reorderTabInGroup: (tabId: string, newIndex: number) => Promise<boolean>;
  createTabInGroup: (url: string | undefined, groupId: string) => Promise<void>;
  saveAndCloseGroup: (groupId: string) => Promise<void>;
  ungroupTabs: (groupId: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  moveTabGroup: (groupId: string, newIndex: number) => Promise<boolean>;
  getTabs: () => Promise<any[]>;
  closeDuplicateTabs: () => Promise<number>;
  getTabGroups: () => Promise<Array<{ id: string; name: string; color: string; tabCount: number; collapsed: boolean }>>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    topBarAPI: TopBarAPI;
  }
}

