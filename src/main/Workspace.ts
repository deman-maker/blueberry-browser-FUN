/**
 * Workspace: Organizes tabs into distinct project/task contexts
 * Provides visual and organizational isolation, but shares session data
 */
export interface Workspace {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  tabIds: string[];
  defaultContainerId?: string; // Optional default container for this workspace
  createdAt: number;
  updatedAt: number;
}

/**
 * Container: Provides session-level isolation (cookies, storage, cache)
 * Enables multiple simultaneous logins to the same sites
 */
export interface Container {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  // Session partition identifier for Electron
  partition: string;
  createdAt: number;
}

/**
 * Folder: Hierarchical grouping within a workspace
 * Visual/organizational subgroup for better tab management
 */
export interface Folder {
  id: string;
  name: string;
  workspaceId: string;
  tabIds: string[];
  parentFolderId?: string; // For nested folders
  createdAt: number;
}

