import { BaseWindow, shell } from "electron";
import { Tab } from "./Tab";
import { TopBar } from "./TopBar";
import { SideBar } from "./SideBar";
import { WorkspaceManager } from "./WorkspaceManager";
import { TabManagementAPI } from "./TabManagementAPI"; // Changed from 'type' import to regular import

export interface TabGroup {
  id: string;
  name: string;
  color?: string;
  tabIds: string[];
  collapsed?: boolean;
  order: number; // For manual reordering
  createdAt?: number;
  updatedAt?: number;
}

export class Window {
  private _baseWindow: BaseWindow;
  private tabsMap: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private tabCounter: number = 0;
  private tabGroupCounter: number = 0;
  private tabGroups: Map<string, TabGroup> = new Map();
  private _topBar: TopBar;
  private _sideBar: SideBar;
  private workspaceManager: WorkspaceManager;

  // Performance optimization: Reverse index for O(1) group lookups
  private tabToGroupMap: Map<string, string> = new Map(); // tabId -> groupId

  // Performance optimization: batch tab change notifications
  private notifyTabChangeTimer: NodeJS.Timeout | null = null;
  private isBatchingTabChanges: boolean = false;

  // Automatic tab grouping with AI
  private autoGroupTimer: NodeJS.Timeout | null = null;
  private autoGroupEnabled: boolean = false; // Disabled by default - only group when asked in chat

  // Cached TabManagementAPI instance
  private _tabManagementAPICache: TabManagementAPI | null = null;

  constructor() {
    // Create the browser window.
    this._baseWindow = new BaseWindow({
      width: 1000,
      height: 800,
      show: true,
      autoHideMenuBar: false,
      titleBarStyle: "hidden",
      ...(process.platform !== "darwin" ? { titleBarOverlay: true } : {}),
      trafficLightPosition: { x: 15, y: 13 },
    });

    this._baseWindow.setMinimumSize(1000, 800);

    this._topBar = new TopBar(this._baseWindow);
    this._sideBar = new SideBar(this._baseWindow);
    this.workspaceManager = new WorkspaceManager();

    // Set the window reference on the LLM client to avoid circular dependency
    this._sideBar.client.setWindow(this);

    // Create the first tab
    this.createTab();

    // Set up window resize handler
    this._baseWindow.on("resize", () => {
      this.updateTabBounds();
      this._topBar.updateBounds();
      this._sideBar.updateBounds();
      // Notify renderer of resize through active tab
      const bounds = this._baseWindow.getBounds();
      if (this.activeTab) {
        this.activeTab.webContents.send("window-resized", {
          width: bounds.width,
          height: bounds.height,
        });
      }
    });

    // Handle external link opening
    this.tabsMap.forEach((tab) => {
      tab.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url);
        return { action: "deny" };
      });
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this._baseWindow.on("closed", () => {
      // Clean up all tabs when window is closed
      this.tabsMap.forEach((tab) => tab.destroy());
      this.tabsMap.clear();
    });
  }

  // Getters
  get window(): BaseWindow {
    return this._baseWindow;
  }

  get activeTab(): Tab | null {
    if (this.activeTabId) {
      return this.tabsMap.get(this.activeTabId) || null;
    }
    return null;
  }

  get allTabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  get tabCount(): number {
    return this.tabsMap.size;
  }

  /**
   * Get all tabs as array (for API access)
   */
  getAllTabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  get tabManagementAPIInstance(): TabManagementAPI {
    // Lazy initialization to avoid circular dependency
    if (!this._tabManagementAPICache) {
      // Use the statically imported class directly
      this._tabManagementAPICache = new TabManagementAPI(this);
    }
    // At this point, _tabManagementAPICache should never be null
    // (either it was already set, or initialization succeeded, or an error was thrown)
    return this._tabManagementAPICache!;
  }

  // Tab management methods
  createTab(url?: string, containerId?: string, workspaceId?: string, skipNotification?: boolean): Tab {
    const tabId = `tab-${++this.tabCounter}`;

    // Get container partition if containerId is provided (cache lookup for speed)
    let containerPartition: string | undefined;
    if (containerId) {
      containerPartition = this.workspaceManager.getContainerPartition(containerId) || undefined;
    } else {
      // Use default container from active workspace if available (cache this lookup)
      const activeWorkspace = this.workspaceManager.getActiveWorkspace();
      if (activeWorkspace?.defaultContainerId) {
        containerPartition = this.workspaceManager.getContainerPartition(
          activeWorkspace.defaultContainerId
        ) || undefined;
      }
    }

    // Only notify on tab change if not batching and not explicitly skipped
    // (batching is handled by createTabs, skipNotification is for internal optimizations)
    const shouldNotify = !this.isBatchingTabChanges && !skipNotification;
    const tab = new Tab(tabId, url, shouldNotify ? () => this.notifyTabChange() : () => { }, containerPartition);

    // Set container ID on tab
    if (containerId) {
      tab.setContainerId(containerId);
    }

    // Add the tab's WebContentsView to the window
    this._baseWindow.contentView.addChildView(tab.view);

    // Set the bounds to fill the window below the topbar and to the left of sidebar
    // Cache bounds lookup for multiple tabs
    const bounds = this._baseWindow.getBounds();
    tab.view.setBounds({
      x: 0,
      y: 88, // Start below the topbar
      width: bounds.width - 400, // Subtract sidebar width
      height: bounds.height - 88, // Subtract topbar height
    });

    // Store the tab
    this.tabsMap.set(tabId, tab);

    // Add tab to workspace (optimized with reverse index)
    const targetWorkspaceId = workspaceId || this.workspaceManager.getActiveWorkspaceId();
    if (targetWorkspaceId) {
      this.workspaceManager.addTabToWorkspace(targetWorkspaceId, tabId);
    }

    // If this is the first tab, make it active
    if (this.tabsMap.size === 1) {
      this.switchActiveTab(tabId);
    } else {
      // Hide tabs that are not in the active workspace
      const activeWorkspaceId = this.workspaceManager.getActiveWorkspaceId();
      if (activeWorkspaceId && targetWorkspaceId !== activeWorkspaceId) {
        tab.hide();
      } else if (!activeWorkspaceId || targetWorkspaceId === activeWorkspaceId) {
        // Hide if not first tab in active workspace
        tab.hide();
      }
    }

    // Notify topbar of tab change (only if not batching)
    // For single tab creation, this will use fast path if conditions are met
    if (shouldNotify) {
      this.notifyTabChange();
    }

    return tab;
  }

  closeTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    // Remove the WebContentsView from the window
    this._baseWindow.contentView.removeChildView(tab.view);

    // Destroy the tab
    tab.destroy();

    // Remove from our tabs map
    this.tabsMap.delete(tabId);

    // Remove from workspace
    const workspace = this.workspaceManager.getWorkspaceForTab(tabId);
    if (workspace) {
      this.workspaceManager.removeTabFromWorkspace(workspace.id, tabId);
    }

    // Remove from any tab groups (optimized with reverse index)
    const groupId = this.tabToGroupMap.get(tabId);
    if (groupId) {
      const group = this.tabGroups.get(groupId);
      if (group) {
        // Optimized: Use filter instead of indexOf + splice
        group.tabIds = group.tabIds.filter(id => id !== tabId);
        if (group.tabIds.length === 0) {
          this.tabGroups.delete(groupId);
        }
      }
      this.tabToGroupMap.delete(tabId);
    }

    // If this was the active tab, switch to another tab
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      const remainingTabs = Array.from(this.tabsMap.keys());
      if (remainingTabs.length > 0) {
        this.switchActiveTab(remainingTabs[0]);
      }
    }

    // Notify topbar of tab change
    this.notifyTabChange();

    // If no tabs left, close the window
    if (this.tabsMap.size === 0) {
      this._baseWindow.close();
    }

    return true;
  }

  switchActiveTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    // Hide the currently active tab
    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentTab = this.tabsMap.get(this.activeTabId);
      if (currentTab) {
        currentTab.hide();
      }
    }

    // Show the new active tab
    tab.show();
    this.activeTabId = tabId;

    // Update the window title to match the tab title
    this._baseWindow.setTitle(tab.title || "Blueberry Browser");

    // Fast path: Tab switching only affects active state, use fast notification
    // This is a small change (just active tab changed), so use fast path
    const currentTabCount = this.tabsMap.size;
    const timeSinceLastNotification = Date.now() - this.lastNotificationTime;
    if (currentTabCount >= 10 && timeSinceLastNotification < 500) {
      this.doNotifyTabChangeFast();
      this.lastNotificationTime = Date.now();
    } else {
      this.notifyTabChange();
    }

    return true;
  }

  getTab(tabId: string): Tab | null {
    return this.tabsMap.get(tabId) || null;
  }

  // Window methods
  show(): void {
    this._baseWindow.show();
  }

  hide(): void {
    this._baseWindow.hide();
  }

  close(): void {
    this._baseWindow.close();
  }

  focus(): void {
    this._baseWindow.focus();
  }

  minimize(): void {
    this._baseWindow.minimize();
  }

  maximize(): void {
    this._baseWindow.maximize();
  }

  unmaximize(): void {
    this._baseWindow.unmaximize();
  }

  isMaximized(): boolean {
    return this._baseWindow.isMaximized();
  }

  setTitle(title: string): void {
    this._baseWindow.setTitle(title);
  }

  setBounds(bounds: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): void {
    this._baseWindow.setBounds(bounds);
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    return this._baseWindow.getBounds();
  }

  // Handle window resize to update tab bounds
  private updateTabBounds(): void {
    const bounds = this._baseWindow.getBounds();
    // Only subtract sidebar width if it's visible
    const sidebarWidth = this._sideBar.getIsVisible() ? 400 : 0;

    this.tabsMap.forEach((tab) => {
      tab.view.setBounds({
        x: 0,
        y: 88, // Start below the topbar
        width: bounds.width - sidebarWidth,
        height: bounds.height - 88, // Subtract topbar height
      });
    });
  }

  // Public method to update all bounds when sidebar is toggled
  updateAllBounds(): void {
    this.updateTabBounds();
    this._sideBar.updateBounds();
  }

  // Getter for sidebar to access from main process
  get sidebar(): SideBar {
    return this._sideBar;
  }

  // Getter for topBar to access from main process
  get topBar(): TopBar {
    return this._topBar;
  }

  // Getter for all tabs as array
  get tabs(): Tab[] {
    return Array.from(this.tabsMap.values());
  }

  // Getter for baseWindow to access from Menu
  get baseWindow(): BaseWindow {
    return this._baseWindow;
  }

  // Tab group management
  get allTabGroups(): TabGroup[] {
    return Array.from(this.tabGroups.values());
  }

  getTabGroup(groupId: string): TabGroup | null {
    return this.tabGroups.get(groupId) || null;
  }

  // Find tabs by various criteria
  findTabsByDomain(domain: string): Tab[] {
    const lowerDomain = domain.toLowerCase().replace(/^www\./, ""); // Remove www. prefix if present
    return this.allTabs.filter((tab) => {
      try {
        const url = new URL(tab.url);
        const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

        // Check for exact match or subdomain match
        // e.g., "linkedin.com" matches "linkedin.com", "www.linkedin.com", "mobile.linkedin.com"
        // but not "not-linkedin.com" or "linkedin.com.example.com"
        return hostname === lowerDomain || hostname.endsWith("." + lowerDomain);
      } catch {
        return false;
      }
    });
  }

  findTabsByTitlePattern(pattern: string): Tab[] {
    const lowerPattern = pattern.toLowerCase();
    return this.allTabs.filter((tab) =>
      tab.title.toLowerCase().includes(lowerPattern)
    );
  }

  findTabsByUrlPattern(pattern: string): Tab[] {
    const lowerPattern = pattern.toLowerCase();
    return this.allTabs.filter((tab) =>
      tab.url.toLowerCase().includes(lowerPattern)
    );
  }

  findTabsPlayingAudio(): Tab[] {
    return this.allTabs.filter((tab) => tab.isPlayingAudio());
  }

  findTabsByCriteria(criteria: {
    domain?: string;
    titlePattern?: string;
    urlPattern?: string;
    excludeActive?: boolean;
    playingAudio?: boolean;
  }): Tab[] {
    // Optimized: Single pass filter with cached domain lookups
    const lowerDomain = criteria.domain ? criteria.domain.toLowerCase().replace(/^www\./, "") : null;
    const lowerTitlePattern = criteria.titlePattern ? criteria.titlePattern.toLowerCase() : null;
    const lowerUrlPattern = criteria.urlPattern ? criteria.urlPattern.toLowerCase() : null;
    const excludeActiveId = criteria.excludeActive && this.activeTabId ? this.activeTabId : null;

    return this.allTabs.filter((tab) => {
      // Filter by domain (optimized - uses cached domain property)
      if (lowerDomain) {
        const tabDomain = tab.domain.toLowerCase();
        if (tabDomain !== lowerDomain && !tabDomain.endsWith("." + lowerDomain)) {
          return false;
        }
      }

      // Filter by title pattern
      if (lowerTitlePattern) {
        if (!tab.title.toLowerCase().includes(lowerTitlePattern)) {
          return false;
        }
      }

      // Filter by URL pattern
      if (lowerUrlPattern) {
        if (!tab.url.toLowerCase().includes(lowerUrlPattern)) {
          return false;
        }
      }

      // Filter by active status
      if (excludeActiveId && tab.id === excludeActiveId) {
        return false;
      }

      // Filter by audio playing
      if (criteria.playingAudio !== undefined && tab.isPlayingAudio() !== criteria.playingAudio) {
        return false;
      }

      return true;
    });
  }

  // Close multiple tabs
  closeTabs(tabIds: string[]): number {
    let closedCount = 0;
    const wasActiveTabClosed = this.activeTabId && tabIds.includes(this.activeTabId);

    for (const tabId of tabIds) {
      const tab = this.tabsMap.get(tabId);
      if (!tab) continue;

      // Remove the WebContentsView from the window
      this._baseWindow.contentView.removeChildView(tab.view);

      // Destroy the tab
      tab.destroy();

      // Remove from our tabs map
      this.tabsMap.delete(tabId);
      closedCount++;

      // Remove from any tab groups
      this.tabGroups.forEach((group) => {
        const index = group.tabIds.indexOf(tabId);
        if (index !== -1) {
          group.tabIds.splice(index, 1);
        }
      });
    }

    // If the active tab was closed, switch to another tab
    if (wasActiveTabClosed) {
      const remainingTabs = Array.from(this.tabsMap.keys());
      if (remainingTabs.length > 0) {
        // Switch to the first remaining tab (don't notify here, we'll notify at the end)
        const newActiveTab = this.tabsMap.get(remainingTabs[0]);
        if (newActiveTab) {
          // Show the new active tab
          newActiveTab.show();
          this.activeTabId = remainingTabs[0];
          // Update the window title
          this._baseWindow.setTitle(newActiveTab.title || "Blueberry Browser");
        }
      } else {
        this.activeTabId = null;
      }
    }

    // Notify topbar once after all tabs are closed
    if (closedCount > 0) {
      this.notifyTabChange();
    }

    // If no tabs left, close the window
    if (this.tabsMap.size === 0) {
      this._baseWindow.close();
    }

    return closedCount;
  }

  // Close duplicate tabs
  closeDuplicateTabs(): number {
    const urlMap = new Map<string, string[]>(); // URL -> tabIds[]
    let closedCount = 0;

    // Group tabs by URL
    this.tabsMap.forEach((tab, tabId) => {
      const url = tab.url;
      if (!url || url === 'about:blank') return;

      // Normalize URL to ignore trailing slashes and query params order if needed
      // For now, simple string comparison
      if (!urlMap.has(url)) {
        urlMap.set(url, []);
      }
      urlMap.get(url)!.push(tabId);
    });

    const tabsToClose: string[] = [];

    // Identify duplicates (keep the first one found, which is usually the oldest or first in map)
    urlMap.forEach((tabIds) => {
      if (tabIds.length > 1) {
        // Keep the first one, close the rest
        // We could be smarter here (e.g., keep the active one if it's in the list)
        let keepTabId = tabIds[0];

        // If one of the duplicates is the active tab, keep that one instead
        if (this.activeTabId && tabIds.includes(this.activeTabId)) {
          keepTabId = this.activeTabId;
        }

        // Add others to close list
        tabIds.forEach(id => {
          if (id !== keepTabId) {
            tabsToClose.push(id);
          }
        });
      }
    });

    if (tabsToClose.length > 0) {
      closedCount = this.closeTabs(tabsToClose);
    }

    return closedCount;
  }

  // Create a tab group
  createTabGroup(
    tabIds: string[],
    groupName: string,
    color?: string
  ): string {
    // Validate that all tab IDs exist
    const validTabIds = tabIds.filter((id) => this.tabsMap.has(id));

    if (validTabIds.length === 0) {
      throw new Error("No valid tabs provided for group creation");
    }

    // Auto-assign a unique color if not provided
    let groupColor = color;
    if (!groupColor) {
      const allColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
      const usedColors = Array.from(this.tabGroups.values())
        .map(g => g.color)
        .filter(Boolean) as string[];

      // Find first unused color (optimized with Set)
      const usedColorsSet = new Set(usedColors);
      for (const c of allColors) {
        if (!usedColorsSet.has(c)) {
          groupColor = c;
          break;
        }
      }

      // If all colors used, pick least used (optimized with Map)
      if (!groupColor) {
        const colorCountMap = new Map<string, number>();
        usedColors.forEach(color => {
          colorCountMap.set(color, (colorCountMap.get(color) || 0) + 1);
        });
        let minCount = Infinity;
        for (const c of allColors) {
          const count = colorCountMap.get(c) || 0;
          if (count < minCount) {
            minCount = count;
            groupColor = c;
          }
        }
      }
    }

    // Find max order
    let maxOrder = -1;
    this.tabGroups.forEach(g => {
      if (g.order > maxOrder) maxOrder = g.order;
    });

    const groupId = `group-${++this.tabGroupCounter}`;
    const group: TabGroup = {
      id: groupId,
      name: groupName,
      color: groupColor || "blue",
      tabIds: validTabIds,
      collapsed: false,
      order: maxOrder + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.tabGroups.set(groupId, group);

    // Update reverse index for O(1) lookups
    validTabIds.forEach(tabId => this.tabToGroupMap.set(tabId, groupId));

    // Notify topbar of tab change (groups might affect UI)
    this.notifyTabChange();

    return groupId;
  }

  // Edit a tab group
  editTabGroup(
    groupId: string,
    newName?: string,
    newColor?: string,
    tabsToAdd?: string[],
    tabsToRemove?: string[],
    collapsed?: boolean
  ): void {
    const group = this.tabGroups.get(groupId);
    if (!group) {
      throw new Error(`Tab group ${groupId} not found`);
    }

    if (newName !== undefined) {
      group.name = newName;
    }

    if (newColor !== undefined) {
      group.color = newColor;
    }

    if (collapsed !== undefined) {
      group.collapsed = collapsed;
    }

    if (tabsToAdd) {
      const tabsToAddSet = new Set(group.tabIds); // Use Set for O(1) lookup
      const validTabsToAdd = tabsToAdd.filter(
        (id) => this.tabsMap.has(id) && !tabsToAddSet.has(id)
      );
      group.tabIds.push(...validTabsToAdd);
      // Update reverse index
      validTabsToAdd.forEach(tabId => this.tabToGroupMap.set(tabId, groupId));
    }

    if (tabsToRemove) {
      const tabsToRemoveSet = new Set(tabsToRemove); // Use Set for O(1) lookup
      group.tabIds = group.tabIds.filter((id) => !tabsToRemoveSet.has(id));
      // Update reverse index
      tabsToRemove.forEach(tabId => this.tabToGroupMap.delete(tabId));
    }

    // Remove group if it has no tabs
    if (group.tabIds.length === 0) {
      this.tabGroups.delete(groupId);
    } else {
      group.updatedAt = Date.now();
    }

    // Notify topbar of tab change (groups might affect UI)
    this.notifyTabChange();
  }

  // Toggle group collapse state (Firefox-style)
  toggleGroupCollapse(groupId: string): boolean {
    const group = this.tabGroups.get(groupId);
    if (!group) {
      return false;
    }
    group.collapsed = !group.collapsed;
    group.updatedAt = Date.now();
    this.notifyTabChange();
    return true;
  }

  // Move tab to a different group (Firefox-style drag-and-drop)
  moveTabToGroup(tabId: string, targetGroupId: string | null): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }

    // Remove from current group (optimized with reverse index)
    const currentGroupId = this.tabToGroupMap.get(tabId);
    if (currentGroupId) {
      const currentGroup = this.tabGroups.get(currentGroupId);
      if (currentGroup) {
        currentGroup.tabIds = currentGroup.tabIds.filter((id) => id !== tabId);
        if (currentGroup.tabIds.length === 0) {
          this.tabGroups.delete(currentGroupId);
        } else {
          currentGroup.updatedAt = Date.now();
        }
      }
      this.tabToGroupMap.delete(tabId);
    }

    // Add to target group
    if (targetGroupId) {
      const targetGroup = this.tabGroups.get(targetGroupId);
      if (targetGroup) {
        // Optimized: Use Set for O(1) duplicate check
        const targetTabIdsSet = new Set(targetGroup.tabIds);
        if (!targetTabIdsSet.has(tabId)) {
          targetGroup.tabIds.push(tabId);
          targetGroup.updatedAt = Date.now();
          this.tabToGroupMap.set(tabId, targetGroupId);
        }
      } else {
        // Create new group if it doesn't exist
        this.createTabGroup([tabId], `Group ${targetGroupId}`, "blue");
      }
    }

    this.notifyTabChange();
    return true;
  }

  // Move tab within group (reorder)
  moveTabInGroup(tabId: string, newIndex: number): boolean {
    const groupId = this.tabToGroupMap.get(tabId);
    if (!groupId) {
      return false;
    }

    const group = this.tabGroups.get(groupId);
    if (!group) {
      return false;
    }

    const currentIndex = group.tabIds.indexOf(tabId);
    if (currentIndex === -1 || currentIndex === newIndex) {
      return false;
    }

    // Remove from current position
    group.tabIds.splice(currentIndex, 1);
    // Insert at new position
    group.tabIds.splice(newIndex, 0, tabId);
    group.updatedAt = Date.now();

    this.notifyTabChange();
    return true;
  }

  // Move/reorder tab group
  moveTabGroup(groupId: string, newIndex: number): boolean {
    const group = this.tabGroups.get(groupId);
    if (!group) return false;

    // Get all groups sorted by order
    const sortedGroups = Array.from(this.tabGroups.values()).sort((a, b) => a.order - b.order);
    const currentIndex = sortedGroups.findIndex(g => g.id === groupId);

    if (currentIndex === -1 || currentIndex === newIndex) return false;

    // Remove from current position
    sortedGroups.splice(currentIndex, 1);
    // Insert at new position
    sortedGroups.splice(newIndex, 0, group);

    // Reassign orders
    sortedGroups.forEach((g, index) => {
      g.order = index;
      g.updatedAt = Date.now();
    });

    this.notifyTabChange();
    return true;
  }

  // Delete a tab group (optimized - update reverse index)
  deleteTabGroup(groupId: string): boolean {
    const group = this.tabGroups.get(groupId);
    if (group) {
      // Remove all tabs from reverse index
      group.tabIds.forEach(tabId => this.tabToGroupMap.delete(tabId));
    }
    return this.tabGroups.delete(groupId);
  }

  // Get tabs in a group (optimized - no change needed, already efficient)
  getTabsInGroup(groupId: string): Tab[] {
    const group = this.tabGroups.get(groupId);
    if (!group) {
      return [];
    }
    return group.tabIds
      .map((id) => this.tabsMap.get(id))
      .filter((tab): tab is Tab => tab !== undefined);
  }

  // Create a new tab directly in a group
  createTabInGroup(url: string | undefined, groupId: string): Tab {
    const tab = this.createTab(url);
    const group = this.tabGroups.get(groupId);
    if (group) {
      group.tabIds.push(tab.id);
      group.updatedAt = Date.now();
      this.notifyTabChange();
    }
    return tab;
  }

  // Save and close group (close all tabs but keep group structure)
  saveAndCloseGroup(groupId: string): boolean {
    const group = this.tabGroups.get(groupId);
    if (!group) {
      return false;
    }

    // Close all tabs in group
    const tabIdsToClose = [...group.tabIds];
    tabIdsToClose.forEach((tabId) => {
      this.closeTab(tabId);
    });

    // Group will be auto-deleted when empty, but we could keep it for restoration
    // For now, we'll let it be deleted automatically
    this.notifyTabChange();
    return true;
  }

  // Ungroup tabs (remove all tabs from a group)
  ungroupTabs(groupId: string): boolean {
    const group = this.tabGroups.get(groupId);
    if (!group) {
      return false;
    }

    // Remove all tabs from group and update reverse index
    group.tabIds.forEach(tabId => this.tabToGroupMap.delete(tabId));
    group.tabIds = [];
    this.tabGroups.delete(groupId);
    this.notifyTabChange();
    return true;
  }

  // Get all groups with their tabs (for list all tabs menu)
  getAllGroupsWithTabs(): Array<{
    id: string;
    name: string;
    color: string;
    collapsed: boolean;
    tabs: Array<{ id: string; title: string; url: string }>;
  }> {
    return Array.from(this.tabGroups.values()).map((group) => ({
      id: group.id,
      name: group.name,
      color: group.color || "blue",
      collapsed: group.collapsed ?? false,
      tabs: group.tabIds
        .map((id) => this.tabsMap.get(id))
        .filter((tab): tab is Tab => tab !== undefined)
        .map((tab) => ({
          id: tab.id,
          title: tab.title,
          url: tab.url,
        })),
    }));
  }

  // Get the group that a tab belongs to (optimized with reverse index - O(1))
  getTabGroupForTab(tabId: string): TabGroup | null {
    const groupId = this.tabToGroupMap.get(tabId);
    if (!groupId) return null;
    return this.tabGroups.get(groupId) || null;
  }

  // Pin/unpin tab
  pinTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }
    tab.setPinned(true);
    this.notifyTabChange();
    return true;
  }

  unpinTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }
    tab.setPinned(false);
    this.notifyTabChange();
    return true;
  }

  togglePinTab(tabId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) {
      return false;
    }
    tab.setPinned(!tab.pinned);
    this.notifyTabChange();
    return true;
  }

  // ============================================================================
  // Workspace & Container Management
  // ============================================================================

  get workspaceManagerInstance(): WorkspaceManager {
    return this.workspaceManager;
  }

  switchWorkspace(workspaceId: string): boolean {
    if (!this.workspaceManager.switchWorkspace(workspaceId)) {
      return false;
    }

    // Show tabs in the new workspace, hide others
    const activeWorkspace = this.workspaceManager.getActiveWorkspace();
    if (activeWorkspace) {
      this.allTabs.forEach((tab) => {
        if (activeWorkspace.tabIds.includes(tab.id)) {
          // Show tabs in active workspace
          if (tab.id === this.activeTabId) {
            tab.show();
          }
        } else {
          // Hide tabs not in active workspace
          tab.hide();
        }
      });
    }

    this.notifyTabChange();
    return true;
  }

  assignTabToContainer(tabId: string, containerId: string): boolean {
    const tab = this.tabsMap.get(tabId);
    if (!tab) return false;

    const partition = this.workspaceManager.getContainerPartition(containerId);
    if (!partition) return false;

    // Note: Container assignment requires recreating the tab with new partition
    // For now, we'll just track the container ID
    // Full implementation would require tab recreation
    tab.setContainerId(containerId);
    this.notifyTabChange();
    return true;
  }

  // Track last tab count for detecting small changes
  private lastTabCount: number = 0;
  private lastNotificationTime: number = 0;

  // Notify topbar of tab changes
  private notifyTabChange(): void {
    // If batching is enabled, defer the notification
    if (this.isBatchingTabChanges) {
      if (this.notifyTabChangeTimer) {
        clearTimeout(this.notifyTabChangeTimer);
      }
      this.notifyTabChangeTimer = setTimeout(() => {
        this.doNotifyTabChange();
        this.notifyTabChangeTimer = null;
      }, 16); // ~1 frame at 60fps for smooth batching
      return;
    }

    // Fast path: If only 1-2 tabs changed and we have many tabs, use incremental update
    const currentTabCount = this.tabsMap.size;
    const tabCountDelta = Math.abs(currentTabCount - this.lastTabCount);
    const timeSinceLastNotification = Date.now() - this.lastNotificationTime;

    // Use incremental update if:
    // - Small change (1-3 tabs added/removed)
    // - Many existing tabs (10+)
    // - Recent notification (within 500ms) - likely rapid small changes
    if (tabCountDelta <= 3 && currentTabCount >= 10 && timeSinceLastNotification < 500) {
      this.doNotifyTabChangeFast();
    } else {
      this.doNotifyTabChange();
    }

    this.lastTabCount = currentTabCount;
    this.lastNotificationTime = Date.now();
  }

  // Fast notification path for small changes (only processes visible tabs)
  private doNotifyTabChangeFast(): void {
    const activeTabId = this.activeTabId;
    const activeWorkspace = this.workspaceManager.getActiveWorkspace();

    // Only process tabs in active workspace (much smaller set)
    let tabsToShow = Array.from(this.tabsMap.values());
    if (activeWorkspace) {
      const workspaceTabIds = new Set(activeWorkspace.tabIds);
      tabsToShow = tabsToShow.filter(tab => workspaceTabIds.has(tab.id));
    }

    // Quick sort (only pinned/grouped, no deep processing)
    const sortedTabs = tabsToShow.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0; // Skip group sorting for speed
    });

    // Minimal processing - only essential fields
    const tabs = sortedTabs.map((tab) => {
      const group = this.getTabGroupForTab(tab.id);
      const workspace = this.workspaceManager.getWorkspaceForTab(tab.id);
      const folder = this.workspaceManager.getFolderForTab(tab.id);
      const container = tab.containerId
        ? this.workspaceManager.getContainer(tab.containerId)
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
        groupCollapsed: group?.collapsed ?? false,
        isHiddenByCollapse: group?.collapsed ?? false, // Respect collapse state even in fast path
        workspaceId: workspace?.id,
        workspaceName: workspace?.name,
        containerId: tab.containerId,
        containerName: container?.name,
        containerColor: container?.color,
        folderId: folder?.id,
        folderName: folder?.name,
      };
    });

    // Send to topbar
    this._topBar.view.webContents.send("tabs-updated", tabs);
  }

  // Actual notification logic (optimized)
  private doNotifyTabChange(): void {
    const activeTabId = this.activeTabId;
    const activeWorkspace = this.workspaceManager.getActiveWorkspace();

    // Filter tabs to only show those in the active workspace (optimized with Set)
    let tabsToShow = Array.from(this.tabsMap.values());
    if (activeWorkspace) {
      const workspaceTabIds = new Set(activeWorkspace.tabIds); // O(1) lookups
      tabsToShow = tabsToShow.filter(tab => workspaceTabIds.has(tab.id));
    }

    // Performance optimization: Cache group lookups to avoid repeated Map lookups
    const groupCache = new Map<string, TabGroup | null>();
    const getGroup = (tabId: string): TabGroup | null => {
      if (!groupCache.has(tabId)) {
        groupCache.set(tabId, this.getTabGroupForTab(tabId));
      }
      return groupCache.get(tabId)!;
    };

    // Pre-compute tab indices in groups for O(1) lookups during sorting
    // Only compute if we have groups (skip if no groups for speed)
    const tabIndexInGroup = new Map<string, number>();
    if (this.tabGroups.size > 0) {
      for (const group of this.tabGroups.values()) {
        group.tabIds.forEach((tabId, index) => {
          tabIndexInGroup.set(tabId, index);
        });
      }
    }

    // Sort tabs: pinned first, then grouped tabs together, then ungrouped
    // Skip sorting if no groups and no pinned tabs (common case)
    const hasGroups = this.tabGroups.size > 0;
    const hasPinnedTabs = tabsToShow.some(tab => tab.pinned);
    const sortedTabs = (hasGroups || hasPinnedTabs) ? tabsToShow.sort((a, b) => {
      // Pinned tabs first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // Then group tabs together (using cached lookups)
      if (hasGroups) {
        const groupA = getGroup(a.id);
        const groupB = getGroup(b.id);

        if (groupA && !groupB) return -1; // Grouped tabs before ungrouped
        if (!groupA && groupB) return 1;

        if (groupA && groupB) {
          // Same group - keep order (optimized with pre-computed indices)
          if (groupA.id === groupB.id) {
            const indexA = tabIndexInGroup.get(a.id) ?? Infinity;
            const indexB = tabIndexInGroup.get(b.id) ?? Infinity;
            return indexA - indexB;
          }
          // Different groups - sort by group creation order (group id)
          return groupA.id.localeCompare(groupB.id);
        }
      }

      return 0;
    }) : tabsToShow; // Skip sorting entirely if no groups and no pinned tabs

    // Cache workspace and folder lookups (only compute if needed)
    const workspaceCache = new Map<string, ReturnType<typeof this.workspaceManager.getWorkspaceForTab> | null>();
    const folderCache = new Map<string, ReturnType<typeof this.workspaceManager.getFolderForTab> | null>();
    const containerCache = new Map<string, ReturnType<typeof this.workspaceManager.getContainer> | null>();

    const tabs = sortedTabs.map((tab) => {
      const group = hasGroups ? getGroup(tab.id) : null;

      // Cache workspace lookup
      let workspace = workspaceCache.get(tab.id);
      if (workspace === undefined) {
        workspace = this.workspaceManager.getWorkspaceForTab(tab.id);
        workspaceCache.set(tab.id, workspace);
      }

      // Cache folder lookup (only if workspace has folders)
      let folder = folderCache.get(tab.id);
      if (folder === undefined) {
        folder = this.workspaceManager.getFolderForTab(tab.id);
        folderCache.set(tab.id, folder);
      }

      // Cache container lookup (only if tab has container)
      let container: ReturnType<typeof this.workspaceManager.getContainer> | null = null;
      if (tab.containerId) {
        if (!containerCache.has(tab.containerId)) {
          const cached = this.workspaceManager.getContainer(tab.containerId);
          containerCache.set(tab.containerId, cached);
        }
        container = containerCache.get(tab.containerId) ?? null;
      }

      // Check if group is collapsed and if this tab should be hidden (optimized with Set)
      const isGroupCollapsed = group?.collapsed ?? false;
      const groupTabIdsSet = group ? new Set(group.tabIds) : new Set<string>(); // O(1) lookup
      const isTabInCollapsedGroup = isGroupCollapsed && group && groupTabIdsSet.has(tab.id);

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
        groupCollapsed: isGroupCollapsed,
        isHiddenByCollapse: isTabInCollapsedGroup, // Hide all tabs in collapsed group, including active
        workspaceId: workspace?.id,
        workspaceName: workspace?.name,
        containerId: tab.containerId,
        containerName: container?.name,
        containerColor: container?.color,
        folderId: folder?.id,
        folderName: folder?.name,
      };
    });

    // Send to topbar
    this._topBar.view.webContents.send("tabs-updated", {
      tabs,
      groups: this.getAllGroupsWithTabs().map(g => ({
        id: g.id,
        name: g.name,
        color: g.color,
        tabIds: g.tabs.map(t => t.id),
        collapsed: g.collapsed
      }))
    });

    // Trigger automatic grouping in background (non-blocking)
    if (this.autoGroupEnabled) {
      setImmediate(() => this.triggerAutoGrouping());
    }
  }

  // Public method to enable/disable batching (used by TabManagementAPI)
  public setBatchingTabChanges(enabled: boolean): void {
    this.isBatchingTabChanges = enabled;
    if (!enabled && this.notifyTabChangeTimer) {
      // If disabling batching, flush any pending notifications
      clearTimeout(this.notifyTabChangeTimer);
      this.notifyTabChangeTimer = null;
      this.doNotifyTabChange();
    }
  }

  /**
   * Trigger automatic tab grouping with debouncing
   * Groups ungrouped tabs using AI after a delay
   */
  private triggerAutoGrouping(): void {
    if (!this.autoGroupEnabled) return;

    // Debounce: wait 2 seconds after last tab change before grouping
    if (this.autoGroupTimer) {
      clearTimeout(this.autoGroupTimer);
    }

    this.autoGroupTimer = setTimeout(async () => {
      try {
        const { TabManagementAPI } = await import("./TabManagementAPI");
        const api = new TabManagementAPI(this);
        const result = await api.autoGroupTabs();
        if (result.groupsCreated > 0) {
          console.log(`[Window] Auto-grouped ${result.groupsCreated} group(s) using AI`);
          this.notifyTabChange(); // Update UI with new groups
        }
      } catch (error) {
        console.error('[Window] Auto-grouping error:', error);
      }
      this.autoGroupTimer = null;
    }, 2000); // 2 second debounce
  }

  /**
   * Enable/disable automatic tab grouping
   */
  public setAutoGroupEnabled(enabled: boolean): void {
    this.autoGroupEnabled = enabled;
    if (!enabled && this.autoGroupTimer) {
      clearTimeout(this.autoGroupTimer);
      this.autoGroupTimer = null;
    }
  }

  /**
   * Manually trigger auto-grouping (for testing or manual triggers)
   */
  public async triggerManualAutoGrouping(): Promise<{ groupsCreated: number }> {
    const { TabManagementAPI } = await import("./TabManagementAPI");
    const api = new TabManagementAPI(this);
    const result = await api.autoGroupTabs();
    if (result.groupsCreated > 0) {
      this.notifyTabChange();
    }
    return result;
  }
}
