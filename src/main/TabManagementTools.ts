import { z } from "zod";
import type { Tool } from "ai";

/**
 * Enhanced Tool Definitions for Tab Management
 * 
 * These tools are designed for LLM function calling and support complex workflows,
 * chaining, and all tab management use cases.
 */

// ============================================================================
// Tab Query & Information Tools
// ============================================================================

export const getTabsTool = {
  description: `Get information about all open tabs. Returns detailed information including IDs, titles, URLs, pin status, group membership, and audio state.
    Use this to understand the current tab state before performing operations.
    Examples: "What tabs do I have open?", "Show me all my tabs", "List all tabs"`,
  inputSchema: z.object({
    includeDetails: z
      .boolean()
      .optional()
      .describe("If true, includes additional details like navigation history state. Defaults to false."),
  }),
} satisfies Tool;

export const getActiveTabTool = {
  description: `Get information about the currently active tab. Returns ID, title, URL, pin status, group, and navigation state.
    Use this when you need to know what tab the user is currently viewing.
    Examples: "What tab am I on?", "What's the current tab?", "Show me the active tab"`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

export const findTabsTool = {
  description: `Find tabs matching specific criteria. Supports multiple search criteria can be combined.
    Use this to locate specific tabs before performing operations on them.
    Examples: "Find all LinkedIn tabs", "Find tabs with 'project' in the title", "Find pinned tabs"`,
  inputSchema: z.object({
    tabIds: z
      .array(z.string())
      .optional()
      .describe("Specific tab IDs to find. Use when you know exact IDs."),
    domain: z
      .string()
      .optional()
      .describe("Find tabs from this domain (e.g., 'linkedin.com', 'github.com'). Partial matches work."),
    titlePattern: z
      .string()
      .optional()
      .describe("Find tabs whose title contains this pattern (case-insensitive)."),
    urlPattern: z
      .string()
      .optional()
      .describe("Find tabs whose URL contains this pattern (case-insensitive)."),
    isPinned: z
      .boolean()
      .optional()
      .describe("Filter by pin status. true for pinned, false for unpinned."),
    isActive: z
      .boolean()
      .optional()
      .describe("Filter by active status. true for active tab, false for inactive tabs."),
    playingAudio: z
      .boolean()
      .optional()
      .describe("Filter by audio state. true for tabs playing audio, false for silent tabs."),
    groupId: z
      .string()
      .optional()
      .describe("Find tabs in a specific group by group ID."),
  }),
} satisfies Tool;

export const getTabStatsTool = {
  description: `Get statistics about open tabs. Returns counts of total tabs, pinned tabs, grouped tabs, tabs playing audio, and number of groups.
    Use this to get an overview of the tab state.
    Examples: "How many tabs do I have?", "Show me tab statistics", "What's my tab count?"`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

// ============================================================================
// Tab Creation & Deletion Tools
// ============================================================================

export const createTabTool = {
  description: `Create a new browser tab. If URL is provided, loads that URL; otherwise opens a default new tab page.
    Examples: "Open a new tab", "Create a tab with google.com", "Open github.com in a new tab"`,
  inputSchema: z.object({
    url: z
      .string()
      .optional()
      .describe("The URL to load in the new tab. If not provided, opens a default new tab page."),
  }),
} satisfies Tool;

export const createTabsTool = {
  description: `Create multiple tabs at once. Useful for opening several URLs simultaneously.
    Examples: "Open tabs for google.com, github.com, and stackoverflow.com", "Create tabs for these URLs"`,
  inputSchema: z.object({
    urls: z
      .array(z.string())
      .describe("Array of URLs to open in new tabs. Each URL will open in a separate tab."),
  }),
} satisfies Tool;

export const closeTabsTool = {
  description: `Close tabs based on various criteria. Supports closing by domain, title pattern, URL pattern, tab IDs, or special conditions.
    IMPORTANT: If you need to close a specific number of tabs (e.g., "close 3 LinkedIn tabs"):
    - Use the limit parameter to close only N matching tabs
    - Example: { domain: "linkedin.com", limit: 3 } closes only 3 LinkedIn tabs
    
    Examples: 
    - "Close all my LinkedIn tabs" → Use domain: "linkedin.com" (no limit)
    - "Close 3 LinkedIn tabs" → Use domain: "linkedin.com", limit: 3
    - "Close 5 tabs with 'project' in the title" → Use titlePattern: "project", limit: 5
    - "Close all tabs except this one" → Use excludeActive: true
    - "Close tabs with 'project x' in the title" → Use titlePattern: "project x"
    - "Close the tab playing music" → Use playingAudio: true`,
  inputSchema: z.object({
    tabIds: z
      .array(z.string())
      .optional()
      .describe("Specific tab IDs to close. Use when you know exact tab IDs. Limit parameter is ignored when tabIds is provided."),
    domain: z
      .string()
      .optional()
      .describe("Close all tabs from this domain (e.g., 'linkedin.com', 'amazon.com'). Partial matches work. Use with limit to close only N tabs."),
    titlePattern: z
      .string()
      .optional()
      .describe("Close tabs whose title contains this pattern (case-insensitive). Use with limit to close only N tabs."),
    urlPattern: z
      .string()
      .optional()
      .describe("Close tabs whose URL contains this pattern (case-insensitive). Use with limit to close only N tabs."),
    excludeActive: z
      .boolean()
      .optional()
      .describe("If true, closes all tabs except the currently active one. Useful for 'close all tabs except this one'."),
    playingAudio: z
      .boolean()
      .optional()
      .describe("If true, closes tabs that are currently playing audio/music. Use for 'close the tab playing music'."),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum number of tabs to close. When using domain/titlePattern/urlPattern, only closes up to this many matching tabs. If not specified, closes all matching tabs. Ignored when tabIds is provided."),
  }),
} satisfies Tool;

// ============================================================================
// Tab Navigation & Switching Tools
// ============================================================================

export const switchToTabTool = {
  description: `Switch to a specific tab by ID. Makes that tab active and visible.
    Examples: "Switch to tab tab-1", "Go to the LinkedIn tab", "Activate tab tab-3"`,
  inputSchema: z.object({
    tabId: z.string().describe("The ID of the tab to switch to."),
  }),
} satisfies Tool;

export const switchToNextTabTool = {
  description: `Switch to the next tab in the tab bar. Cycles to the first tab if currently on the last tab.
    Examples: "Go to next tab", "Switch to next", "Next tab"`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

export const switchToPreviousTabTool = {
  description: `Switch to the previous tab in the tab bar. Cycles to the last tab if currently on the first tab.
    Examples: "Go to previous tab", "Switch to previous", "Previous tab"`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

export const navigateTabTool = {
  description: `Navigate a specific tab to a URL. Can navigate the active tab or any tab by ID.
    Examples: "Navigate to google.com", "Go to github.com in tab tab-2", "Load stackoverflow.com"`,
  inputSchema: z.object({
    tabId: z
      .string()
      .optional()
      .describe("The ID of the tab to navigate. If not provided, navigates the active tab."),
    url: z.string().describe("The URL to navigate to."),
  }),
} satisfies Tool;

export const goBackTool = {
  description: `Navigate back in the browser history of the active tab.
    Examples: "Go back", "Back", "Previous page"`,
  inputSchema: z.object({
    tabId: z
      .string()
      .optional()
      .describe("The ID of the tab to go back in. If not provided, uses the active tab."),
  }),
} satisfies Tool;

export const goForwardTool = {
  description: `Navigate forward in the browser history of the active tab.
    Examples: "Go forward", "Forward", "Next page"`,
  inputSchema: z.object({
    tabId: z
      .string()
      .optional()
      .describe("The ID of the tab to go forward in. If not provided, uses the active tab."),
  }),
} satisfies Tool;

export const reloadTabTool = {
  description: `Reload/refresh a tab. Reloads the current page in the specified tab.
    Examples: "Reload this tab", "Refresh tab tab-2", "Reload"`,
  inputSchema: z.object({
    tabId: z
      .string()
      .optional()
      .describe("The ID of the tab to reload. If not provided, reloads the active tab."),
  }),
} satisfies Tool;

// ============================================================================
// Tab Pinning Tools
// ============================================================================

export const pinTabsTool = {
  description: `Pin or unpin tabs. Pinned tabs are smaller, show only the favicon, and stay at the beginning of the tab bar.
    Supports pinning/unpinning by domain, title pattern, URL pattern, or specific tab IDs.
    Examples: "Pin this tab", "Pin all LinkedIn tabs", "Unpin all tabs", "Pin tabs with 'project x' in the title"`,
  inputSchema: z.object({
    tabIds: z
      .array(z.string())
      .optional()
      .describe("Specific tab IDs to pin/unpin. Use when you know exact tab IDs."),
    domain: z
      .string()
      .optional()
      .describe("Pin/unpin all tabs from this domain (e.g., 'linkedin.com', 'github.com'). Partial matches work."),
    titlePattern: z
      .string()
      .optional()
      .describe("Pin/unpin tabs whose title contains this pattern (case-insensitive)."),
    urlPattern: z
      .string()
      .optional()
      .describe("Pin/unpin tabs whose URL contains this pattern (case-insensitive)."),
    action: z
      .enum(["pin", "unpin", "toggle"])
      .describe("The action to perform: 'pin' to pin tabs, 'unpin' to unpin tabs, 'toggle' to toggle pin state."),
  }),
} satisfies Tool;

// ============================================================================
// Tab Group Tools
// ============================================================================

export const getTabGroupsTool = {
  description: `Get information about all tab groups. Returns group IDs, names, colors, and tab counts.
    Examples: "Show me all tab groups", "What groups do I have?", "List my tab groups"`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

export const createTabGroupTool = {
  description: `Create a new tab group from existing tabs. You can specify tabs by domain, title pattern, URL pattern, or specific tab IDs.
    Examples: "Group all my Pinterest tabs", "Create a tab group with all tabs related to project x", "Group tabs with 'research' in the title"`,
  inputSchema: z.object({
    tabIds: z
      .array(z.string())
      .optional()
      .describe("Specific tab IDs to include in the group. Use when you know exact tab IDs."),
    domain: z
      .string()
      .optional()
      .describe("Include all tabs from this domain (e.g., 'pinterest.com', 'github.com'). Partial matches work."),
    titlePattern: z
      .string()
      .optional()
      .describe("Include tabs whose title contains this pattern (case-insensitive). Useful for grouping by topic like 'project x'."),
    urlPattern: z
      .string()
      .optional()
      .describe("Include tabs whose URL contains this pattern (case-insensitive)."),
    groupName: z.string().describe("The name for the new tab group (e.g., 'Project X', 'Shopping', 'Research')."),
    color: z
      .enum(["blue", "red", "yellow", "green", "pink", "purple", "cyan"])
      .optional()
      .describe("The color for the tab group. Defaults to blue if not specified."),
  }),
} satisfies Tool;

export const toggleGroupCollapseTool = {
  description: `Toggle the collapse/expand state of a tab group. When collapsed, tabs in the group are hidden (except the active tab) to reduce clutter.
    Examples: "Collapse the Shopping group", "Expand my Research tabs", "Toggle collapse for group X"`,
  inputSchema: z.object({
    groupId: z.string().describe("ID of the tab group to toggle collapse state."),
  }),
} satisfies Tool;

export const moveTabToGroupTool = {
  description: `Move a tab to a different group or remove it from a group. Supports drag-and-drop style tab organization.
    Examples: "Move this tab to the Shopping group", "Remove tab from group", "Move tab X to group Y"`,
  inputSchema: z.object({
    tabId: z.string().describe("ID of the tab to move."),
    targetGroupId: z
      .string()
      .nullable()
      .optional()
      .describe("ID of the target group. Use null to remove from group."),
  }),
} satisfies Tool;

export const reorderTabInGroupTool = {
  description: `Reorder a tab within its group. Changes the position of the tab in the group.
    Examples: "Move tab to the front of the group", "Reorder tab X to position 2"`,
  inputSchema: z.object({
    tabId: z.string().describe("ID of the tab to reorder."),
    newIndex: z
      .number()
      .int()
      .min(0)
      .describe("New position index within the group (0-based)."),
  }),
} satisfies Tool;

export const editTabGroupTool = {
  description: `Edit an existing tab group. Allows changes to name, color, or tabs. You can add or remove tabs by various criteria.
    Examples: "Rename group group-1 to 'Work'", "Add all GitHub tabs to group group-2", "Remove tabs with 'old' in title from group group-3"`,
  inputSchema: z.object({
    groupId: z.string().describe("The ID of the tab group to edit."),
    newName: z
      .string()
      .optional()
      .describe("The new name for the tab group."),
    newColor: z
      .enum(["blue", "red", "yellow", "green", "pink", "purple", "cyan"])
      .optional()
      .describe("The new color for the tab group."),
    collapsed: z
      .boolean()
      .optional()
      .describe("Set the collapse state of the group. true = collapsed, false = expanded."),
    tabsToAdd: z
      .array(z.string())
      .optional()
      .describe("An array of specific tab IDs to add to the group."),
    tabsToRemove: z
      .array(z.string())
      .optional()
      .describe("An array of specific tab IDs to remove from the group."),
    addByDomain: z
      .string()
      .optional()
      .describe("Add all tabs from this domain to the group."),
    addByTitlePattern: z
      .string()
      .optional()
      .describe("Add all tabs whose title contains this pattern to the group."),
    removeByDomain: z
      .string()
      .optional()
      .describe("Remove all tabs from this domain from the group."),
    removeByTitlePattern: z
      .string()
      .optional()
      .describe("Remove all tabs whose title contains this pattern from the group."),
  }),
} satisfies Tool;

export const deleteTabGroupTool = {
  description: `Delete a tab group. The tabs remain open but are no longer grouped.
    Examples: "Delete group group-1", "Remove tab group group-2", "Ungroup group group-3"`,
  inputSchema: z.object({
    groupId: z.string().describe("The ID of the tab group to delete."),
  }),
} satisfies Tool;

export const createTabInGroupTool = {
  description: `Create a new tab directly in a specific group. The tab will be added to the group immediately.
    Examples: "Create a tab in the Shopping group", "Add new tab to group group-1", "Open a tab in my Work group"`,
  inputSchema: z.object({
    groupId: z.string().describe("ID of the group to add the tab to."),
    url: z
      .string()
      .optional()
      .describe("URL for the new tab. If not provided, opens a new tab page."),
  }),
} satisfies Tool;

export const saveAndCloseGroupTool = {
  description: `Close all tabs in a group but keep the group structure for later restoration. This helps free up space while preserving the group.
    Examples: "Save and close the Shopping group", "Close all tabs in group group-1", "Archive group group-2"`,
  inputSchema: z.object({
    groupId: z.string().describe("ID of the group to save and close."),
  }),
} satisfies Tool;

export const ungroupTabsTool = {
  description: `Remove all tabs from a group, effectively ungrouping them. The tabs remain open but are no longer grouped together.
    Examples: "Ungroup tabs in group group-1", "Remove grouping from group group-2", "Break up group group-3"`,
  inputSchema: z.object({
    groupId: z.string().describe("ID of the group to ungroup."),
  }),
} satisfies Tool;

// ============================================================================
// Tab Action Tools
// ============================================================================

export const screenshotTabTool = {
  description: `Capture a screenshot of a tab. Returns the screenshot as a data URL.
    Examples: "Take a screenshot of this tab", "Screenshot tab tab-2", "Capture the current tab"`,
  inputSchema: z.object({
    tabId: z
      .string()
      .optional()
      .describe("The ID of the tab to screenshot. If not provided, screenshots the active tab."),
  }),
} satisfies Tool;

export const runJavaScriptTool = {
  description: `Execute JavaScript code in a tab. Useful for interacting with page content or extracting information.
    Examples: "Run JavaScript in this tab", "Execute code in tab tab-2"`,
  inputSchema: z.object({
    tabId: z
      .string()
      .optional()
      .describe("The ID of the tab to run JavaScript in. If not provided, uses the active tab."),
    code: z.string().describe("The JavaScript code to execute."),
  }),
} satisfies Tool;

// ============================================================================
// Workflow & Batch Operation Tools
// ============================================================================

// Define a simplified schema for workflow parameters to avoid recursion issues
const jsonValueSchema = z.any();

export const executeWorkflowTool = {
  description: `Execute multiple tab operations in sequence. Supports chaining operations for complex workflows.
    Examples: "Create tabs for google.com and github.com, then group them", "Close all LinkedIn tabs and open a new tab"`,
  inputSchema: z.object({
    operations: z
      .array(
        z.object({
          type: z
            .enum([
              "createTab",
              "createTabs",
              "createTabInWorkspace",
              "closeTabs",
              "switchToTab",
              "pinTabs",
              "createGroup",
              "createTabGroup",
              "navigateTab",
              "moveTabsToWorkspace",
              "createWorkspace",
              "switchWorkspace",
              "updateWorkspace",
              "deleteWorkspace",
              "createContainer",
              "assignContainerToTab",
              "assignContainerToWorkspace",
            ])
            .describe("The type of operation to perform."),
          params: z
            .record(z.string(), jsonValueSchema)
            .optional()
            .describe("Parameters for the operation, matching the schema of the corresponding tool."),
        })
      )
      .describe("Array of operations to execute in sequence."),
  }),
} satisfies Tool;

export const organizeTabsByDomainTool = {
  description: `Automatically organize tabs by domain into groups. Groups tabs from the same domain together.
    Examples: "Organize my tabs by domain", "Group tabs by website", "Auto-organize tabs"`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

export const smartGroupTabsTool = {
  description: `Intelligently group tabs using local AI analysis. This tool uses a local AI model to analyze tab content (titles, URLs, domains) and automatically suggest related tabs to group together. Much faster than API-based grouping and works offline.
    Use this when users ask to "group my tabs", "organize my tabs", "auto-group tabs", or "intelligently group related tabs".
    Examples: "Group my tabs", "Organize my tabs automatically", "Create groups for related tabs", "Auto-group all my tabs", "Intelligently group my tabs"`,
  inputSchema: z.object({
    useAI: z
      .boolean()
      .optional()
      .default(true)
      .describe("Use local AI to intelligently group tabs. If false, uses simple domain-based grouping. Defaults to true."),
    minTabsPerGroup: z
      .number()
      .optional()
      .default(2)
      .describe("Minimum number of tabs required to create a group. Defaults to 2."),
    confidenceThreshold: z
      .number()
      .optional()
      .default(0.3)
      .describe("Minimum confidence score (0-1) for creating a group. Defaults to 0.3."),
  }),
} satisfies Tool;

export const getWorkflowSuggestionsTool = {
  description: `Get AI-powered workflow suggestions based on your tab usage patterns. This uses temporal pattern mining to suggest:
    - Tabs you often open together (workflow recovery)
    - Next tabs in a sequence you're following
    - Time-based routines (morning/afternoon workflows)
    
    Use this when users ask about their habits, routines, or want suggestions for what to open next.
    Examples: "What tabs do I usually open together?", "Suggest my next tabs", "What's my morning routine?", "Show me my workflow patterns"`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

export const getKnowledgeGraphStatsTool = {
  description: `Get statistics about the Knowledge Graph that analyzes semantic relationships between your tabs. Shows:
    - Number of nodes (tabs) and edges (relationships)
    - Clustering information
    - Semantic connections discovered
    
    Use this when users ask about how their tabs are related or want to see the AI's understanding of their browsing.
    Examples: "How are my tabs related?", "Show me tab relationships", "What does the AI know about my tabs?", "Show knowledge graph stats"`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

export const groupTabsByCategoryTool = {
  description: `Group tabs by semantic category without asking questions. Automatically detects tabs belonging to common categories.
    Categories:
    - "social-media" or "social": Facebook, Twitter, Instagram, LinkedIn, Reddit, TikTok, Snapchat, Pinterest
    - "work": Slack, Teams, Zoom, Google Meet, Asana, Trello, Notion, Monday
    - "shopping": Amazon, eBay, Etsy, Walmart, Target, Best Buy, Alibaba
    - "news": CNN, BBC, NY Times, Reuters, The Guardian, Washington Post
    - "entertainment": YouTube, Netflix, Spotify, Twitch, Hulu, Disney+
    - "development" or "dev": GitHub, Stack Overflow, GitLab, Bitbucket, npm, PyPI
    - "productivity": Gmail, Outlook, Google Calendar, Google Docs, Google Drive
    
    Use this when users say "group all social media tabs", "group work tabs", "organize shopping tabs", etc.
    Examples: "Group all social media tabs together", "Group my work tabs", "Organize development tabs", "Group shopping tabs"`,
  inputSchema: z.object({
    category: z
      .enum(["social-media", "social", "work", "shopping", "news", "entertainment", "development", "dev", "productivity"])
      .describe("The semantic category to group tabs by."),
    groupName: z
      .string()
      .optional()
      .describe("Optional custom name for the group. If not provided, uses category name (e.g., 'Social Media')."),
    color: z
      .enum(["blue", "red", "yellow", "green", "pink", "purple", "cyan"])
      .optional()
      .describe("Optional color for the group. If not provided, auto-assigns a color."),
  }),
} satisfies Tool;

// ============================================================================
// Workspace Management Tools
// ============================================================================

export const getWorkspacesTool = {
  description: `Get all workspaces. Workspaces organize tabs into distinct project/task contexts.
    Examples: "Show me my workspaces", "List all workspaces", "What workspaces do I have?"`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

export const getActiveWorkspaceTool = {
  description: `Get the currently active workspace. The active workspace determines which tabs are visible.
    Examples: "What workspace am I in?", "Show me the current workspace", "Which workspace is active?"`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

export const createWorkspaceTool = {
  description: `Create a new workspace. Workspaces help organize tabs by project, task, or context.
    Examples: "Create a workspace called Work", "Make a new workspace for my project", "Add a Personal workspace"`,
  inputSchema: z.object({
    name: z.string().describe("Name of the workspace to create."),
    color: z
      .string()
      .optional()
      .describe("Color for the workspace (e.g., 'blue', 'red', 'green')."),
    icon: z
      .string()
      .optional()
      .describe("Icon identifier for the workspace (optional)."),
    defaultContainerId: z
      .string()
      .optional()
      .describe("Optional default container ID to assign to this workspace."),
  }),
} satisfies Tool;

export const switchWorkspaceTool = {
  description: `Switch to a different workspace. This changes which tabs are visible.
    Examples: "Switch to Work workspace", "Go to Personal workspace", "Open the Research workspace"`,
  inputSchema: z.object({
    workspaceId: z.string().describe("ID of the workspace to switch to."),
  }),
} satisfies Tool;

export const updateWorkspaceTool = {
  description: `Update workspace properties like name, color, icon, or default container.
    Examples: "Rename Work workspace to Office", "Change workspace color to red"`,
  inputSchema: z.object({
    workspaceId: z.string().describe("ID of the workspace to update."),
    name: z.string().optional().describe("New name for the workspace."),
    color: z.string().optional().describe("New color for the workspace."),
    icon: z.string().optional().describe("New icon for the workspace."),
    defaultContainerId: z
      .string()
      .optional()
      .describe("New default container ID for the workspace."),
  }),
} satisfies Tool;

export const deleteWorkspaceTool = {
  description: `Delete a workspace. Cannot delete the last remaining workspace.
    Examples: "Delete the Old Project workspace", "Remove workspace X"`,
  inputSchema: z.object({
    workspaceId: z.string().describe("ID of the workspace to delete."),
  }),
} satisfies Tool;

export const moveTabsToWorkspaceTool = {
  description: `Move tabs to a different workspace. Useful for organizing tabs across workspaces.
    Examples: "Move these tabs to Work workspace", "Put LinkedIn tabs in Personal workspace"`,
  inputSchema: z.object({
    workspaceId: z.string().describe("ID of the target workspace."),
    tabIds: z
      .array(z.string())
      .optional()
      .describe("Specific tab IDs to move. If not provided, uses other criteria."),
    domain: z
      .string()
      .optional()
      .describe("Move all tabs from this domain (e.g., 'linkedin.com')."),
    titlePattern: z
      .string()
      .optional()
      .describe("Move tabs whose title contains this pattern."),
  }),
} satisfies Tool;

// ============================================================================
// Container Management Tools
// ============================================================================

export const getContainersTool = {
  description: `Get all containers. Containers provide session isolation (separate cookies/storage).
    Examples: "Show me my containers", "List all containers", "What containers are available?"`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

export const createContainerTool = {
  description: `Create a new container. Containers enable multiple simultaneous logins to the same sites.
    Examples: "Create a Work container", "Make a Personal container", "Add container for client accounts"`,
  inputSchema: z.object({
    name: z.string().describe("Name of the container to create."),
    color: z
      .string()
      .optional()
      .describe("Color for the container (e.g., 'blue', 'red', 'green')."),
    icon: z
      .string()
      .optional()
      .describe("Icon identifier for the container (optional)."),
  }),
} satisfies Tool;

export const updateContainerTool = {
  description: `Update container properties like name, color, or icon.
    Examples: "Rename container to Client A", "Change container color"`,
  inputSchema: z.object({
    containerId: z.string().describe("ID of the container to update."),
    name: z.string().optional().describe("New name for the container."),
    color: z.string().optional().describe("New color for the container."),
    icon: z.string().optional().describe("New icon for the container."),
  }),
} satisfies Tool;

export const deleteContainerTool = {
  description: `Delete a container. Cannot delete the default container.
    Examples: "Delete the Old Container", "Remove container X"`,
  inputSchema: z.object({
    containerId: z.string().describe("ID of the container to delete."),
  }),
} satisfies Tool;

export const assignContainerToTabTool = {
  description: `Assign a container to a tab. This isolates the tab's session (cookies/storage).
    Examples: "Put this tab in Work container", "Assign Personal container to tab X"`,
  inputSchema: z.object({
    tabId: z.string().describe("ID of the tab to assign container to."),
    containerId: z.string().describe("ID of the container to assign."),
  }),
} satisfies Tool;

export const assignContainerToWorkspaceTool = {
  description: `Assign a default container to a workspace. New tabs in the workspace will use this container.
    Examples: "Set Work container as default for Work workspace", "Assign Personal container to workspace"`,
  inputSchema: z.object({
    workspaceId: z.string().describe("ID of the workspace."),
    containerId: z.string().describe("ID of the container to assign as default."),
  }),
} satisfies Tool;

// ============================================================================
// Folder Management Tools
// ============================================================================

export const getFoldersInWorkspaceTool = {
  description: `Get all folders in a workspace. Folders provide hierarchical grouping within workspaces.
    Examples: "Show folders in Work workspace", "List folders", "What folders are in this workspace?"`,
  inputSchema: z.object({
    workspaceId: z.string().describe("ID of the workspace to get folders from."),
  }),
} satisfies Tool;

export const createFolderTool = {
  description: `Create a folder in a workspace. Folders help organize tabs hierarchically.
    Examples: "Create Documentation folder", "Make a Development folder in Work workspace"`,
  inputSchema: z.object({
    workspaceId: z.string().describe("ID of the workspace to create folder in."),
    name: z.string().describe("Name of the folder to create."),
    parentFolderId: z
      .string()
      .optional()
      .describe("Optional parent folder ID for nested folders."),
  }),
} satisfies Tool;

export const updateFolderTool = {
  description: `Update folder properties like name.
    Examples: "Rename folder to New Name", "Update folder X"`,
  inputSchema: z.object({
    folderId: z.string().describe("ID of the folder to update."),
    name: z.string().optional().describe("New name for the folder."),
  }),
} satisfies Tool;

export const deleteFolderTool = {
  description: `Delete a folder. Tabs in the folder are not deleted, just removed from the folder.
    Examples: "Delete Documentation folder", "Remove folder X"`,
  inputSchema: z.object({
    folderId: z.string().describe("ID of the folder to delete."),
  }),
} satisfies Tool;

export const moveTabsToFolderTool = {
  description: `Move tabs to a folder. Useful for organizing tabs within a workspace.
    Examples: "Move these tabs to Documentation folder", "Put tabs in Development folder"`,
  inputSchema: z.object({
    folderId: z.string().describe("ID of the target folder."),
    tabIds: z
      .array(z.string())
      .optional()
      .describe("Specific tab IDs to move. If not provided, uses other criteria."),
    domain: z
      .string()
      .optional()
      .describe("Move all tabs from this domain (e.g., 'github.com')."),
    titlePattern: z
      .string()
      .optional()
      .describe("Move tabs whose title contains this pattern."),
  }),
} satisfies Tool;

// ============================================================================
// Tool Registry
// ============================================================================

export const TAB_MANAGEMENT_TOOLS = {
  // Query & Information
  getTabs: getTabsTool,
  getActiveTab: getActiveTabTool,
  findTabs: findTabsTool,
  getTabStats: getTabStatsTool,

  // Creation & Deletion
  createTab: createTabTool,
  createTabs: createTabsTool,
  closeTabs: closeTabsTool,

  // Navigation & Switching
  switchToTab: switchToTabTool,
  switchToNextTab: switchToNextTabTool,
  switchToPreviousTab: switchToPreviousTabTool,
  navigateTab: navigateTabTool,
  goBack: goBackTool,
  goForward: goForwardTool,
  reloadTab: reloadTabTool,

  // Pinning
  pinTabs: pinTabsTool,

  // Groups
  getTabGroups: getTabGroupsTool,
  createTabGroup: createTabGroupTool,
  editTabGroup: editTabGroupTool,
  deleteTabGroup: deleteTabGroupTool,
  toggleGroupCollapse: toggleGroupCollapseTool,
  moveTabToGroup: moveTabToGroupTool,
  reorderTabInGroup: reorderTabInGroupTool,
  createTabInGroup: createTabInGroupTool,
  saveAndCloseGroup: saveAndCloseGroupTool,
  ungroupTabs: ungroupTabsTool,

  // Actions
  screenshotTab: screenshotTabTool,
  runJavaScript: runJavaScriptTool,

  // Workflows
  executeWorkflow: executeWorkflowTool,
  organizeTabsByDomain: organizeTabsByDomainTool,
  smartGroupTabs: smartGroupTabsTool,
  getWorkflowSuggestions: getWorkflowSuggestionsTool,
  getKnowledgeGraphStats: getKnowledgeGraphStatsTool,
  groupTabsByCategory: groupTabsByCategoryTool,

  // Workspaces
  getWorkspaces: getWorkspacesTool,
  getActiveWorkspace: getActiveWorkspaceTool,
  createWorkspace: createWorkspaceTool,
  switchWorkspace: switchWorkspaceTool,
  updateWorkspace: updateWorkspaceTool,
  deleteWorkspace: deleteWorkspaceTool,
  moveTabsToWorkspace: moveTabsToWorkspaceTool,

  // Containers
  getContainers: getContainersTool,
  createContainer: createContainerTool,
  updateContainer: updateContainerTool,
  deleteContainer: deleteContainerTool,
  assignContainerToTab: assignContainerToTabTool,
  assignContainerToWorkspace: assignContainerToWorkspaceTool,

  // Folders
  getFoldersInWorkspace: getFoldersInWorkspaceTool,
  createFolder: createFolderTool,
  updateFolder: updateFolderTool,
  deleteFolder: deleteFolderTool,
  moveTabsToFolder: moveTabsToFolderTool,
} as const;

