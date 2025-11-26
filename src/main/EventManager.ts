
import { ipcMain, WebContents } from "electron";
import type { Window } from "./Window";
import { TabCommandService } from "./TabCommandService";

export class EventManager {
  private mainWindow: Window;
  private tabCommandService: TabCommandService;

  constructor(mainWindow: Window) {
    this.mainWindow = mainWindow;
    this.tabCommandService = new TabCommandService(mainWindow);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Tab management events
    this.handleTabEvents();

    // Tab command events (AI-powered)
    this.handleTabCommandEvents();

    // Sidebar events
    this.handleSidebarEvents();

    // Page content events
    this.handlePageContentEvents();

    // Dark mode events
    this.handleDarkModeEvents();

    // Debug events
    this.handleDebugEvents();

    // Workspace & Container events
    this.handleWorkspaceEvents();
    this.handleContainerEvents();
    this.handleFolderEvents();

    // Topbar events
    this.handleTopbarEvents();
  }

  private handleTopbarEvents(): void {
    ipcMain.handle("topbar-expand", () => {
      this.mainWindow.topBar.expand();
      return true;
    });

    ipcMain.handle("topbar-collapse", () => {
      this.mainWindow.topBar.collapse();
      return true;
    });
  }

  private handleTabEvents(): void {
    // Create new tab
    ipcMain.handle("create-tab", (_, url?: string) => {
      const newTab = this.mainWindow.createTab(url);
      return { id: newTab.id, title: newTab.title, url: newTab.url };
    });

    // Close tab
    ipcMain.handle("close-tab", (_, id: string) => {
      this.mainWindow.closeTab(id);
    });

    // Switch tab
    ipcMain.handle("switch-tab", (_, id: string) => {
      this.mainWindow.switchActiveTab(id);
    });

    // Get tabs
    ipcMain.handle("get-tabs", () => {
      const activeTabId = this.mainWindow.activeTab?.id;
      // Sort tabs: pinned first, then grouped tabs together
      const sortedTabs = Array.from(this.mainWindow.allTabs).sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;

        const groupA = this.mainWindow.getTabGroupForTab(a.id);
        const groupB = this.mainWindow.getTabGroupForTab(b.id);

        if (groupA && !groupB) return -1;
        if (!groupA && groupB) return 1;

        if (groupA && groupB) {
          if (groupA.id === groupB.id) {
            const indexA = groupA.tabIds.indexOf(a.id);
            const indexB = groupB.tabIds.indexOf(b.id);
            return indexA - indexB;
          }
          return groupA.id.localeCompare(groupB.id);
        }

        return 0;
      });
      return sortedTabs.map((tab) => {
        const group = this.mainWindow.getTabGroupForTab(tab.id);
        const workspaceManager = this.mainWindow.workspaceManagerInstance;
        const container = tab.containerId
          ? workspaceManager.getContainer(tab.containerId)
          : null;
        return {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          isActive: activeTabId === tab.id,
          isPinned: tab.pinned,
          groupId: group?.id,
          groupName: group?.name,
          groupColor: group?.color || "blue",
          groupTabCount: group ? group.tabIds.length : 0,
          containerId: tab.containerId,
          containerName: container?.name,
          containerColor: container?.color,
        };
      });
    });

    // Pin tab
    ipcMain.handle("pin-tab", (_, id: string) => {
      return this.mainWindow.pinTab(id);
    });

    // Unpin tab
    ipcMain.handle("unpin-tab", (_, id: string) => {
      return this.mainWindow.unpinTab(id);
    });

    // Toggle pin tab
    ipcMain.handle("toggle-pin-tab", (_, id: string) => {
      return this.mainWindow.togglePinTab(id);
    });

    // Navigation (for compatibility with existing code)
    ipcMain.handle("navigate-to", (_, url: string) => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.loadURL(url);
      }
    });

    ipcMain.handle("navigate-tab", async (_, tabId: string, url: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        await tab.loadURL(url);
        return true;
      }
      return false;
    });

    ipcMain.handle("go-back", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goBack();
      }
    });

    ipcMain.handle("go-forward", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.goForward();
      }
    });

    ipcMain.handle("reload", () => {
      if (this.mainWindow.activeTab) {
        this.mainWindow.activeTab.reload();
      }
    });

    // Tab-specific navigation handlers
    ipcMain.handle("tab-go-back", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goBack();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-go-forward", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.goForward();
        return true;
      }
      return false;
    });

    ipcMain.handle("tab-reload", (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        tab.reload();
        return true;
      }
      return false;
    });

    // Tab group management
    ipcMain.handle("toggle-group-collapse", (_, groupId: string) => {
      return this.mainWindow.toggleGroupCollapse(groupId);
    });

    ipcMain.handle("move-tab-to-group", (_, tabId: string, targetGroupId: string | null) => {
      return this.mainWindow.moveTabToGroup(tabId, targetGroupId);
    });

    ipcMain.handle("reorder-tab-in-group", (_, tabId: string, newIndex: number) => {
      return this.mainWindow.moveTabInGroup(tabId, newIndex);
    });

    ipcMain.handle("create-tab-in-group", (_, url: string | undefined, groupId: string) => {
      const tab = this.mainWindow.createTabInGroup(url, groupId);
      return { id: tab.id, title: tab.title, url: tab.url };
    });

    ipcMain.handle("save-and-close-group", (_, groupId: string) => {
      return this.mainWindow.saveAndCloseGroup(groupId);
    });

    ipcMain.handle("ungroup-tabs", (_, groupId: string) => {
      return this.mainWindow.ungroupTabs(groupId);
    });

    ipcMain.handle("get-all-groups-with-tabs", () => {
      return this.mainWindow.getAllGroupsWithTabs();
    });

    ipcMain.handle("get-tab-groups", () => {
      return this.mainWindow.allTabGroups.map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color || "blue",
        tabCount: group.tabIds.length,
        collapsed: group.collapsed ?? false,
      }));
    });

    ipcMain.handle("create-tab-group", (_, criteria: { tabIds?: string[]; groupName: string; color?: string }) => {
      if (!criteria.tabIds || criteria.tabIds.length === 0) {
        throw new Error("No tabs provided for group creation");
      }
      const groupId = this.mainWindow.createTabGroup(criteria.tabIds, criteria.groupName, criteria.color);
      return { groupId, tabCount: criteria.tabIds.length };
    });

    ipcMain.handle("delete-tab-group", (_, groupId: string) => {
      return this.mainWindow.deleteTabGroup(groupId);
    });

    ipcMain.handle("move-tab-group", (_, groupId: string, newIndex: number) => {
      return this.mainWindow.moveTabGroup(groupId, newIndex);
    });

    ipcMain.handle("close-duplicate-tabs", () => {
      return this.mainWindow.closeDuplicateTabs();
    });

    // Suggest tabs for grouping (AI-powered)
    ipcMain.handle("suggest-tabs-for-grouping", async (_, seedTabIds: string[], excludeTabIds: string[] = []) => {
      const { TabManagementAPI } = await import("./TabManagementAPI");
      const tabManagementAPI = new TabManagementAPI(this.mainWindow);
      return await tabManagementAPI.suggestTabsForGrouping(seedTabIds, excludeTabIds);
    });

    // Suggest multiple groups automatically
    ipcMain.handle("suggest-multiple-groups", async (_, excludeTabIds: string[] = []) => {
      const { TabManagementAPI } = await import("./TabManagementAPI");
      const tabManagementAPI = new TabManagementAPI(this.mainWindow);
      return await tabManagementAPI.suggestMultipleGroups(excludeTabIds);
    });

    // Auto-group tabs using AI (manual trigger)
    ipcMain.handle("auto-group-tabs", async () => {
      return await this.mainWindow.triggerManualAutoGrouping();
    });

    // Organize tabs by domain
    ipcMain.handle("organize-tabs-by-domain", async () => {
      const api = this.mainWindow.tabManagementAPIInstance;
      return await api.organizeTabsByDomain();
    });

    // Move tabs to workspace
    ipcMain.handle("move-tabs-to-workspace", async (_, workspaceId: string, criteria: {
      tabIds?: string[];
      domain?: string;
      titlePattern?: string;
    }) => {
      const api = this.mainWindow.tabManagementAPIInstance;
      return await api.moveTabsToWorkspace(workspaceId, criteria);
    });

    // Pin tabs
    ipcMain.handle("pin-tabs", async (_, criteria: {
      tabIds?: string[];
      domain?: string;
      titlePattern?: string;
      urlPattern?: string;
      action: "pin" | "unpin" | "toggle";
    }) => {
      const api = this.mainWindow.tabManagementAPIInstance;
      return await api.pinTabs(criteria);
    });

    ipcMain.handle("tab-screenshot", async (_, tabId: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        const image = await tab.screenshot();
        return image.toDataURL();
      }
      return null;
    });

    ipcMain.handle("tab-run-js", async (_, tabId: string, code: string) => {
      const tab = this.mainWindow.getTab(tabId);
      if (tab) {
        return await tab.runJs(code);
      }
      return null;
    });

    // Tab info
    ipcMain.handle("get-active-tab-info", () => {
      const activeTab = this.mainWindow.activeTab;
      if (activeTab) {
        return {
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title,
          canGoBack: activeTab.webContents.canGoBack(),
          canGoForward: activeTab.webContents.canGoForward(),
        };
      }
      return null;
    });
  }

  private handleTabCommandEvents(): void {
    // Process natural language tab command
    ipcMain.handle("process-tab-command", async (_, command: string) => {
      try {
        const result = await this.tabCommandService.processCommand(command);
        return result;
      } catch (error) {
        console.error("Error processing tab command:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    });

    // Undo last action
    ipcMain.handle("undo-tab-command", async () => {
      try {
        const result = this.tabCommandService.undoLastAction();
        return result;
      } catch (error) {
        console.error("Error undoing tab command:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    });
  }

  private handleSidebarEvents(): void {
    // Toggle sidebar
    ipcMain.handle("toggle-sidebar", () => {
      this.mainWindow.sidebar.toggle();
      this.mainWindow.updateAllBounds();
      return true;
    });

    // Chat message
    ipcMain.handle("sidebar-chat-message", async (_, request) => {
      try {
        const activeTab = this.mainWindow.activeTab;
        if (!activeTab) {
          console.error("No active tab available for chat message");
          return;
        }

        // Get screenshot and page text from active tab
        const screenshot = await activeTab.screenshot();
        const screenshotDataUrl = screenshot.toDataURL();
        const pageText = await activeTab.getTabText().catch(() => "");

        // Send message to LLM client with context
        await this.mainWindow.sidebar.client.sendChatMessage(
          request,
          screenshotDataUrl,
          pageText || ""
        );
      } catch (error) {
        console.error("Error handling chat message:", error);
      }
    });

    // Clear chat
    ipcMain.handle("sidebar-clear-chat", () => {
      this.mainWindow.sidebar.client.clearMessages();
      return true;
    });

    // Get messages
    ipcMain.handle("sidebar-get-messages", () => {
      return this.mainWindow.sidebar.client.getMessages();
    });

    // Get routing metrics
    ipcMain.handle("get-routing-metrics", () => {
      return this.mainWindow.tabManagementAPIInstance.getRoutingMetrics();
    });

    // Get device capabilities
    ipcMain.handle("get-device-capabilities", async () => {
      return await this.mainWindow.tabManagementAPIInstance.getDeviceCapabilities();
    });

    // Process intelligent query (for testing/demo)
    ipcMain.handle("process-intelligent-query", async (_, query: string) => {
      return await this.mainWindow.tabManagementAPIInstance.processIntelligentQuery(query);
    });

    // Get all tabs (for cognitive load dashboard)
    ipcMain.handle("get-all-tabs", () => {
      return this.mainWindow.allTabs.map(tab => {
        const group = this.mainWindow.getTabGroupForTab(tab.id);
        return {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          domain: tab.domain,
          groupId: group?.id || undefined
        };
      });
    });
  }

  private handlePageContentEvents(): void {
    // Get page content
    ipcMain.handle("get-page-content", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabHtml();
        } catch (error) {
          console.error("Error getting page content:", error);
          return null;
        }
      }
      return null;
    });

    // Get page text
    ipcMain.handle("get-page-text", async () => {
      if (this.mainWindow.activeTab) {
        try {
          return await this.mainWindow.activeTab.getTabText();
        } catch (error) {
          console.error("Error getting page text:", error);
          return null;
        }
      }
      return null;
    });

    // Get current URL
    ipcMain.handle("get-current-url", () => {
      if (this.mainWindow.activeTab) {
        return this.mainWindow.activeTab.url;
      }
      return null;
    });
  }

  private handleDarkModeEvents(): void {
    // Dark mode broadcasting
    ipcMain.on("dark-mode-changed", (event, isDarkMode) => {
      this.broadcastDarkMode(event.sender, isDarkMode);
    });
  }

  // ============================================================================
  // Workspace Management Events
  // ============================================================================

  private handleWorkspaceEvents(): void {
    // Get all workspaces
    ipcMain.handle("get-workspaces", () => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      // Transform to match UI expectations (tabCount instead of tabIds)
      return workspaceManager.getAllWorkspaces().map((ws) => ({
        id: ws.id,
        name: ws.name,
        icon: ws.icon,
        color: ws.color,
        tabCount: ws.tabIds.length,
        defaultContainerId: ws.defaultContainerId,
      }));
    });

    // Get active workspace
    ipcMain.handle("get-active-workspace", () => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      const workspace = workspaceManager.getActiveWorkspace();
      if (!workspace) return null;
      // Transform to match UI expectations (tabCount instead of tabIds)
      return {
        id: workspace.id,
        name: workspace.name,
        icon: workspace.icon,
        color: workspace.color,
        tabCount: workspace.tabIds.length,
        defaultContainerId: workspace.defaultContainerId,
      };
    });

    // Create workspace
    ipcMain.handle("create-workspace", (_, name: string, color?: string, icon?: string, defaultContainerId?: string) => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      const workspaceId = workspaceManager.createWorkspace(name, color, icon, defaultContainerId);
      this.notifyWorkspaceChange();
      return { workspaceId };
    });

    // Switch workspace
    ipcMain.handle("switch-workspace", (_, workspaceId: string) => {
      const result = this.mainWindow.switchWorkspace(workspaceId);
      if (result) {
        this.notifyWorkspaceChange();
      }
      return result;
    });

    // Update workspace
    ipcMain.handle("update-workspace", (_, workspaceId: string, updates: {
      name?: string;
      color?: string;
      icon?: string;
      defaultContainerId?: string;
    }) => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      const result = workspaceManager.updateWorkspace(workspaceId, updates);
      if (result) {
        this.notifyWorkspaceChange();
      }
      return result;
    });

    // Delete workspace
    ipcMain.handle("delete-workspace", (_, workspaceId: string) => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      const result = workspaceManager.deleteWorkspace(workspaceId);
      if (result) {
        this.notifyWorkspaceChange();
      }
      return result;
    });
  }

  private notifyWorkspaceChange(): void {
    const workspaceManager = this.mainWindow.workspaceManagerInstance;
    // Transform to match UI expectations (tabCount instead of tabIds)
    const workspaces = workspaceManager.getAllWorkspaces().map((ws) => ({
      id: ws.id,
      name: ws.name,
      icon: ws.icon,
      color: ws.color,
      tabCount: ws.tabIds.length,
      defaultContainerId: ws.defaultContainerId,
    }));
    const activeWorkspaceRaw = workspaceManager.getActiveWorkspace();
    const activeWorkspace = activeWorkspaceRaw ? {
      id: activeWorkspaceRaw.id,
      name: activeWorkspaceRaw.name,
      icon: activeWorkspaceRaw.icon,
      color: activeWorkspaceRaw.color,
      tabCount: activeWorkspaceRaw.tabIds.length,
      defaultContainerId: activeWorkspaceRaw.defaultContainerId,
    } : null;

    // Send to topbar
    this.mainWindow.topBar.view.webContents.send("workspaces-updated", {
      workspaces,
      activeWorkspace,
    });
  }

  // ============================================================================
  // Container Management Events
  // ============================================================================

  private handleContainerEvents(): void {
    // Get all containers
    ipcMain.handle("get-containers", () => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      return workspaceManager.getAllContainers();
    });

    // Create container
    ipcMain.handle("create-container", (_, name: string, color?: string, icon?: string) => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      const containerId = workspaceManager.createContainer(name, color, icon);
      this.notifyWorkspaceChange(); // Containers affect workspace display
      return { containerId };
    });

    // Update container
    ipcMain.handle("update-container", (_, containerId: string, updates: {
      name?: string;
      color?: string;
      icon?: string;
    }) => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      const result = workspaceManager.updateContainer(containerId, updates);
      if (result) {
        this.notifyWorkspaceChange();
      }
      return result;
    });

    // Delete container
    ipcMain.handle("delete-container", (_, containerId: string) => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      const result = workspaceManager.deleteContainer(containerId);
      if (result) {
        this.notifyWorkspaceChange();
      }
      return result;
    });

    // Assign container to tab
    ipcMain.handle("assign-container-to-tab", (_, tabId: string, containerId: string) => {
      return this.mainWindow.assignTabToContainer(tabId, containerId);
    });
  }

  // ============================================================================
  // Folder Management Events
  // ============================================================================

  private handleFolderEvents(): void {
    // Get folders in workspace
    ipcMain.handle("get-folders-in-workspace", (_, workspaceId: string) => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      return workspaceManager.getFoldersInWorkspace(workspaceId);
    });

    // Create folder
    ipcMain.handle("create-folder", (_, workspaceId: string, name: string, parentFolderId?: string) => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      const folderId = workspaceManager.createFolder(workspaceId, name, parentFolderId);
      return { folderId };
    });

    // Update folder
    ipcMain.handle("update-folder", (_, folderId: string, updates: { name?: string }) => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      return workspaceManager.updateFolder(folderId, updates);
    });

    // Delete folder
    ipcMain.handle("delete-folder", (_, folderId: string) => {
      const workspaceManager = this.mainWindow.workspaceManagerInstance;
      return workspaceManager.deleteFolder(folderId);
    });
  }

  private handleDebugEvents(): void {
    // Ping test
    ipcMain.on("ping", () => console.log("pong"));
  }

  private broadcastDarkMode(sender: WebContents, isDarkMode: boolean): void {
    // Send to topbar
    if (this.mainWindow.topBar.view.webContents !== sender) {
      this.mainWindow.topBar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode
      );
    }

    // Send to sidebar
    if (this.mainWindow.sidebar.view.webContents !== sender) {
      this.mainWindow.sidebar.view.webContents.send(
        "dark-mode-updated",
        isDarkMode
      );
    }

    // Send to all tabs
    this.mainWindow.allTabs.forEach((tab) => {
      if (tab.webContents !== sender) {
        tab.webContents.send("dark-mode-updated", isDarkMode);
      }
    });
  }

  // Clean up event listeners
  public cleanup(): void {
    ipcMain.removeAllListeners();
  }
}
