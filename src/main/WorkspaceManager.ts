import { Workspace, Container, Folder } from "./Workspace";

/**
 * Manages workspaces, containers, and folders
 */
export class WorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();
  private containers: Map<string, Container> = new Map();
  private folders: Map<string, Folder> = new Map();
  private activeWorkspaceId: string | null = null;
  private workspaceCounter: number = 0;
  private containerCounter: number = 0;
  private folderCounter: number = 0;
  
  // Performance optimization: Reverse indices for O(1) lookups
  private tabToWorkspaceMap: Map<string, string> = new Map(); // tabId -> workspaceId
  private tabToFolderMap: Map<string, string> = new Map(); // tabId -> folderId

  constructor() {
    // Create default workspace
    this.createWorkspace("Default", "blue");
    this.activeWorkspaceId = Array.from(this.workspaces.keys())[0];

    // Create default container
    this.createContainer("Default", "blue");
  }

  // ============================================================================
  // Workspace Management
  // ============================================================================

  createWorkspace(
    name: string,
    color?: string,
    icon?: string,
    defaultContainerId?: string
  ): string {
    const workspaceId = `workspace-${++this.workspaceCounter}`;
    const workspace: Workspace = {
      id: workspaceId,
      name,
      icon,
      color: color || "blue",
      tabIds: [],
      defaultContainerId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.workspaces.set(workspaceId, workspace);
    return workspaceId;
  }

  getWorkspace(workspaceId: string): Workspace | null {
    return this.workspaces.get(workspaceId) || null;
  }

  getAllWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values());
  }

  getActiveWorkspace(): Workspace | null {
    if (!this.activeWorkspaceId) return null;
    return this.workspaces.get(this.activeWorkspaceId) || null;
  }

  getActiveWorkspaceId(): string | null {
    return this.activeWorkspaceId;
  }

  switchWorkspace(workspaceId: string): boolean {
    if (!this.workspaces.has(workspaceId)) return false;
    this.activeWorkspaceId = workspaceId;
    return true;
  }

  updateWorkspace(
    workspaceId: string,
    updates: {
      name?: string;
      icon?: string;
      color?: string;
      defaultContainerId?: string;
    }
  ): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    if (updates.name !== undefined) workspace.name = updates.name;
    if (updates.icon !== undefined) workspace.icon = updates.icon;
    if (updates.color !== undefined) workspace.color = updates.color;
    if (updates.defaultContainerId !== undefined)
      workspace.defaultContainerId = updates.defaultContainerId;

    workspace.updatedAt = Date.now();
    return true;
  }

  deleteWorkspace(workspaceId: string): boolean {
    if (this.workspaces.size <= 1) return false; // Can't delete last workspace
    if (this.activeWorkspaceId === workspaceId) {
      // Switch to another workspace
      const otherWorkspace = Array.from(this.workspaces.keys()).find(
        (id) => id !== workspaceId
      );
      if (otherWorkspace) this.activeWorkspaceId = otherWorkspace;
    }
    return this.workspaces.delete(workspaceId);
  }

  addTabToWorkspace(workspaceId: string, tabId: string): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;
    const workspaceTabIdsSet = new Set(workspace.tabIds); // Use Set for O(1) lookup
    if (!workspaceTabIdsSet.has(tabId)) {
      workspace.tabIds.push(tabId);
      workspace.updatedAt = Date.now();
      // Update reverse index
      this.tabToWorkspaceMap.set(tabId, workspaceId);
    }
    return true;
  }

  removeTabFromWorkspace(workspaceId: string, tabId: string): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;
    
    // Optimized: Use reverse index to check if tab is in this workspace
    if (this.tabToWorkspaceMap.get(tabId) === workspaceId) {
      const index = workspace.tabIds.indexOf(tabId);
      if (index !== -1) {
        workspace.tabIds.splice(index, 1);
        workspace.updatedAt = Date.now();
        this.tabToWorkspaceMap.delete(tabId);
      }
    }
    return true;
  }

  getWorkspaceForTab(tabId: string): Workspace | null {
    // Optimized with reverse index - O(1) instead of O(n×m)
    const workspaceId = this.tabToWorkspaceMap.get(tabId);
    if (!workspaceId) return null;
    return this.workspaces.get(workspaceId) || null;
  }

  // ============================================================================
  // Container Management
  // ============================================================================

  createContainer(name: string, color?: string, icon?: string): string {
    const containerId = `container-${++this.containerCounter}`;
    const partition = `persist:container-${containerId}`;
    const container: Container = {
      id: containerId,
      name,
      color: color || "blue",
      icon,
      partition,
      createdAt: Date.now(),
    };

    this.containers.set(containerId, container);
    return containerId;
  }

  getContainer(containerId: string): Container | null {
    return this.containers.get(containerId) || null;
  }

  getAllContainers(): Container[] {
    return Array.from(this.containers.values());
  }

  updateContainer(
    containerId: string,
    updates: { name?: string; color?: string; icon?: string }
  ): boolean {
    const container = this.containers.get(containerId);
    if (!container) return false;

    if (updates.name !== undefined) container.name = updates.name;
    if (updates.color !== undefined) container.color = updates.color;
    if (updates.icon !== undefined) container.icon = updates.icon;

    return true;
  }

  deleteContainer(containerId: string): boolean {
    // Don't allow deleting the default container
    const container = this.containers.get(containerId);
    if (container && container.partition.includes("container-1")) {
      return false;
    }
    return this.containers.delete(containerId);
  }

  getContainerPartition(containerId: string): string | null {
    const container = this.containers.get(containerId);
    return container ? container.partition : null;
  }

  // ============================================================================
  // Folder Management
  // ============================================================================

  createFolder(
    workspaceId: string,
    name: string,
    parentFolderId?: string
  ): string {
    if (!this.workspaces.has(workspaceId)) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const folderId = `folder-${++this.folderCounter}`;
    const folder: Folder = {
      id: folderId,
      name,
      workspaceId,
      tabIds: [],
      parentFolderId,
      createdAt: Date.now(),
    };

    this.folders.set(folderId, folder);
    return folderId;
  }

  getFolder(folderId: string): Folder | null {
    return this.folders.get(folderId) || null;
  }

  getFoldersInWorkspace(workspaceId: string): Folder[] {
    return Array.from(this.folders.values()).filter(
      (f) => f.workspaceId === workspaceId
    );
  }

  updateFolder(folderId: string, updates: { name?: string }): boolean {
    const folder = this.folders.get(folderId);
    if (!folder) return false;

    if (updates.name !== undefined) folder.name = updates.name;
    return true;
  }

  deleteFolder(folderId: string): boolean {
    return this.folders.delete(folderId);
  }

  addTabToFolder(folderId: string, tabId: string): boolean {
    const folder = this.folders.get(folderId);
    if (!folder) return false;
    const folderTabIdsSet = new Set(folder.tabIds); // Use Set for O(1) lookup
    if (!folderTabIdsSet.has(tabId)) {
      folder.tabIds.push(tabId);
      // Update reverse index
      this.tabToFolderMap.set(tabId, folderId);
    }
    return true;
  }

  removeTabFromFolder(folderId: string, tabId: string): boolean {
    const folder = this.folders.get(folderId);
    if (!folder) return false;
    
    // Optimized: Use reverse index to check if tab is in this folder
    if (this.tabToFolderMap.get(tabId) === folderId) {
      const index = folder.tabIds.indexOf(tabId);
      if (index !== -1) {
        folder.tabIds.splice(index, 1);
        this.tabToFolderMap.delete(tabId);
      }
    }
    return true;
  }

  getFolderForTab(tabId: string): Folder | null {
    // Optimized with reverse index - O(1) instead of O(n×m)
    const folderId = this.tabToFolderMap.get(tabId);
    if (!folderId) return null;
    return this.folders.get(folderId) || null;
  }
}

