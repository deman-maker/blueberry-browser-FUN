import { Window } from "./Window";
import { TabGroupingAI } from "./TabGroupingAI";
import { Tab } from "./Tab";
import { IntelligentRouter, RoutingResult } from "./IntelligentRouter";

/**
 * Comprehensive Tab Management API
 * 
 * This API provides a powerful, unified interface for all tab management operations.
 * It's designed to be used by LLMs via function calling, supporting complex workflows
 * and chaining operations.
 */
export class TabManagementAPI {
  private tabGroupingAI: TabGroupingAI;
  private intelligentRouter: IntelligentRouter;

  constructor(private window: Window) {
    this.tabGroupingAI = new TabGroupingAI();
    // Preload the AI model in background for faster grouping later
    this.tabGroupingAI.preloadModel();

    // Initialize intelligent router for 3-tier routing
    this.intelligentRouter = new IntelligentRouter();
  }

  /**
   * Get the TabGroupingAI instance (for accessing model info)
   */
  public getTabGroupingAI(): TabGroupingAI {
    return this.tabGroupingAI;
  }

  // ============================================================================
  // Tab Query & Information
  // ============================================================================

  /**
   * Get all tabs with detailed information
   */
  getAllTabs(): Array<{
    id: string;
    title: string;
    url: string;
    isActive: boolean;
    isPinned: boolean;
    groupId?: string;
    groupName?: string;
    isPlayingAudio: boolean;
    workspaceId?: string;
    workspaceName?: string;
    containerId?: string | null;
    folderId?: string;
    folderName?: string;
  }> {
    const activeTabId = this.window.activeTab?.id;
    const workspaceManager = this.window.workspaceManagerInstance;
    return this.window.allTabs.map((tab) => {
      const group = this.window.getTabGroupForTab(tab.id);
      const workspace = workspaceManager.getWorkspaceForTab(tab.id);
      const folder = workspaceManager.getFolderForTab(tab.id);
      return {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        isActive: activeTabId === tab.id,
        isPinned: tab.pinned,
        groupId: group?.id,
        groupName: group?.name,
        isPlayingAudio: tab.isPlayingAudio(),
        workspaceId: workspace?.id,
        workspaceName: workspace?.name,
        containerId: tab.containerId,
        folderId: folder?.id,
        folderName: folder?.name,
      };
    });
  }

  /**
   * Get active tab information
   */
  getActiveTab(): {
    id: string;
    title: string;
    url: string;
    isPinned: boolean;
    groupId?: string;
    canGoBack: boolean;
    canGoForward: boolean;
  } | null {
    const activeTab = this.window.activeTab;
    if (!activeTab) return null;

    const group = this.window.getTabGroupForTab(activeTab.id);
    return {
      id: activeTab.id,
      title: activeTab.title,
      url: activeTab.url,
      isPinned: activeTab.pinned,
      groupId: group?.id,
      canGoBack: activeTab.webContents.navigationHistory.canGoBack(),
      canGoForward: activeTab.webContents.navigationHistory.canGoForward(),
    };
  }

  /**
   * Find tabs by various criteria (optimized with single-pass filtering)
   */
  findTabs(criteria: {
    tabIds?: string[];
    domain?: string;
    titlePattern?: string;
    urlPattern?: string;
    isPinned?: boolean;
    isActive?: boolean;
    playingAudio?: boolean;
    groupId?: string;
  }): Tab[] {
    // Optimized: Single pass filter with Set-based lookups
    const tabIdsSet = criteria.tabIds ? new Set(criteria.tabIds) : null;
    const activeTabId = this.window.activeTab?.id;
    const groupTabsSet = criteria.groupId
      ? new Set(this.window.getTabsInGroup(criteria.groupId).map(t => t.id))
      : null;

    return this.window.allTabs.filter((tab) => {
      // Filter by specific tab IDs (optimized with Set)
      if (tabIdsSet && !tabIdsSet.has(tab.id)) {
        return false;
      }

      // Filter by domain (optimized - uses cached domain)
      if (criteria.domain) {
        const lowerDomain = criteria.domain.toLowerCase().replace(/^www\./, "");
        const tabDomain = tab.domain.toLowerCase();
        if (tabDomain !== lowerDomain && !tabDomain.endsWith("." + lowerDomain)) {
          return false;
        }
      }

      // Filter by title pattern
      if (criteria.titlePattern) {
        if (!tab.title.toLowerCase().includes(criteria.titlePattern.toLowerCase())) {
          return false;
        }
      }

      // Filter by URL pattern
      if (criteria.urlPattern) {
        if (!tab.url.toLowerCase().includes(criteria.urlPattern.toLowerCase())) {
          return false;
        }
      }

      // Filter by pinned status
      if (criteria.isPinned !== undefined && tab.pinned !== criteria.isPinned) {
        return false;
      }

      // Filter by active status
      if (criteria.isActive !== undefined && (tab.id === activeTabId) !== criteria.isActive) {
        return false;
      }

      // Filter by audio playing
      if (criteria.playingAudio !== undefined && tab.isPlayingAudio() !== criteria.playingAudio) {
        return false;
      }

      // Filter by group (optimized with Set)
      if (groupTabsSet && !groupTabsSet.has(tab.id)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get tab count statistics
   */
  getTabStats(): {
    total: number;
    pinned: number;
    grouped: number;
    ungrouped: number;
    playingAudio: number;
    groups: number;
  } {
    const allTabs = this.window.allTabs;
    const pinned = allTabs.filter((t) => t.pinned).length;
    const grouped = allTabs.filter((t) => this.window.getTabGroupForTab(t.id) !== null).length;
    const playingAudio = allTabs.filter((t) => t.isPlayingAudio()).length;
    const groups = this.window.allTabGroups.length;

    return {
      total: allTabs.length,
      pinned,
      grouped,
      ungrouped: allTabs.length - grouped,
      playingAudio,
      groups,
    };
  }

  // ============================================================================
  // Tab Creation & Deletion
  // ============================================================================

  /**
   * Create a new tab
   */
  createTab(url?: string): { id: string; title: string; url: string } {
    const tab = this.window.createTab(url);
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
    };
  }

  /**
   * Create multiple tabs (optimized with batching and deferred loading)
   */
  createTabs(urls: string[]): Array<{ id: string; title: string; url: string }> {
    // Enable batching to avoid multiple notifyTabChange() calls
    this.window.setBatchingTabChanges(true);
    try {
      // Create all tab objects first (fast - just object creation)
      // URL loading is deferred in Tab constructor, so this is non-blocking
      const results = urls.map((url) => {
        const tab = this.window.createTab(url, undefined, undefined, true); // skip individual notification
        return {
          id: tab.id,
          title: tab.title,
          url: tab.url,
        };
      });
      return results;
    } finally {
      // Disable batching and trigger a single notification
      this.window.setBatchingTabChanges(false);
    }
  }

  /**
   * Create multiple tabs in a workspace (optimized with batching and deferred loading)
   */
  createTabsInWorkspace(
    urls: string[],
    workspaceId?: string,
    containerId?: string
  ): Array<{ id: string; title: string; url: string }> {
    // Enable batching to avoid multiple notifyTabChange() calls
    this.window.setBatchingTabChanges(true);
    try {
      // Create all tab objects first (fast - just object creation)
      // URL loading is deferred in Tab constructor, so this is non-blocking
      const results = urls.map((url) => {
        const tab = this.window.createTab(url, containerId, workspaceId, true); // skip individual notification
        return {
          id: tab.id,
          title: tab.title,
          url: tab.url,
        };
      });
      return results;
    } finally {
      // Disable batching and trigger a single notification
      this.window.setBatchingTabChanges(false);
    }
  }

  /**
   * Close tabs by criteria
   */
  closeTabs(criteria: {
    tabIds?: string[];
    domain?: string;
    titlePattern?: string;
    urlPattern?: string;
    excludeActive?: boolean;
    playingAudio?: boolean;
    limit?: number;
  }): { closedCount: number; closedTabIds: string[] } {
    let tabsToClose: string[] = [];

    if (criteria.excludeActive) {
      const activeTabId = this.window.activeTab?.id;
      tabsToClose = this.window.allTabs
        .filter((tab) => tab.id !== activeTabId)
        .map((tab) => tab.id);
    } else if (criteria.tabIds && criteria.tabIds.length > 0) {
      // Optimized: Filter valid tab IDs in single pass
      const validTabIds = new Set(
        this.window.allTabs.map((tab) => tab.id)
      );
      tabsToClose = criteria.tabIds.filter((id) => validTabIds.has(id));
    } else {
      const matchingTabs = this.window.findTabsByCriteria(criteria);
      tabsToClose = matchingTabs.map((tab) => tab.id);

      // Apply limit if specified (only for non-tabIds criteria)
      if (criteria.limit && tabsToClose.length > criteria.limit) {
        tabsToClose = tabsToClose.slice(0, criteria.limit);
      }
    }

    // Prevent closing all tabs (optimized with Set)
    if (tabsToClose.length >= this.window.tabCount) {
      const activeTabId = this.window.activeTab?.id;
      if (activeTabId) {
        tabsToClose = tabsToClose.filter((id) => id !== activeTabId);
      }
      if (tabsToClose.length === 0) {
        return { closedCount: 0, closedTabIds: [] };
      }
    }

    // Record close events for pattern learning (local only)
    tabsToClose.forEach(tabId => this.recordTabEvent('close', tabId));

    const closedCount = this.window.closeTabs(tabsToClose);
    return { closedCount, closedTabIds: tabsToClose };
  }

  /**
   * Close a single tab by ID
   */
  closeTab(tabId: string): boolean {
    const success = this.window.closeTab(tabId);
    if (success) {
      this.recordTabEvent('close', tabId);
    }
    return success;
  }

  // ============================================================================
  // Tab Navigation & Switching
  // ============================================================================

  /**
   * Switch to a specific tab
   */
  switchToTab(tabId: string): boolean {
    const success = this.window.switchActiveTab(tabId);
    if (success) {
      // Record switch event for pattern learning (local only)
      this.recordTabEvent('switch', tabId);
    }
    return success;
  }

  /**
   * Switch to next tab
   */
  switchToNextTab(): boolean {
    const tabs = this.window.allTabs;
    const activeTabId = this.window.activeTab?.id;
    if (!activeTabId || tabs.length <= 1) return false;

    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    const success = this.window.switchActiveTab(tabs[nextIndex].id);
    if (success) {
      this.recordTabEvent('switch', tabs[nextIndex].id, { fromTabId: activeTabId });
    }
    return success;
  }

  /**
   * Switch to previous tab
   */
  switchToPreviousTab(): boolean {
    const tabs = this.window.allTabs;
    const activeTabId = this.window.activeTab?.id;
    if (!activeTabId || tabs.length <= 1) return false;

    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
    const success = this.window.switchActiveTab(tabs[prevIndex].id);
    if (success) {
      this.recordTabEvent('switch', tabs[prevIndex].id, { fromTabId: activeTabId });
    }
    return success;
  }

  /**
   * Navigate active tab to URL
   */
  navigateActiveTab(url: string): boolean {
    const activeTab = this.window.activeTab;
    if (!activeTab) return false;
    activeTab.loadURL(url);
    return true;
  }

  /**
   * Navigate specific tab to URL
   */
  navigateTab(tabId: string, url: string): boolean {
    const tab = this.window.getTab(tabId);
    if (!tab) return false;
    tab.loadURL(url);
    return true;
  }

  /**
   * Navigate back in active tab
   */
  goBack(): boolean {
    const activeTab = this.window.activeTab;
    if (!activeTab) return false;
    activeTab.goBack();
    return true;
  }

  /**
   * Navigate forward in active tab
   */
  goForward(): boolean {
    const activeTab = this.window.activeTab;
    if (!activeTab) return false;
    activeTab.goForward();
    return true;
  }

  /**
   * Reload active tab
   */
  reload(): boolean {
    const activeTab = this.window.activeTab;
    if (!activeTab) return false;
    activeTab.reload();
    return true;
  }

  /**
   * Reload specific tab
   */
  reloadTab(tabId: string): boolean {
    const tab = this.window.getTab(tabId);
    if (!tab) return false;
    tab.reload();
    return true;
  }

  // ============================================================================
  // Tab Pinning
  // ============================================================================

  /**
   * Pin or unpin tabs
   */
  pinTabs(criteria: {
    tabIds?: string[];
    domain?: string;
    titlePattern?: string;
    urlPattern?: string;
    action: "pin" | "unpin" | "toggle";
  }): { pinnedCount: number; unpinnedCount: number; affectedTabIds: string[] } {
    let tabsToPin: string[] = [];

    if (criteria.tabIds && criteria.tabIds.length > 0) {
      tabsToPin = criteria.tabIds.filter((id) => this.window.getTab(id) !== null);
    } else {
      const matchingTabs = this.window.findTabsByCriteria({
        domain: criteria.domain,
        titlePattern: criteria.titlePattern,
        urlPattern: criteria.urlPattern,
      });
      tabsToPin = matchingTabs.map((tab) => tab.id);
    }

    let pinnedCount = 0;
    let unpinnedCount = 0;

    for (const tabId of tabsToPin) {
      const tab = this.window.getTab(tabId);
      if (!tab) continue;

      if (criteria.action === "pin") {
        if (!tab.pinned) {
          this.window.pinTab(tabId);
          pinnedCount++;
        }
      } else if (criteria.action === "unpin") {
        if (tab.pinned) {
          this.window.unpinTab(tabId);
          unpinnedCount++;
        }
      } else if (criteria.action === "toggle") {
        if (tab.pinned) {
          this.window.unpinTab(tabId);
          unpinnedCount++;
        } else {
          this.window.pinTab(tabId);
          pinnedCount++;
        }
      }
    }

    return { pinnedCount, unpinnedCount, affectedTabIds: tabsToPin };
  }

  /**
   * Pin a single tab
   */
  pinTab(tabId: string): boolean {
    return this.window.pinTab(tabId);
  }

  /**
   * Unpin a single tab
   */
  unpinTab(tabId: string): boolean {
    return this.window.unpinTab(tabId);
  }

  // ============================================================================
  // Tab Groups
  // ============================================================================

  /**
   * Get all tab groups
   */
  getAllGroups(): Array<{
    id: string;
    name: string;
    color: string;
    tabCount: number;
    tabIds: string[];
    collapsed: boolean;
  }> {
    return this.window.allTabGroups.map((group) => ({
      id: group.id,
      name: group.name,
      color: group.color || "blue",
      tabCount: group.tabIds.length,
      tabIds: group.tabIds,
      collapsed: group.collapsed ?? false,
    }));
  }

  /**
   * Get group information
   */
  getGroup(groupId: string): {
    id: string;
    name: string;
    color: string;
    tabCount: number;
    tabIds: string[];
  } | null {
    const group = this.window.getTabGroup(groupId);
    if (!group) return null;

    return {
      id: group.id,
      name: group.name,
      color: group.color || "blue",
      tabCount: group.tabIds.length,
      tabIds: group.tabIds,
    };
  }

  /**
   * Create a tab group
   */
  createGroup(criteria: {
    tabIds?: string[];
    domain?: string;
    titlePattern?: string;
    urlPattern?: string;
    groupName: string;
    color?: "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan";
  }): { groupId: string; tabCount: number } {
    let tabsToGroup: string[] = [];

    if (criteria.tabIds && criteria.tabIds.length > 0) {
      tabsToGroup = criteria.tabIds.filter((id) => this.window.getTab(id) !== null);
    } else {
      const matchingTabs = this.window.findTabsByCriteria({
        domain: criteria.domain,
        titlePattern: criteria.titlePattern,
        urlPattern: criteria.urlPattern,
      });
      tabsToGroup = matchingTabs.map((tab) => tab.id);
    }

    if (tabsToGroup.length === 0) {
      throw new Error("No tabs found matching the criteria to group");
    }

    const groupId = this.window.createTabGroup(
      tabsToGroup,
      criteria.groupName.trim(),
      criteria.color
    );

    // Record group event for pattern learning (local only)
    tabsToGroup.forEach(tabId =>
      this.recordTabEvent('group', tabId, { groupId })
    );

    return { groupId, tabCount: tabsToGroup.length };
  }

  /**
   * Group tabs by semantic category
   */
  groupTabsByCategory(
    category: "social-media" | "social" | "work" | "shopping" | "news" | "entertainment" | "development" | "dev" | "productivity",
    groupName?: string,
    color?: "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan"
  ): { groupId: string; tabCount: number } {
    // Category to domain mappings
    const categoryDomains: Record<string, string[]> = {
      "social-media": ["facebook.com", "twitter.com", "x.com", "instagram.com", "linkedin.com", "reddit.com", "tiktok.com", "snapchat.com", "pinterest.com"],
      "social": ["facebook.com", "twitter.com", "x.com", "instagram.com", "linkedin.com", "reddit.com", "tiktok.com", "snapchat.com", "pinterest.com"],
      "work": ["slack.com", "teams.microsoft.com", "zoom.us", "meet.google.com", "asana.com", "trello.com", "notion.so", "monday.com"],
      "shopping": ["amazon.com", "ebay.com", "etsy.com", "walmart.com", "target.com", "bestbuy.com", "alibaba.com", "shopify.com"],
      "news": ["cnn.com", "bbc.com", "nytimes.com", "reuters.com", "theguardian.com", "washingtonpost.com", "apnews.com", "bloomberg.com"],
      "entertainment": ["youtube.com", "netflix.com", "spotify.com", "twitch.tv", "hulu.com", "disneyplus.com", "primevideo.com"],
      "development": ["github.com", "stackoverflow.com", "gitlab.com", "bitbucket.org", "npmjs.com", "pypi.org", "developer.mozilla.org"],
      "dev": ["github.com", "stackoverflow.com", "gitlab.com", "bitbucket.org", "npmjs.com", "pypi.org", "developer.mozilla.org"],
      "productivity": ["gmail.com", "outlook.com", "calendar.google.com", "docs.google.com", "drive.google.com", "office.com"]
    };

    // Category to display name mappings
    const categoryNames: Record<string, string> = {
      "social-media": "Social Media",
      "social": "Social Media",
      "work": "Work",
      "shopping": "Shopping",
      "news": "News",
      "entertainment": "Entertainment",
      "development": "Development",
      "dev": "Development",
      "productivity": "Productivity"
    };

    const domains = categoryDomains[category];
    if (!domains) {
      throw new Error(`Unknown category: ${category}`);
    }

    // Find tabs matching any of the category domains
    const tabs = this.window.allTabs;
    const matchingTabIds: string[] = [];

    for (const tab of tabs) {
      try {
        const url = new URL(tab.url);
        const hostname = url.hostname.replace(/^www\./, "");

        // Check if tab domain matches any category domain
        if (domains.some(domain => hostname.includes(domain) || domain.includes(hostname))) {
          // Skip if already in a group
          if (!this.window.getTabGroupForTab(tab.id)) {
            matchingTabIds.push(tab.id);
          }
        }
      } catch {
        // Skip invalid URLs
      }
    }

    if (matchingTabIds.length === 0) {
      throw new Error(`No ${categoryNames[category]} tabs found to group`);
    }

    // Use provided group name or default to category name
    const finalGroupName = groupName || categoryNames[category];

    // Auto-assign color if not provided
    const finalColor = color || this.getNextAvailableColor();

    const groupId = this.window.createTabGroup(matchingTabIds, finalGroupName, finalColor);

    // Record group event for pattern learning (local only)
    matchingTabIds.forEach(tabId =>
      this.recordTabEvent('group', tabId, { groupId })
    );

    return { groupId, tabCount: matchingTabIds.length };
  }

  /**
   * Get next available color for groups
   */
  private getNextAvailableColor(): "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" {
    const colors: Array<"blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan"> = ["blue", "red", "yellow", "green", "pink", "purple", "cyan"];
    const usedColors = new Set(this.window.allTabGroups.map(group => group.color));

    for (const color of colors) {
      if (!usedColors.has(color)) {
        return color;
      }
    }
    // If all colors are used, cycle back to the first one
    return colors[0];
  }

  /**
   * Edit a tab group
   */
  editGroup(criteria: {
    groupId: string;
    newName?: string;
    newColor?: "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan";
    collapsed?: boolean;
    tabsToAdd?: string[];
    tabsToRemove?: string[];
    addByDomain?: string;
    addByTitlePattern?: string;
    removeByDomain?: string;
    removeByTitlePattern?: string;
  }): { success: boolean; changes: string[] } {
    const existingGroup = this.window.getTabGroup(criteria.groupId);
    if (!existingGroup) {
      throw new Error(`Tab group with ID '${criteria.groupId}' not found`);
    }

    let tabsToAdd: string[] = criteria.tabsToAdd || [];
    let tabsToRemove: string[] = criteria.tabsToRemove || [];

    // Find tabs to add by criteria
    if (criteria.addByDomain) {
      const tabs = this.window.findTabsByDomain(criteria.addByDomain);
      tabsToAdd.push(...tabs.map((tab) => tab.id));
    }
    if (criteria.addByTitlePattern) {
      const tabs = this.window.findTabsByTitlePattern(criteria.addByTitlePattern);
      tabsToAdd.push(...tabs.map((tab) => tab.id));
    }

    // Find tabs to remove by criteria
    if (criteria.removeByDomain) {
      const group = this.window.getTabGroup(criteria.groupId);
      if (group) {
        const tabsInGroup = this.window.getTabsInGroup(criteria.groupId);
        const tabsToRemoveByDomain = tabsInGroup.filter((tab) => {
          try {
            const url = new URL(tab.url);
            return url.hostname.toLowerCase().includes(criteria.removeByDomain!.toLowerCase());
          } catch {
            return false;
          }
        });
        tabsToRemove.push(...tabsToRemoveByDomain.map((tab) => tab.id));
      }
    }
    if (criteria.removeByTitlePattern) {
      const group = this.window.getTabGroup(criteria.groupId);
      if (group) {
        const tabsInGroup = this.window.getTabsInGroup(criteria.groupId);
        const tabsToRemoveByTitle = tabsInGroup.filter((tab) =>
          tab.title.toLowerCase().includes(criteria.removeByTitlePattern!.toLowerCase())
        );
        tabsToRemove.push(...tabsToRemoveByTitle.map((tab) => tab.id));
      }
    }

    // Validate and deduplicate
    const validTabsToAdd = tabsToAdd
      .filter((id) => this.window.getTab(id) !== null)
      .filter((id) => !existingGroup.tabIds.includes(id));
    tabsToAdd = Array.from(new Set(validTabsToAdd));
    tabsToRemove = Array.from(new Set(tabsToRemove));

    const changes: string[] = [];
    if (criteria.newName && criteria.newName.trim() !== existingGroup.name) {
      changes.push(`name: '${criteria.newName.trim()}'`);
    }
    if (criteria.newColor && criteria.newColor !== existingGroup.color) {
      changes.push(`color: '${criteria.newColor}'`);
    }

    // Debug logging for collapsed state
    console.log('[TabManagementAPI] editGroup collapsed check:', {
      criteriaCollapsed: criteria.collapsed,
      existingCollapsed: existingGroup.collapsed,
      isDifferent: criteria.collapsed !== existingGroup.collapsed,
      groupId: criteria.groupId
    });

    if (criteria.collapsed !== undefined && criteria.collapsed !== existingGroup.collapsed) {
      changes.push(`collapsed: ${criteria.collapsed}`);
    }
    if (tabsToAdd.length > 0) changes.push(`added ${tabsToAdd.length} tab(s)`);
    if (tabsToRemove.length > 0) changes.push(`removed ${tabsToRemove.length} tab(s)`);

    if (changes.length === 0) {
      return { success: false, changes: [] };
    }

    this.window.editTabGroup(
      criteria.groupId,
      criteria.newName?.trim(),
      criteria.newColor,
      tabsToAdd.length > 0 ? tabsToAdd : undefined,
      tabsToRemove.length > 0 ? tabsToRemove : undefined,
      criteria.collapsed
    );

    return { success: true, changes };
  }

  /**
   * Delete a tab group
   */
  deleteGroup(groupId: string): boolean {
    return this.window.deleteTabGroup(groupId);
  }

  /**
   * Toggle group collapse state (Firefox-style)
   */
  toggleGroupCollapse(groupId: string): boolean {
    return this.window.toggleGroupCollapse(groupId);
  }

  /**
   * Move tab to a different group (Firefox-style drag-and-drop)
   */
  moveTabToGroup(tabId: string, targetGroupId: string | null): boolean {
    return this.window.moveTabToGroup(tabId, targetGroupId);
  }

  /**
   * Move tab within group (reorder)
   */
  moveTabInGroup(tabId: string, newIndex: number): boolean {
    return this.window.moveTabInGroup(tabId, newIndex);
  }

  /**
   * Create a new tab directly in a group
   */
  createTabInGroup(url: string | undefined, groupId: string): { id: string; title: string; url: string } {
    const tab = this.window.createTabInGroup(url, groupId);
    // Record event for pattern learning (local only)
    this.recordTabEvent('open', tab.id, { groupId });
    return { id: tab.id, title: tab.title, url: tab.url };
  }

  /**
   * Save and close group (close all tabs but keep group structure)
   */
  saveAndCloseGroup(groupId: string): boolean {
    return this.window.saveAndCloseGroup(groupId);
  }

  /**
   * Ungroup tabs (remove all tabs from a group)
   */
  ungroupTabs(groupId: string): boolean {
    return this.window.ungroupTabs(groupId);
  }

  /**
   * Get all groups with their tabs (for list all tabs menu)
   */
  getAllGroupsWithTabs(): Array<{
    id: string;
    name: string;
    color: string;
    collapsed: boolean;
    tabs: Array<{ id: string; title: string; url: string }>;
  }> {
    return this.window.getAllGroupsWithTabs();
  }

  // ============================================================================
  // Tab Actions
  // ============================================================================

  /**
   * Take screenshot of a tab
   */
  async screenshotTab(tabId: string): Promise<string> {
    const tab = this.window.getTab(tabId);
    if (!tab) {
      throw new Error(`Tab with ID '${tabId}' not found`);
    }
    const image = await tab.screenshot();
    return image.toDataURL();
  }

  /**
   * Execute JavaScript in a tab
   */
  async runJavaScript(tabId: string, code: string): Promise<any> {
    const tab = this.window.getTab(tabId);
    if (!tab) {
      throw new Error(`Tab with ID '${tabId}' not found`);
    }
    return await tab.runJs(code);
  }

  /**
   * Get page text from a tab
   */
  async getTabText(tabId: string): Promise<string> {
    const tab = this.window.getTab(tabId);
    if (!tab) {
      throw new Error(`Tab with ID '${tabId}' not found`);
    }
    return await tab.getTabText();
  }

  /**
   * Get page HTML from a tab
   */
  async getTabHtml(tabId: string): Promise<string> {
    const tab = this.window.getTab(tabId);
    if (!tab) {
      throw new Error(`Tab with ID '${tabId}' not found`);
    }
    return await tab.getTabHtml();
  }

  // ============================================================================
  // Batch Operations & Workflows
  // ============================================================================

  /**
   * Execute multiple operations with intelligent parallelization
   * Operations that don't depend on each other run in parallel for better performance
   */
  async executeWorkflow(operations: Array<{
    type: string;
    params: Record<string, any>;
  }>): Promise<Array<{ type: string; success: boolean; result?: any; error?: string }>> {
    const results: Array<{ type: string; success: boolean; result?: any; error?: string }> = [];

    // Helper to execute a single operation
    const executeOperation = async (op: { type: string; params: Record<string, any> }, index: number) => {
      try {
        let result: any;

        switch (op.type) {
          case "createTab":
            result = this.createTab(op.params.url);
            break;
          case "createTabs":
            // Check if workspaceId is provided, use createTabsInWorkspace if so
            if (op.params.workspaceId) {
              result = this.createTabsInWorkspace(
                op.params.urls as string[],
                op.params.workspaceId,
                op.params.containerId
              );
            } else {
              result = this.createTabs(op.params.urls as string[]);
            }
            break;
          case "closeTabs":
            result = this.closeTabs(op.params);
            break;
          case "switchToTab":
            result = this.switchToTab(op.params.tabId);
            break;
          case "pinTabs":
            result = this.pinTabs(op.params as any);
            break;
          case "createGroup":
          case "createTabGroup":
            result = this.createGroup(op.params as any);
            break;
          case "navigateTab":
            result = this.navigateTab(op.params.tabId, op.params.url);
            break;
          case "moveTabsToWorkspace":
            result = this.moveTabsToWorkspace(op.params.workspaceId, {
              tabIds: op.params.tabIds,
              domain: op.params.domain,
              titlePattern: op.params.titlePattern,
            });
            break;
          case "createTabInWorkspace":
            result = this.createTabInWorkspace(
              op.params.url,
              op.params.workspaceId,
              op.params.containerId
            );
            break;
          case "createWorkspace":
            result = this.createWorkspace(
              op.params.name as string,
              op.params.color as string | undefined,
              op.params.icon as string | undefined,
              op.params.defaultContainerId as string | undefined
            );
            break;
          case "switchWorkspace":
            result = this.switchWorkspace(op.params.workspaceId as string);
            break;
          case "updateWorkspace":
            result = this.updateWorkspace(op.params.workspaceId as string, {
              name: op.params.name as string | undefined,
              color: op.params.color as string | undefined,
              icon: op.params.icon as string | undefined,
              defaultContainerId: op.params.defaultContainerId as string | undefined,
            });
            break;
          case "deleteWorkspace":
            result = this.deleteWorkspace(op.params.workspaceId as string);
            break;
          case "createContainer":
            result = this.createContainer(
              op.params.name as string,
              op.params.color as string | undefined,
              op.params.icon as string | undefined
            );
            break;
          case "assignContainerToTab":
            result = this.assignContainerToTab(
              op.params.tabId as string,
              op.params.containerId as string
            );
            break;
          case "assignContainerToWorkspace":
            result = this.assignContainerToWorkspace(
              op.params.workspaceId as string,
              op.params.containerId as string
            );
            break;
          default:
            throw new Error(`Unknown operation type: ${op.type}`);
        }

        return { index, type: op.type, success: true, result } as any;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { index, type: op.type, success: false, error: errorMsg } as any;
      }
    };

    // Determine which operations can run in parallel
    // Operations that must run sequentially: switchWorkspace, switchToTab (affect state)
    // Operations that can run in parallel: createTab, createTabs, closeTabs, pinTabs, createGroup, etc.
    const sequentialOps = new Set(["switchWorkspace", "switchToTab", "navigateTab"]);

    // Group operations into batches that can run in parallel
    const batches: Array<Array<{ op: typeof operations[0]; index: number }>> = [];
    let currentBatch: Array<{ op: typeof operations[0]; index: number }> = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];

      // If this operation must run sequentially, finalize current batch and start new one
      if (sequentialOps.has(op.type)) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
        }
        // Sequential op gets its own batch
        batches.push([{ op, index: i }]);
      } else {
        // Can run in parallel with others
        currentBatch.push({ op, index: i });
      }
    }

    // Don't forget the last batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    // Execute batches sequentially, but operations within each batch in parallel
    for (const batch of batches) {
      if (batch.length === 1) {
        // Single operation, execute directly
        const result = await executeOperation(batch[0].op, batch[0].index);
        results.push({ type: result.type, success: result.success, result: result.result, error: result.error });
      } else {
        // Multiple operations, execute in parallel
        const batchResults = await Promise.all(
          batch.map(({ op, index }) => executeOperation(op, index))
        );
        // Sort by original index to maintain order
        batchResults.sort((a, b) => a.index - b.index);
        for (const result of batchResults) {
          results.push({ type: result.type, success: result.success, result: result.result, error: result.error });
        }
      }
    }

    return results;
  }

  /**
   * Organize tabs by domain into groups
   */
  organizeTabsByDomain(): {
    createdGroups: number;
    groups: Array<{ groupId: string; domain: string; tabCount: number }>;
  } {
    const tabs = this.window.allTabs;
    const domainMap = new Map<string, string[]>();

    // Group tabs by domain
    for (const tab of tabs) {
      try {
        const url = new URL(tab.url);
        const domain = url.hostname.replace(/^www\./, "");
        if (!domainMap.has(domain)) {
          domainMap.set(domain, []);
        }
        domainMap.get(domain)!.push(tab.id);
      } catch {
        // Skip invalid URLs
      }
    }

    // Create groups for domains with multiple tabs
    const groups: Array<{ groupId: string; domain: string; tabCount: number }> = [];
    for (const [domain, tabIds] of domainMap.entries()) {
      if (tabIds.length > 1) {
        // Check if tabs are already in a group
        const ungroupedTabs = tabIds.filter(
          (id) => this.window.getTabGroupForTab(id) === null
        );
        if (ungroupedTabs.length > 0) {
          const groupId = this.window.createTabGroup(ungroupedTabs, domain, "blue");
          // Record group event for pattern learning (local only)
          ungroupedTabs.forEach(tabId =>
            this.recordTabEvent('group', tabId, { groupId })
          );
          groups.push({ groupId, domain, tabCount: ungroupedTabs.length });
        }
      }
    }

    return { createdGroups: groups.length, groups };
  }

  // ============================================================================
  // Workspace Management
  // ============================================================================

  /**
   * Get all workspaces
   */
  getAllWorkspaces(): Array<{
    id: string;
    name: string;
    icon?: string;
    color?: string;
    tabCount: number;
    defaultContainerId?: string;
  }> {
    const workspaceManager = this.window.workspaceManagerInstance;
    return workspaceManager.getAllWorkspaces().map((ws) => ({
      id: ws.id,
      name: ws.name,
      icon: ws.icon,
      color: ws.color,
      tabCount: ws.tabIds.length,
      defaultContainerId: ws.defaultContainerId,
    }));
  }

  /**
   * Get active workspace
   */
  getActiveWorkspace(): {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    tabCount: number;
    defaultContainerId?: string;
  } | null {
    const workspaceManager = this.window.workspaceManagerInstance;
    const workspace = workspaceManager.getActiveWorkspace();
    if (!workspace) return null;

    return {
      id: workspace.id,
      name: workspace.name,
      icon: workspace.icon,
      color: workspace.color,
      tabCount: workspace.tabIds.length,
      defaultContainerId: workspace.defaultContainerId,
    };
  }

  /**
   * Create a new workspace
   */
  createWorkspace(
    name: string,
    color?: string,
    icon?: string,
    defaultContainerId?: string
  ): { workspaceId: string } {
    const workspaceManager = this.window.workspaceManagerInstance;
    const workspaceId = workspaceManager.createWorkspace(
      name,
      color,
      icon,
      defaultContainerId
    );
    this.notifyWorkspaceChange();
    return { workspaceId };
  }

  private notifyWorkspaceChange(): void {
    const workspaceManager = this.window.workspaceManagerInstance;
    const workspaces = workspaceManager.getAllWorkspaces();
    const activeWorkspace = workspaceManager.getActiveWorkspace();

    // Send workspace update event directly to topbar
    this.window.topBar.view.webContents.send("workspaces-updated", {
      workspaces,
      activeWorkspace,
    });
  }

  /**
   * Switch to a workspace
   */
  switchWorkspace(workspaceId: string): boolean {
    const result = this.window.switchWorkspace(workspaceId);
    if (result) {
      this.notifyWorkspaceChange();
    }
    return result;
  }

  /**
   * Update workspace
   */
  updateWorkspace(
    workspaceId: string,
    updates: {
      name?: string;
      icon?: string;
      color?: string;
      defaultContainerId?: string;
    }
  ): boolean {
    const workspaceManager = this.window.workspaceManagerInstance;
    const result = workspaceManager.updateWorkspace(workspaceId, updates);
    if (result) {
      this.notifyWorkspaceChange();
    }
    return result;
  }

  /**
   * Delete workspace
   */
  deleteWorkspace(workspaceId: string): boolean {
    const workspaceManager = this.window.workspaceManagerInstance;
    const result = workspaceManager.deleteWorkspace(workspaceId);
    if (result) {
      this.notifyWorkspaceChange();
    }
    return result;
  }

  /**
   * Move tabs to workspace
   */
  moveTabsToWorkspace(
    workspaceId: string,
    criteria: {
      tabIds?: string[];
      domain?: string;
      titlePattern?: string;
    }
  ): { movedCount: number } {
    const workspaceManager = this.window.workspaceManagerInstance;
    let movedCount = 0;

    // Find tabs to move
    let tabsToMove: string[] = [];
    if (criteria.tabIds && criteria.tabIds.length > 0) {
      tabsToMove = criteria.tabIds.filter((id) => this.window.getTab(id));
    } else {
      // Use findTabs logic
      const allTabs = this.getAllTabs();
      tabsToMove = allTabs
        .filter((tab) => {
          if (criteria.domain && !tab.url.toLowerCase().includes(criteria.domain.toLowerCase())) {
            return false;
          }
          if (criteria.titlePattern && !tab.title.toLowerCase().includes(criteria.titlePattern.toLowerCase())) {
            return false;
          }
          return true;
        })
        .map((tab) => tab.id);
    }

    for (const tabId of tabsToMove) {
      // Remove from current workspace
      const currentWorkspace = workspaceManager.getWorkspaceForTab(tabId);
      if (currentWorkspace) {
        workspaceManager.removeTabFromWorkspace(currentWorkspace.id, tabId);
      }

      // Add to new workspace
      if (workspaceManager.addTabToWorkspace(workspaceId, tabId)) {
        movedCount++;
      }
    }

    // Trigger tab change notification by switching to active tab
    const activeTab = this.window.activeTab;
    if (activeTab) {
      this.window.switchActiveTab(activeTab.id);
    }
    return { movedCount };
  }

  // ============================================================================
  // Container Management
  // ============================================================================

  /**
   * Get all containers
   */
  getAllContainers(): Array<{
    id: string;
    name: string;
    color?: string;
    icon?: string;
  }> {
    const workspaceManager = this.window.workspaceManagerInstance;
    return workspaceManager.getAllContainers().map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
    }));
  }

  /**
   * Create a new container
   */
  createContainer(name: string, color?: string, icon?: string): {
    containerId: string;
  } {
    const workspaceManager = this.window.workspaceManagerInstance;
    const containerId = workspaceManager.createContainer(name, color, icon);
    return { containerId };
  }

  /**
   * Update container
   */
  updateContainer(
    containerId: string,
    updates: { name?: string; color?: string; icon?: string }
  ): boolean {
    const workspaceManager = this.window.workspaceManagerInstance;
    return workspaceManager.updateContainer(containerId, updates);
  }

  /**
   * Delete container
   */
  deleteContainer(containerId: string): boolean {
    const workspaceManager = this.window.workspaceManagerInstance;
    return workspaceManager.deleteContainer(containerId);
  }

  /**
   * Assign container to tab
   */
  assignContainerToTab(tabId: string, containerId: string): boolean {
    return this.window.assignTabToContainer(tabId, containerId);
  }

  /**
   * Assign container to workspace (as default)
   */
  assignContainerToWorkspace(
    workspaceId: string,
    containerId: string
  ): boolean {
    const workspaceManager = this.window.workspaceManagerInstance;
    return workspaceManager.updateWorkspace(workspaceId, {
      defaultContainerId: containerId,
    });
  }

  // ============================================================================
  // AI-Powered Tab Grouping Suggestions
  // ============================================================================

  /**
   * Suggest related tabs for grouping using local AI
   */
  async suggestTabsForGrouping(
    seedTabIds: string[],
    excludeTabIds: string[] = []
  ): Promise<{ suggestedTabIds: string[]; groupName?: string }> {
    const allTabs = this.getAllTabs();

    // Convert to format expected by AI service
    const tabInfos = allTabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
    }));

    try {
      const suggestion = await this.tabGroupingAI.suggestTabGrouping(
        seedTabIds,
        tabInfos,
        excludeTabIds
      );

      return {
        suggestedTabIds: suggestion.tabIds,
        groupName: suggestion.groupName,
      };
    } catch (error) {
      console.error('[TabManagementAPI] Error suggesting tabs:', error);
      // Fallback to simple domain-based heuristic
      return this.fallbackSuggestTabs(seedTabIds, allTabs, excludeTabIds);
    }
  }

  /**
   * Fallback heuristic for tab suggestions (when AI is unavailable)
   */
  private fallbackSuggestTabs(
    seedTabIds: string[],
    allTabs: Array<{ id: string; title: string; url: string }>,
    excludeTabIds: string[]
  ): { suggestedTabIds: string[]; groupName?: string } {
    // Optimized: Use Sets for O(1) lookups
    const seedTabIdsSet = new Set(seedTabIds);
    const excludeTabIdsSet = new Set(excludeTabIds);
    const seedTabs = allTabs.filter(t => seedTabIdsSet.has(t.id));

    // Extract domains from seed tabs
    const domains = new Set<string>();
    seedTabs.forEach(tab => {
      try {
        const domain = new URL(tab.url).hostname.replace(/^www\./, '');
        domains.add(domain);
      } catch {
        // Invalid URL
      }
    });

    // Find tabs with matching domains (optimized with Set lookups)
    const suggestedTabIds = allTabs
      .filter(tab => {
        if (seedTabIdsSet.has(tab.id) || excludeTabIdsSet.has(tab.id)) {
          return false;
        }
        try {
          const domain = new URL(tab.url).hostname.replace(/^www\./, '');
          return domains.has(domain);
        } catch {
          return false;
        }
      })
      .map(tab => tab.id);

    // Generate simple group name from domain
    const groupName = domains.size > 0
      ? Array.from(domains)[0].charAt(0).toUpperCase() + Array.from(domains)[0].slice(1).replace(/\.(com|org|net|io)$/, '')
      : undefined;

    return { suggestedTabIds, groupName };
  }

  /**
   * Suggest multiple tab groups automatically
   */
  async suggestMultipleGroups(
    excludeTabIds: string[] = []
  ): Promise<Array<{ groupName: string; tabIds: string[]; confidence: number }>> {
    const allTabs = this.getAllTabs();

    const tabInfos = allTabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
    }));

    try {
      const suggestions = await this.tabGroupingAI.suggestMultipleGroups(
        tabInfos,
        excludeTabIds
      );

      return suggestions.map(s => ({
        groupName: s.groupName,
        tabIds: s.tabIds,
        confidence: s.confidence,
      }));
    } catch (error) {
      console.error('[TabManagementAPI] Error suggesting multiple groups:', error);
      return [];
    }
  }

  /**
   * Automatically group ungrouped tabs using AI
   * Enhanced with Knowledge Graph for better semantic understanding
   * This runs in the background and creates groups automatically
   */
  async autoGroupTabs(useKnowledgeGraph: boolean = true): Promise<{ groupsCreated: number }> {
    const allTabs = this.getAllTabs();

    // Get all tabs that are not in groups
    const ungroupedTabs = allTabs.filter(tab => !tab.groupId);

    if (ungroupedTabs.length < 2) {
      return { groupsCreated: 0 }; // Need at least 2 tabs to group
    }

    try {
      // Get AI suggestions for grouping (with Knowledge Graph if enabled)
      const tabInfos = ungroupedTabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
      }));

      const suggestions = await this.tabGroupingAI.suggestMultipleGroups(
        tabInfos,
        [],
        useKnowledgeGraph
      );

      let groupsCreated = 0;

      // Create groups automatically from suggestions
      for (const suggestion of suggestions) {
        // Only create groups with at least 2 tabs and reasonable confidence
        if (suggestion.tabIds.length >= 2 && suggestion.confidence > 0.3) {
          try {
            // Auto-assign color
            const allColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
            const existingGroups = this.getAllGroups();
            const usedColors = existingGroups.map(g => g.color).filter(Boolean) as string[];
            const availableColor = allColors.find(c => !usedColors.includes(c)) || allColors[0];

            const groupId = this.window.createTabGroup(
              suggestion.tabIds,
              suggestion.groupName,
              availableColor
            );
            // Record group event for pattern learning (local only)
            suggestion.tabIds.forEach(tabId =>
              this.recordTabEvent('group', tabId, { groupId })
            );
            groupsCreated++;
          } catch (error) {
            console.error('[TabManagementAPI] Error auto-creating group:', error);
          }
        }
      }

      return { groupsCreated };
    } catch (error) {
      console.error('[TabManagementAPI] Error in auto-grouping:', error);
      return { groupsCreated: 0 };
    }
  }

  /**
   * Get workflow suggestions based on temporal patterns
   * Returns suggestions for workflow recovery, next tabs, etc.
   */
  getWorkflowSuggestions(): Array<{
    type: string;
    message: string;
    suggestedTabIds: string[];
    confidence: number;
    context?: string;
  }> {
    const allTabs = this.getAllTabs();
    const currentTabIds = allTabs
      .filter(tab => tab.isActive || this.window.getTabGroupForTab(tab.id) !== null)
      .slice(0, 5) // Recent/active tabs
      .map(tab => tab.id);

    const allTabIds = allTabs.map(tab => tab.id);

    const suggestions = this.tabGroupingAI.getWorkflowSuggestions(currentTabIds, allTabIds);

    return suggestions.map(s => ({
      type: s.type,
      message: s.message,
      suggestedTabIds: s.suggestedTabs,
      confidence: s.confidence,
      context: s.context
    }));
  }

  /**
   * Get Knowledge Graph statistics
   */
  getKnowledgeGraphStats(): {
    nodeCount: number;
    edgeCount: number;
    patternCount: number;
    avgDegree: number;
  } | null {
    return this.tabGroupingAI.getKnowledgeGraphStats();
  }

  /**
   * Record tab event for temporal pattern mining
   */
  recordTabEvent(
    type: 'open' | 'close' | 'switch' | 'group',
    tabId: string,
    metadata?: { fromTabId?: string; groupId?: string }
  ): void {
    this.tabGroupingAI.recordEvent({
      type,
      tabId,
      timestamp: Date.now(),
      metadata
    });
  }

  /**
   * Process query with intelligent 3-tier routing
   * Tier 1: Pattern Matching (70% of queries, <10ms)
   * Tier 2: T5-Distilled / Mozilla smart-tab-topic (20% of queries, 40-60ms)
   * Tier 3: SLM Router - Phi-3.5-mini (10% of queries, 90-150ms)
   */
  async processIntelligentQuery(query: string): Promise<RoutingResult> {
    const tabs = this.window.allTabs;
    const activeTab = this.window.activeTab;

    return await this.intelligentRouter.routeQuery(
      query,
      tabs,
      { activeTabId: activeTab?.id }
    );
  }

  /**
   * Get routing performance metrics
   */
  getRoutingMetrics() {
    return this.intelligentRouter.getMetrics();
  }

  /**
   * Get device capabilities (GPU, RAM, tier)
   */
  async getDeviceCapabilities() {
    return await this.intelligentRouter.getDeviceCapabilities();
  }

  // ============================================================================
  // Folder Management
  // ============================================================================

  /**
   * Get folders in workspace
   */
  getFoldersInWorkspace(workspaceId: string): Array<{
    id: string;
    name: string;
    tabCount: number;
    parentFolderId?: string;
  }> {
    const workspaceManager = this.window.workspaceManagerInstance;
    return workspaceManager.getFoldersInWorkspace(workspaceId).map((f) => ({
      id: f.id,
      name: f.name,
      tabCount: f.tabIds.length,
      parentFolderId: f.parentFolderId,
    }));
  }

  /**
   * Create folder
   */
  createFolder(
    workspaceId: string,
    name: string,
    parentFolderId?: string
  ): { folderId: string } {
    const workspaceManager = this.window.workspaceManagerInstance;
    const folderId = workspaceManager.createFolder(
      workspaceId,
      name,
      parentFolderId
    );
    return { folderId };
  }

  /**
   * Update folder
   */
  updateFolder(folderId: string, updates: { name?: string }): boolean {
    const workspaceManager = this.window.workspaceManagerInstance;
    return workspaceManager.updateFolder(folderId, updates);
  }

  /**
   * Delete folder
   */
  deleteFolder(folderId: string): boolean {
    const workspaceManager = this.window.workspaceManagerInstance;
    return workspaceManager.deleteFolder(folderId);
  }

  /**
   * Move tabs to folder
   */
  moveTabsToFolder(
    folderId: string,
    criteria: {
      tabIds?: string[];
      domain?: string;
      titlePattern?: string;
    }
  ): { movedCount: number } {
    const workspaceManager = this.window.workspaceManagerInstance;
    let movedCount = 0;

    // Find tabs to move
    let tabsToMove: string[] = [];
    if (criteria.tabIds && criteria.tabIds.length > 0) {
      tabsToMove = criteria.tabIds.filter((id) => this.window.getTab(id));
    } else {
      // Use findTabs logic
      const allTabs = this.getAllTabs();
      tabsToMove = allTabs
        .filter((tab) => {
          if (criteria.domain && !tab.url.toLowerCase().includes(criteria.domain.toLowerCase())) {
            return false;
          }
          if (criteria.titlePattern && !tab.title.toLowerCase().includes(criteria.titlePattern.toLowerCase())) {
            return false;
          }
          return true;
        })
        .map((tab) => tab.id);
    }

    for (const tabId of tabsToMove) {
      // Remove from current folder
      const currentFolder = workspaceManager.getFolderForTab(tabId);
      if (currentFolder) {
        workspaceManager.removeTabFromFolder(currentFolder.id, tabId);
      }

      // Add to new folder
      if (workspaceManager.addTabToFolder(folderId, tabId)) {
        movedCount++;
      }
    }

    // Trigger tab change notification by switching to active tab
    const activeTab = this.window.activeTab;
    if (activeTab) {
      this.window.switchActiveTab(activeTab.id);
    }
    return { movedCount };
  }

  // ============================================================================
  // Enhanced Tab Creation with Workspace/Container Support
  // ============================================================================

  /**
   * Create tab with workspace and container support
   */
  createTabInWorkspace(
    url: string | undefined,
    workspaceId?: string,
    containerId?: string
  ): { id: string; title: string; url: string } {
    const tab = this.window.createTab(url, containerId, workspaceId);
    // Record event for pattern learning (local only)
    this.recordTabEvent('open', tab.id);
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
    };
  }

  /**
   * Process simple commands locally using SLM (fast, no cloud API)
   * Returns null if command is too complex and needs cloud LLM
   */
  public processSimpleCommand(
    command: string
  ): { success: boolean; message: string; needsCloudLLM: boolean } | null {
    const allTabs = this.getAllTabs();
    const tabInfos = allTabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
    }));

    const parsed = this.tabGroupingAI.parseSimpleCommand(command, tabInfos);

    if (!parsed) {
      return { success: false, message: '', needsCloudLLM: true };
    }

    try {
      switch (parsed.action) {
        case 'close': {
          const result = this.closeTabs(parsed.criteria);
          return {
            success: true,
            message: `Closed ${result.closedCount} tab(s).`,
            needsCloudLLM: false,
          };
        }

        case 'open': {
          if (parsed.criteria.url) {
            const result = this.createTab(parsed.criteria.url);
            return {
              success: true,
              message: `Opened tab: ${result.title}`,
              needsCloudLLM: false,
            };
          }
          break;
        }

        case 'closeWorkspace': {
          const activeWorkspace = this.getActiveWorkspace();
          if (activeWorkspace) {
            // Close all tabs in active workspace
            const workspaceTabs = allTabs.filter(tab => tab.workspaceId === activeWorkspace.id);
            const tabIds = workspaceTabs.map(tab => tab.id);
            if (tabIds.length > 0) {
              const result = this.closeTabs({ tabIds });
              return {
                success: true,
                message: `Closed ${result.closedCount} tab(s) in workspace "${activeWorkspace.name}".`,
                needsCloudLLM: false,
              };
            }
          }
          return {
            success: false,
            message: 'No active workspace found.',
            needsCloudLLM: false,
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        needsCloudLLM: false,
      };
    }

    return { success: false, message: 'Could not process command.', needsCloudLLM: true };
  }
}

