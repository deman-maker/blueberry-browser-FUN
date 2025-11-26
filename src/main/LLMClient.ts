import { WebContents } from "electron";
import {
  streamText,
  type LanguageModel,
  type CoreMessage,
  type Tool,
  type ToolCallPart,
  type ToolResultPart,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import * as dotenv from "dotenv";
import { join } from "path";
import { Window } from "./Window";
import { TabManagementAPI } from "./TabManagementAPI";
import { TAB_MANAGEMENT_TOOLS } from "./TabManagementTools";
import { z } from "zod";

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, "../../.env") });

interface ChatRequest {
  message: string;
  messageId: string;
}

interface RoutingInfo {
  route: 'pattern' | 't5' | 'slm' | 'gemini' | 'fallback' | 'direct_llm';
  latency: number;
  confidence: number;
  model?: string;
  reasoning?: string;
}

interface StreamChunk {
  content: string;
  isComplete: boolean;
  routingInfo?: RoutingInfo;
}

type LLMProvider = "openai" | "anthropic" | "google";

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-20241022",
  google: "gemini-2.5-pro", // Stable version (GA since June 17, 2025)
};

const MAX_CONTEXT_LENGTH = 4000;
const DEFAULT_TEMPERATURE = 0.7;

// --- Tool Definitions (AI SDK v5 Schema) ---
// Using enhanced tools from TabManagementTools + page analysis tools

const getPageSummaryTool = {
  description: `Provides a detailed summary of the currently active page. Use this when users ask about the page content, want to understand what's on the page, or need a summary of the current webpage.
    Examples: "What's on this page?", "Summarize this page", "Tell me about this page", "What does this page contain?".
    This tool analyzes the page text and provides a comprehensive summary without modifying any tabs.`,
  inputSchema: z.object({
    includeDetails: z
      .boolean()
      .optional()
      .describe("If true, includes more detailed information about the page structure and content. Defaults to false for a concise summary."),
  }),
} satisfies Tool;

const getPageScreenshotTool = {
  description: `Captures a screenshot of the currently active page. Use this when users ask to see the page, want a screenshot, or need a visual representation of the current page.
    Examples: "Take a screenshot", "Show me this page", "Capture this page", "Screenshot please".
    This tool captures the visual state of the page without modifying any tabs.`,
  inputSchema: z.object({
    _placeholder: z.string().optional().describe("This tool requires no parameters."),
  }),
} satisfies Tool;

// Combine tab management tools with page analysis tools
const TOOLS = {
  ...TAB_MANAGEMENT_TOOLS,
  getPageSummary: getPageSummaryTool,
  getPageScreenshot: getPageScreenshotTool,
};

export class LLMClient {
  private readonly webContents: WebContents;
  private window: Window | null = null;
  private api: TabManagementAPI | null = null;
  private readonly provider: LLMProvider;
  private readonly modelName: string;
  private readonly model: LanguageModel | null;
  private messages: CoreMessage[] = [];
  private displayMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    this.provider = this.getProvider();
    this.modelName = this.getModelName();
    this.model = this.initializeModel();
    this.logInitializationStatus();
  }

  // Set the window reference after construction to avoid circular dependencies
  public setWindow(window: Window): void {
    this.window = window;
    this.api = new TabManagementAPI(window);
  }

  private getProvider(): LLMProvider {
    // Google is the default/main provider
    // Only use other providers if explicitly requested via LLM_PROVIDER env var

    // If provider is explicitly set, use it (but still prefer Google if not set)
    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    if (provider === "anthropic" || provider === "openai") {
      return provider as LLMProvider;
    }
    if (provider === "google") {
      return "google";
    }

    // Default behavior: prioritize Google
    // Auto-detect provider based on available API keys (Google is primary)
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return "google";
    }
    if (process.env.OPENAI_API_KEY) {
      return "openai";
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return "anthropic";
    }

    // Default to Google (main provider) if no keys are found
    return "google";
  }

  private getModelName(): string {
    return process.env.LLM_MODEL || DEFAULT_MODELS[this.provider];
  }

  private getApiKey(): string | undefined {
    // Get API key based on the provider
    switch (this.provider) {
      case "google":
        return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      case "openai":
        return process.env.OPENAI_API_KEY;
      case "anthropic":
        return process.env.ANTHROPIC_API_KEY;
      default:
        // Fallback: check all keys in priority order (Google is main)
        return (
          process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
          process.env.OPENAI_API_KEY ||
          process.env.ANTHROPIC_API_KEY
        );
    }
  }

  private initializeModel(): LanguageModel | null {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return null;
    }

    switch (this.provider) {
      case "google": {
        const googleClient = createGoogleGenerativeAI({ apiKey });
        return googleClient(this.modelName);
      }
      case "anthropic": {
        const anthropicClient = createAnthropic({ apiKey });
        return anthropicClient(this.modelName);
      }
      case "openai": {
        const openaiClient = createOpenAI({ apiKey });
        return openaiClient(this.modelName);
      }
      default:
        return null;
    }
  }

  private logInitializationStatus(): void {
    if (this.model) {
      console.log(
        `LLMClient initialized with ${this.provider} model: ${this.modelName}`
      );
    } else {
      console.warn("LLMClient failed to initialize model. Check API keys.");
    }
  }

  public async sendChatMessage(
    { message, messageId }: ChatRequest,
    screenshot: string,
    pageText: string
  ): Promise<void> {
    if (!this.model || !this.window) {
      this.sendErrorMessage(
        messageId,
        "LLM model or window context is not available. Please check your API keys in the .env file."
      );
      return;
    }

    // Initialize system message if this is the first message
    if (this.messages.length === 0) {
      const systemMessage: CoreMessage = {
        role: "system",
        content: `You are a helpful browser assistant with three main capabilities:

1. TAB MANAGEMENT - You can manage browser tabs using natural language commands:
   - Close tabs by domain, title pattern, URL pattern, or specific IDs
   - Create new tabs
   - Pin or unpin tabs (pinned tabs are smaller, show only favicon, and stay at the beginning)
   - Create tab groups to organize related tabs (use smartGroupTabs for AI-powered intelligent grouping)
   - Edit existing tab groups
   
   Examples:
   - "Close all my LinkedIn tabs" → Use closeTabs with domain: "linkedin.com"
   - "Pin this tab" → Use pinTab with action: "pin" (for active tab, you can use domain or titlePattern from context)
   - "Pin all LinkedIn tabs" → Use pinTab with domain: "linkedin.com" and action: "pin"
   - "Unpin all tabs" → Use pinTab with action: "unpin" (you'll need to specify criteria)
   - "Group all my Pinterest tabs" → Use createTabGroup with domain: "pinterest.com" and a descriptive groupName
   - "Create a tab group with all tabs related to project x" → Use createTabGroup with titlePattern: "project x"
   - "Group my tabs" or "Organize my tabs" or "Auto-group tabs" → Use smartGroupTabs (uses local AI for fast, intelligent grouping)
   - "Intelligently group related tabs" → Use smartGroupTabs (recommended for automatic grouping)
   - "Close all tabs except this one" → Use closeTabs with excludeActive: true
   - "Close the tab playing music" → Use closeTabs with playingAudio: true
   
   IMPORTANT: For grouping requests without specific criteria (like "group my tabs"), use smartGroupTabs instead of createTabGroup. 
   smartGroupTabs uses a local AI model for fast, intelligent grouping that works offline and is much faster than API-based grouping.

2. WORKSPACE MANAGEMENT - You can manage workspaces, containers, and folders to organize tabs:
   - Create workspaces to separate different projects or contexts
   - Switch between workspaces
   - Create containers for isolated browsing contexts
   - Create folders within workspaces for hierarchical organization
   - Move tabs between workspaces
   
   Examples:
   - "Create a Work workspace" → Use createWorkspace with name: "Work"
   - "Create a Personal workspace" → Use createWorkspace with name: "Personal"
   - "Switch to Work workspace" → Use switchWorkspace with the workspace ID
   - "Move these tabs to Work workspace" → Use moveTabsToWorkspace
   - "Create a container called Shopping" → Use createContainer with name: "Shopping"
   
   When creating workspaces, you can optionally specify a color (e.g., "blue", "red", "green") and an icon.

3. PAGE ANALYSIS - You can analyze and interact with the currently active page:
   - Get a summary of the page content
   - Capture screenshots of the page
   
   Examples:
   - "What's on this page?" → Use getPageSummary
   - "Summarize this page" → Use getPageSummary
   - "Take a screenshot" → Use getPageScreenshot
   - "Show me this page" → Use getPageScreenshot

4. GENERAL QUESTIONS - For questions you cannot answer directly (weather, news, facts, etc.):
   - Open a Google search tab with the user's query
   - Inform the user that you've opened a search tab to help them find the answer
   
   Examples:
   - "What's the weather in Spain?" → Use createTab with url: "https://www.google.com/search?q=weather+in+spain"
   - "Who won the game yesterday?" → Use createTab with url: "https://www.google.com/search?q=who+won+the+game+yesterday"
   - "What's the latest news?" → Use createTab with url: "https://www.google.com/search?q=latest+news"
   
   IMPORTANT: When a user asks a question you cannot answer (weather, current events, facts, calculations, etc.), 
   ALWAYS open a Google search tab with their query instead of declining to help. Format the search URL as:
   https://www.google.com/search?q=<query with spaces replaced by +>

These functionalities are completely independent - page analysis does not affect tab management and vice versa. You have access to the current page's screenshot and text content in the context, but you can also use the tools to get fresh summaries or screenshots when requested.

Always provide clear, friendly responses explaining what actions you're taking. If a tool execution fails, explain the error to the user in a helpful way.`,
      };
      this.messages.push(systemMessage);
    }

    // Detect query type to optimize context
    const lowerMessage = message.toLowerCase();
    const needsVisualContext = /page|screenshot|show|what.*on|summarize|analyze.*page|content.*page/i.test(lowerMessage);
    const needsTabContext = /tab|close|open|pin|group|workspace|container|folder/i.test(lowerMessage);
    const isInformationalQuery = /what.*can|help|capabilities|features|what.*do|how.*work/i.test(lowerMessage);

    // Get current tab information for context (only if needed)
    const activeTab = this.window.activeTab;
    const allTabs = this.window.allTabs;

    // Build context message based on what's needed
    let contextMessage = `User Message: ${message}`;

    if (needsTabContext || !isInformationalQuery) {
      const tabInfo = allTabs
        .slice(0, 10) // Limit to first 10 tabs for context
        .map((tab) => ({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          isActive: tab.id === activeTab?.id,
        }));

      contextMessage = `Current browser state:
- Active Tab: ${activeTab ? `${activeTab.title} (${activeTab.url})` : "None"}
- Total Tabs: ${allTabs.length}
- Open Tabs: ${JSON.stringify(tabInfo, null, 2)}
${needsVisualContext ? `- Page Text: ${pageText.substring(0, MAX_CONTEXT_LENGTH)}\n` : ''}- User Message: ${message}`;
    }

    // Build user message content - only include image if needed
    const userMessage: CoreMessage = needsVisualContext
      ? {
        role: "user",
        content: [
          { type: "text", text: contextMessage },
          { type: "image", image: screenshot },
        ],
      }
      : {
        role: "user",
        content: contextMessage,
      };

    this.messages.push(userMessage);

    // Store display version (just the user's actual message, not the context)
    this.displayMessages.push({
      role: "user",
      content: message,
    });

    // Check if this is a conversational query that should go directly to LLM
    // (bypasses tab management routing for faster response)
    if (this.api) {
      try {
        const routingResult = await this.api.processIntelligentQuery(message);

        // If it's a direct_llm route, skip tab management and go straight to LLM
        if (routingResult && routingResult.route === 'direct_llm') {
          // This is a conversational query - proceed directly to cloud LLM
          await this.streamResponse(messageId);
          return;
        }

        // If it's a gemini route for tab actions, grouping, workspace/container operations, or forced execution, proceed to LLM (which has tools)
        if (routingResult && routingResult.route === 'gemini' &&
          (routingResult.action?.isTabAction ||
            routingResult.action?.isGroupingQuery ||
            routingResult.action?.shouldUseGemini ||
            routingResult.action?.forceExecution)) {
          // Tab action, grouping query, workspace/container operation, or forced execution routed to Gemini - proceed to LLM which will use tools
          console.log('[LLMClient] Routing to Gemini for guaranteed execution:', {
            isTabAction: routingResult.action?.isTabAction,
            isGroupingQuery: routingResult.action?.isGroupingQuery,
            forceExecution: routingResult.action?.forceExecution
          });
          await this.streamResponse(messageId);
          return;
        }

        // If routing succeeded and we have an actionable result, handle it
        if (routingResult && routingResult.action) {
          let responseMessage = '';

          // Execute the action based on route
          if (routingResult.route === 'pattern' && routingResult.action.action) {
            // Pattern matched - execute action
            const action = routingResult.action;
            if (action.action === 'close' && action.tabIds) {
              const result = this.api.closeTabs({ tabIds: action.tabIds });
              responseMessage = `Closed ${result.closedCount} tab(s).`;
            } else if (action.action === 'open' && action.url) {
              // Open single tab
              this.api.createTab(action.url);
              responseMessage = `Opened ${action.url}.`;
            } else if (action.action === 'open_multiple' && action.urls) {
              // Open multiple tabs
              const results = await Promise.all(action.urls.map((url: string) => this.api?.createTab(url) || null));
              const validResults = results.filter(r => r !== null);
              responseMessage = `Opened ${validResults.length} tab(s).`;
            } else if (action.action === 'group' && action.tabIds) {
              const result = this.api.createGroup({
                tabIds: action.tabIds,
                groupName: action.groupName || 'New Group'
              });
              responseMessage = `Created group "${action.groupName || 'New Group'}" with ${result.tabCount} tab(s).`;
            } else if (action.action === 'pin' && action.tabIds) {
              // Pin tabs
              responseMessage = `Pinned ${action.tabIds.length} tab(s).`;
            } else if (action.action === 'find' && action.tabIds) {
              responseMessage = `Found ${action.tabIds.length} matching tab(s).`;
            } else {
              responseMessage = 'Action completed.';
            }
          } else if (routingResult.route === 't5' && routingResult.action.tabIds) {
            // T5 suggested grouping (returns GroupingSuggestion with tabIds, not suggestedTabIds)
            const suggestion = routingResult.action;
            if (suggestion.tabIds && suggestion.tabIds.length > 0) {
              try {
                const result = this.api.createGroup({
                  tabIds: suggestion.tabIds,
                  groupName: suggestion.groupName || 'New Group'
                });
                responseMessage = `Created group "${suggestion.groupName || 'New Group'}" with ${result.tabCount} tab(s).`;
              } catch (error) {
                console.error('[LLMClient] Error creating group from T5 suggestion:', error);
                responseMessage = `Failed to create group: ${error instanceof Error ? error.message : 'Unknown error'}`;
              }
            } else {
              responseMessage = 'No tabs found to group.';
            }
          } else if (routingResult.route === 'slm' && routingResult.action.tabIds) {
            // SLM provided structured action
            const action = routingResult.action;
            if (action.action === 'close' && action.tabIds) {
              const result = this.api.closeTabs({ tabIds: action.tabIds });
              responseMessage = `${action.reasoning || ''}\n\nClosed ${result.closedCount} tab(s).`;
            } else if (action.action === 'group' && action.tabIds) {
              const result = this.api.createGroup({
                tabIds: action.tabIds,
                groupName: action.groupName || 'New Group'
              });
              responseMessage = `${action.reasoning || ''}\n\nCreated group "${action.groupName || 'New Group'}" with ${result.tabCount} tab(s).`;
            } else {
              responseMessage = action.reasoning || 'Action completed.';
            }
          }

          // Send response with routing info
          this.sendStreamChunk(messageId, {
            content: responseMessage,
            isComplete: true,
            routingInfo: {
              route: routingResult.route,
              latency: routingResult.latency,
              confidence: routingResult.confidence,
              model: routingResult.model,
              reasoning: routingResult.reasoning
            }
          });
          return; // Don't call cloud LLM
        }
      } catch (error) {
        console.warn('[LLMClient] IntelligentRouter failed, falling back to cloud LLM:', error);
        // Continue to cloud LLM
      }
    }

    // Check if this is a simple command that SLM can handle (fallback)
    const simpleResult = this.api?.processSimpleCommand(message);
    if (simpleResult && !simpleResult.needsCloudLLM) {
      // SLM handled it - send response immediately
      this.sendStreamChunk(messageId, {
        content: simpleResult.message,
        isComplete: true,
      });
      return; // Don't call cloud LLM
    }

    // Otherwise, continue with cloud LLM...
    await this.streamResponse(messageId);
  }

  private async executeToolCall(
    toolName: string,
    args: Record<string, any>
  ): Promise<string> {
    if (!this.window || !this.api) {
      throw new Error("Window context or API is not available.");
    }

    try {
      console.log(`[LLMClient] Executing tool: ${toolName}`, args);

      let result: string;
      switch (toolName) {
        // Tab Management Tools
        case "getTabs": {
          const tabs = this.api.getAllTabs();
          result = `Found ${tabs.length} tab(s). ${JSON.stringify(tabs, null, 2)}`;
          break;
        }
        case "getActiveTab": {
          const activeTab = this.api.getActiveTab();
          if (!activeTab) {
            result = "No active tab available.";
          } else {
            result = `Active tab: ${JSON.stringify(activeTab, null, 2)}`;
          }
          break;
        }
        case "findTabs": {
          const tabs = this.api.findTabs(args as {
            tabIds?: string[];
            domain?: string;
            titlePattern?: string;
            urlPattern?: string;
            isPinned?: boolean;
            isActive?: boolean;
            playingAudio?: boolean;
            groupId?: string;
          });
          result = `Found ${tabs.length} tab(s) matching criteria: ${tabs.map(t => `${t.title} (${t.id})`).join(", ")}`;
          break;
        }
        case "getTabStats": {
          const stats = this.api.getTabStats();
          result = `Tab statistics: ${JSON.stringify(stats, null, 2)}`;
          break;
        }
        case "createTab": {
          const createResult = this.api.createTab(args.url as string | undefined);
          result = `Successfully created tab: ${createResult.id} (${createResult.title})`;
          break;
        }
        case "createTabs": {
          const createResults = this.api.createTabs(args.urls as string[]);
          result = `Successfully created ${createResults.length} tab(s): ${createResults.map(t => t.id).join(", ")}`;
          break;
        }
        case "closeTabs": {
          const closeResult = this.api.closeTabs(args as {
            tabIds?: string[];
            domain?: string;
            titlePattern?: string;
            urlPattern?: string;
            excludeActive?: boolean;
            playingAudio?: boolean;
            limit?: number;
          });
          result = `Successfully closed ${closeResult.closedCount} tab(s).`;
          break;
        }
        case "switchToTab": {
          const success = this.api.switchToTab(args.tabId as string);
          result = success ? `Switched to tab ${args.tabId}` : `Failed to switch to tab ${args.tabId}`;
          break;
        }
        case "switchToNextTab": {
          const success = this.api.switchToNextTab();
          result = success ? "Switched to next tab" : "Failed to switch to next tab";
          break;
        }
        case "switchToPreviousTab": {
          const success = this.api.switchToPreviousTab();
          result = success ? "Switched to previous tab" : "Failed to switch to previous tab";
          break;
        }
        case "navigateTab": {
          const success = this.api.navigateTab(
            (args.tabId as string) || this.window.activeTab?.id || "",
            args.url as string
          );
          result = success ? `Navigated to ${args.url}` : `Failed to navigate to ${args.url}`;
          break;
        }
        case "goBack": {
          const success = args.tabId
            ? this.api.goBack() // Note: API doesn't support tabId yet, using active tab
            : this.api.goBack();
          result = success ? "Navigated back" : "Cannot go back";
          break;
        }
        case "goForward": {
          const success = this.api.goForward();
          result = success ? "Navigated forward" : "Cannot go forward";
          break;
        }
        case "reloadTab": {
          const success = args.tabId
            ? this.api.reloadTab(args.tabId as string)
            : this.api.reload();
          result = success ? "Reloaded tab" : "Failed to reload tab";
          break;
        }
        case "pinTabs": {
          const pinResult = this.api.pinTabs(args as {
            tabIds?: string[];
            domain?: string;
            titlePattern?: string;
            urlPattern?: string;
            action: "pin" | "unpin" | "toggle";
          });
          result = `Successfully ${args.action === "pin" ? `pinned ${pinResult.pinnedCount}` : args.action === "unpin" ? `unpinned ${pinResult.unpinnedCount}` : `toggled ${pinResult.pinnedCount + pinResult.unpinnedCount}`} tab(s).`;
          break;
        }
        case "getTabGroups": {
          const groups = this.api.getAllGroups();
          result = `Found ${groups.length} group(s): ${JSON.stringify(groups, null, 2)}`;
          break;
        }
        case "createTabGroup": {
          // If no specific tabs provided, use SLM for intelligent grouping
          const hasSpecificTabs = (args.tabIds && (args.tabIds as string[]).length > 0) ||
            args.domain ||
            args.titlePattern ||
            args.urlPattern;

          if (!hasSpecificTabs) {
            // Use SLM to intelligently group tabs (defer to background if possible)
            try {
              // Start SLM suggestion in background, but wait for it here since user expects result
              const suggestion = await this.api.suggestTabsForGrouping(
                [], // No seed tabs - analyze all ungrouped tabs
                []  // No exclusions
              );

              if (suggestion.suggestedTabIds.length >= 2) {
                // Use AI-suggested group name if provided, otherwise use user's name
                const groupName = suggestion.groupName || (args.groupName as string) || "AI Group";

                // Validate color
                const validColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'] as const;
                const color = args.color && validColors.includes(args.color as typeof validColors[number])
                  ? (args.color as typeof validColors[number])
                  : undefined;

                this.api.createGroup({
                  tabIds: suggestion.suggestedTabIds,
                  groupName,
                  color,
                });

                result = `Successfully created AI-powered tab group '${groupName}' with ${suggestion.suggestedTabIds.length} related tabs.`;
              } else {
                result = `Could not find enough related tabs to create a group. Found ${suggestion.suggestedTabIds.length} tab(s). Need at least 2 tabs.`;
              }
            } catch (error) {
              console.error('[LLMClient] SLM grouping error, falling back to simple grouping:', error);
              // Fallback to simple domain-based grouping
              const validColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'] as const;
              const fallbackColor = args.color && validColors.includes(args.color as typeof validColors[number])
                ? (args.color as typeof validColors[number])
                : undefined;

              const groupResult = this.api.createGroup({
                tabIds: args.tabIds as string[] | undefined,
                domain: args.domain as string | undefined,
                titlePattern: args.titlePattern as string | undefined,
                urlPattern: args.urlPattern as string | undefined,
                groupName: args.groupName as string,
                color: fallbackColor,
              });
              result = `Successfully created tab group '${args.groupName}' (ID: ${groupResult.groupId}) with ${groupResult.tabCount} tab(s).`;
            }
          } else {
            // Use specified criteria (no AI needed)
            const validColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'] as const;
            const color = args.color && validColors.includes(args.color as typeof validColors[number])
              ? (args.color as typeof validColors[number])
              : undefined;

            const groupResult = this.api.createGroup({
              tabIds: args.tabIds as string[] | undefined,
              domain: args.domain as string | undefined,
              titlePattern: args.titlePattern as string | undefined,
              urlPattern: args.urlPattern as string | undefined,
              groupName: args.groupName as string,
              color,
            });
            result = `Successfully created tab group '${args.groupName}' (ID: ${groupResult.groupId}) with ${groupResult.tabCount} tab(s).`;
          }
          break;
        }
        case "smartGroupTabs": {
          // Use SLM to intelligently group all ungrouped tabs
          // Note: This is optimized with parallel processing and caching
          try {
            const suggestions = await this.api.suggestMultipleGroups();

            if (suggestions.length === 0) {
              result = "No groups could be created. Either all tabs are already grouped, or there aren't enough related tabs to form groups.";
              break;
            }

            const minTabs = (args.minTabsPerGroup as number) || 2;
            const confidenceThreshold = (args.confidenceThreshold as number) || 0.3;

            // Filter and create groups in parallel for better performance
            const validSuggestions = suggestions.filter(
              s => s.tabIds.length >= minTabs && s.confidence >= confidenceThreshold
            );

            if (validSuggestions.length === 0) {
              result = `No groups were created. All suggested groups were below the minimum requirements (min ${minTabs} tabs, confidence ${confidenceThreshold}).`;
              break;
            }

            // Get existing groups once (for color assignment)
            const allColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
            const existingGroups = this.api.getAllGroups();
            const usedColors = existingGroups.map(g => g.color).filter(Boolean) as string[];

            // Create groups in parallel (they're independent operations)
            const groupCreationPromises = validSuggestions.map(async (suggestion, index) => {
              try {
                const availableColor = allColors.find(c => !usedColors.includes(c)) || allColors[index % allColors.length];
                usedColors.push(availableColor); // Mark as used for this batch

                if (this.api) {
                  this.api.createGroup({
                    tabIds: suggestion.tabIds,
                    groupName: suggestion.groupName,
                    color: availableColor as "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan",
                  });
                }

                return { success: true, name: suggestion.groupName };
              } catch (error) {
                console.error('[LLMClient] Error creating group:', error);
                return { success: false, name: suggestion.groupName };
              }
            });

            const groupResults = await Promise.all(groupCreationPromises);
            const createdGroups = groupResults.filter(r => r.success).map(r => r.name);
            const groupsCreated = createdGroups.length;

            if (groupsCreated > 0) {
              // Get the model name from TabGroupingAI
              const modelName = this.api?.getTabGroupingAI?.()?.getModelName?.() || 'local AI';
              result = `Successfully created ${groupsCreated} AI-powered tab group(s) using ${modelName}: ${createdGroups.join(", ")}.`;
            } else {
              result = `Failed to create any groups.`;
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            result = `Error during intelligent tab grouping: ${errorMsg}. Falling back to domain-based grouping.`;
            // Fallback to domain-based grouping
            try {
              const allTabs = this.api.getAllTabs();
              const ungroupedTabs = allTabs.filter(t => !t.groupId);

              // Simple domain-based grouping as fallback
              const domainGroups = new Map<string, string[]>();
              ungroupedTabs.forEach(tab => {
                try {
                  const domain = new URL(tab.url).hostname.replace(/^www\./, '');
                  if (!domainGroups.has(domain)) {
                    domainGroups.set(domain, []);
                  }
                  domainGroups.get(domain)!.push(tab.id);
                } catch {
                  // Invalid URL, skip
                }
              });

              const minTabs = (args.minTabsPerGroup as number) || 2;
              let fallbackGroups = 0;
              for (const [domain, tabIds] of domainGroups.entries()) {
                if (tabIds.length >= minTabs) {
                  const groupName = domain.charAt(0).toUpperCase() + domain.slice(1).replace(/\.(com|org|net|io)$/, '');
                  this.api.createGroup({
                    tabIds,
                    groupName,
                  });
                  fallbackGroups++;
                }
              }

              if (fallbackGroups > 0) {
                result += ` Created ${fallbackGroups} group(s) using domain-based grouping.`;
              }
            } catch (fallbackError) {
              result += ` Fallback grouping also failed.`;
            }
          }
          break;
        }
        case "editTabGroup": {
          const validColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'] as const;
          const newColor = args.newColor && validColors.includes(args.newColor as typeof validColors[number])
            ? (args.newColor as typeof validColors[number])
            : undefined;

          const editResult = this.api.editGroup({
            groupId: args.groupId as string,
            newName: args.newName as string | undefined,
            newColor,
            tabsToAdd: args.tabsToAdd as string[] | undefined,
            tabsToRemove: args.tabsToRemove as string[] | undefined,
            addByDomain: args.addByDomain as string | undefined,
            addByTitlePattern: args.addByTitlePattern as string | undefined,
            removeByDomain: args.removeByDomain as string | undefined,
            removeByTitlePattern: args.removeByTitlePattern as string | undefined,
          });
          result = editResult.success
            ? `Successfully edited group: ${editResult.changes.join(", ")}`
            : "No changes applied to group";
          break;
        }
        case "deleteTabGroup": {
          const success = this.api.deleteGroup(args.groupId as string);
          result = success ? `Deleted group ${args.groupId}` : `Failed to delete group ${args.groupId}`;
          break;
        }
        case "toggleGroupCollapse": {
          const success = this.api.toggleGroupCollapse(args.groupId as string);
          result = success
            ? `Toggled collapse state for group ${args.groupId}`
            : `Failed to toggle collapse for group ${args.groupId}`;
          break;
        }
        case "moveTabToGroup": {
          const targetGroupId = args.targetGroupId !== undefined ? (args.targetGroupId as string | null) : null;
          const success = this.api.moveTabToGroup(
            args.tabId as string,
            targetGroupId
          );
          result = success
            ? `Moved tab ${args.tabId} to group ${args.targetGroupId || "ungrouped"}`
            : `Failed to move tab to group`;
          break;
        }
        case "reorderTabInGroup": {
          const success = this.api.moveTabInGroup(
            args.tabId as string,
            args.newIndex as number
          );
          result = success
            ? `Reordered tab ${args.tabId} to position ${args.newIndex}`
            : `Failed to reorder tab`;
          break;
        }
        case "createTabInGroup": {
          const tabResult = this.api.createTabInGroup(
            args.url as string | undefined,
            args.groupId as string
          );
          result = `Created tab ${tabResult.id} in group ${args.groupId}`;
          break;
        }

        case "groupTabsByCategory": {
          const categoryResult = this.api.groupTabsByCategory(
            args.category,
            args.groupName,
            args.color
          );
          result = `Successfully grouped ${categoryResult.tabCount} tab(s) into "${args.groupName || args.category}" group.`;
          break;
        }

        case "saveAndCloseGroup": {
          const success = this.api.saveAndCloseGroup(args.groupId as string);
          result = success
            ? `Saved and closed group ${args.groupId}`
            : `Failed to save and close group ${args.groupId}`;
          break;
        }
        case "ungroupTabs": {
          const success = this.api.ungroupTabs(args.groupId as string);
          result = success
            ? `Ungrouped tabs in group ${args.groupId}`
            : `Failed to ungroup tabs in group ${args.groupId}`;
          break;
        }
        case "screenshotTab": {
          const dataUrl = await this.api.screenshotTab(
            (args.tabId as string) || this.window.activeTab?.id || ""
          );
          result = `Screenshot captured (${dataUrl.substring(0, 50)}...)`;
          break;
        }
        case "runJavaScript": {
          const jsResult = await this.api.runJavaScript(
            (args.tabId as string) || this.window.activeTab?.id || "",
            args.code as string
          );
          result = `JavaScript executed. Result: ${JSON.stringify(jsResult)}`;
          break;
        }
        case "executeWorkflow": {
          const workflowResults = await this.api.executeWorkflow(args.operations as Array<{
            type: string;
            params: Record<string, any>;
          }>);
          const successCount = workflowResults.filter(r => r.success).length;
          result = `Workflow executed: ${successCount}/${workflowResults.length} operations succeeded. ${JSON.stringify(workflowResults, null, 2)}`;
          break;
        }

        case "getWorkflowSuggestions": {
          const suggestions = this.api.getWorkflowSuggestions();
          if (suggestions.length === 0) {
            result = "No workflow patterns detected yet. Keep using your browser and I'll learn your habits!";
          } else {
            const suggestionList = suggestions.map((s, i) =>
              `${i + 1}. ${s.message} (${Math.round(s.confidence * 100)}% confidence)`
            ).join('\n');
            result = `Found ${suggestions.length} workflow suggestion(s) based on your usage patterns:\n\n${suggestionList}`;
          }
          break;
        }

        case "getKnowledgeGraphStats": {
          const stats = this.api.getKnowledgeGraphStats();
          if (!stats) {
            result = "Knowledge Graph not yet initialized. Try grouping some tabs first!";
          } else {
            result = `Knowledge Graph Statistics:\n` +
              `- Nodes (tabs analyzed): ${stats.nodeCount}\n` +
              `- Edges (relationships): ${stats.edgeCount}\n` +
              `- Patterns detected: ${stats.patternCount}\n` +
              `- Average connections per tab: ${stats.avgDegree?.toFixed(2) || 0}\n\n` +
              `The AI has analyzed semantic relationships between your tabs to provide better grouping suggestions.`;
          }
          break;
        }

        case "organizeTabsByDomain": {
          const orgResult = this.api.organizeTabsByDomain();
          result = `Organized tabs: created ${orgResult.createdGroups} group(s)`;
          break;
        }
        // Workspace Management Tools
        case "getWorkspaces": {
          const workspaces = this.api.getAllWorkspaces();
          result = `Found ${workspaces.length} workspace(s): ${JSON.stringify(workspaces, null, 2)}`;
          break;
        }
        case "getActiveWorkspace": {
          const workspace = this.api.getActiveWorkspace();
          if (!workspace) {
            result = "No active workspace available.";
          } else {
            result = `Active workspace: ${JSON.stringify(workspace, null, 2)}`;
          }
          break;
        }
        case "createWorkspace": {
          const createResult = this.api.createWorkspace(
            args.name as string,
            args.color as string | undefined,
            args.icon as string | undefined,
            args.defaultContainerId as string | undefined
          );
          result = `Successfully created workspace '${args.name}' (ID: ${createResult.workspaceId})`;
          break;
        }
        case "switchWorkspace": {
          const success = this.api.switchWorkspace(args.workspaceId as string);
          result = success
            ? `Switched to workspace ${args.workspaceId}`
            : `Failed to switch to workspace ${args.workspaceId}`;
          break;
        }
        case "updateWorkspace": {
          const success = this.api.updateWorkspace(args.workspaceId as string, {
            name: args.name as string | undefined,
            color: args.color as string | undefined,
            icon: args.icon as string | undefined,
            defaultContainerId: args.defaultContainerId as string | undefined,
          });
          result = success
            ? `Updated workspace ${args.workspaceId}`
            : `Failed to update workspace ${args.workspaceId}`;
          break;
        }
        case "deleteWorkspace": {
          const success = this.api.deleteWorkspace(args.workspaceId as string);
          result = success
            ? `Deleted workspace ${args.workspaceId}`
            : `Failed to delete workspace ${args.workspaceId}`;
          break;
        }
        case "moveTabsToWorkspace": {
          const moveResult = this.api.moveTabsToWorkspace(args.workspaceId as string, {
            tabIds: args.tabIds as string[] | undefined,
            domain: args.domain as string | undefined,
            titlePattern: args.titlePattern as string | undefined,
          });
          result = `Moved ${moveResult.movedCount} tab(s) to workspace ${args.workspaceId}`;
          break;
        }
        // Container Management Tools
        case "getContainers": {
          const containers = this.api.getAllContainers();
          result = `Found ${containers.length} container(s): ${JSON.stringify(containers, null, 2)}`;
          break;
        }
        case "createContainer": {
          const createResult = this.api.createContainer(
            args.name as string,
            args.color as string | undefined,
            args.icon as string | undefined
          );
          result = `Successfully created container '${args.name}' (ID: ${createResult.containerId})`;
          break;
        }
        case "updateContainer": {
          const success = this.api.updateContainer(args.containerId as string, {
            name: args.name as string | undefined,
            color: args.color as string | undefined,
            icon: args.icon as string | undefined,
          });
          result = success
            ? `Updated container ${args.containerId}`
            : `Failed to update container ${args.containerId}`;
          break;
        }
        case "deleteContainer": {
          const success = this.api.deleteContainer(args.containerId as string);
          result = success
            ? `Deleted container ${args.containerId}`
            : `Failed to delete container ${args.containerId}`;
          break;
        }
        case "assignContainerToTab": {
          const success = this.api.assignContainerToTab(
            args.tabId as string,
            args.containerId as string
          );
          result = success
            ? `Assigned container ${args.containerId} to tab ${args.tabId}`
            : `Failed to assign container to tab`;
          break;
        }
        case "assignContainerToWorkspace": {
          const success = this.api.assignContainerToWorkspace(
            args.workspaceId as string,
            args.containerId as string
          );
          result = success
            ? `Assigned container ${args.containerId} as default for workspace ${args.workspaceId}`
            : `Failed to assign container to workspace`;
          break;
        }
        // Folder Management Tools
        case "getFoldersInWorkspace": {
          const folders = this.api.getFoldersInWorkspace(args.workspaceId as string);
          result = `Found ${folders.length} folder(s): ${JSON.stringify(folders, null, 2)}`;
          break;
        }
        case "createFolder": {
          const createResult = this.api.createFolder(
            args.workspaceId as string,
            args.name as string,
            args.parentFolderId as string | undefined
          );
          result = `Successfully created folder '${args.name}' (ID: ${createResult.folderId})`;
          break;
        }
        case "updateFolder": {
          const success = this.api.updateFolder(args.folderId as string, {
            name: args.name as string | undefined,
          });
          result = success
            ? `Updated folder ${args.folderId}`
            : `Failed to update folder ${args.folderId}`;
          break;
        }
        case "deleteFolder": {
          const success = this.api.deleteFolder(args.folderId as string);
          result = success
            ? `Deleted folder ${args.folderId}`
            : `Failed to delete folder ${args.folderId}`;
          break;
        }
        case "moveTabsToFolder": {
          const moveResult = this.api.moveTabsToFolder(args.folderId as string, {
            tabIds: args.tabIds as string[] | undefined,
            domain: args.domain as string | undefined,
            titlePattern: args.titlePattern as string | undefined,
          });
          result = `Moved ${moveResult.movedCount} tab(s) to folder ${args.folderId}`;
          break;
        }
        // Page Analysis Tools
        case "getPageSummary":
          result = await this.getPageSummary(args as {
            includeDetails?: boolean;
          });
          break;
        case "getPageScreenshot":
          result = await this.getPageScreenshot();
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      console.log(`[LLMClient] Tool ${toolName} executed successfully:`, result);
      return result;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`[LLMClient] Error executing tool ${toolName}:`, errorMessage, e);
      throw new Error(`Failed to execute ${toolName}: ${errorMessage}`);
    }
  }

  // --- Tool Implementations ---
  // Tab management tools are now handled by TabManagementAPI

  private async getPageSummary(args: {
    includeDetails?: boolean;
  }): Promise<string> {
    if (!this.window) throw new Error("Window not initialized.");

    const activeTab = this.window.activeTab;
    if (!activeTab) {
      return "No active tab available to summarize.";
    }

    try {
      // Get page text content
      const pageText = await activeTab.getTabText().catch(() => "");
      if (!pageText || pageText.trim().length === 0) {
        return `The page "${activeTab.title}" (${activeTab.url}) appears to be empty or the content could not be extracted.`;
      }

      // Truncate text if too long (keep it manageable)
      const maxTextLength = args.includeDetails ? 10000 : 5000;
      const truncatedText = pageText.length > maxTextLength
        ? pageText.substring(0, maxTextLength) + "..."
        : pageText;

      // Return structured page content for the LLM to summarize
      // The LLM will use this along with the existing context to provide a comprehensive summary
      const summary = `Page Content for "${activeTab.title}" (${activeTab.url}):

${args.includeDetails
          ? `Full Page Text (${pageText.length} characters):
${truncatedText}`
          : `Page Text Preview (${pageText.length} total characters):
${truncatedText.substring(0, 2000)}${truncatedText.length > 2000 ? "..." : ""}`}

Please provide a clear, concise summary of this page's content, highlighting the main topics, key information, and important details.`;

      return summary;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `Error generating page summary: ${errorMessage}`;
    }
  }

  private async getPageScreenshot(): Promise<string> {
    if (!this.window) throw new Error("Window not initialized.");

    const activeTab = this.window.activeTab;
    if (!activeTab) {
      return "No active tab available to capture.";
    }

    try {
      await activeTab.screenshot();

      // Return a message indicating the screenshot was captured
      // The screenshot data is already available in the context, so we just confirm
      return `Screenshot captured successfully for "${activeTab.title}" (${activeTab.url}). The screenshot is available in the conversation context.`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `Error capturing screenshot: ${errorMessage}`;
    }
  }

  // --- Streaming and Tool Handling Logic ---

  private async streamResponse(messageId: string): Promise<void> {
    if (!this.model) return;

    let currentMessages = [...this.messages];
    let accumulatedContent = ""; // Track all content sent to user (including tool feedback)

    while (true) {
      let fullContent = "";
      const toolCallsMap = new Map<
        string,
        { toolName: string; args: Record<string, any> }
      >();

      // Determine which tools to use based on query type
      // For informational queries, use minimal tools to reduce latency
      const lastUserMessage = currentMessages[currentMessages.length - 1];
      const userMessageText = typeof lastUserMessage.content === 'string'
        ? lastUserMessage.content
        : Array.isArray(lastUserMessage.content)
          ? lastUserMessage.content.find(c => c.type === 'text')?.text || ''
          : '';
      const lowerMessage = userMessageText.toLowerCase();
      const isInformationalQuery = /what.*can|help|capabilities|features|what.*do|how.*work/i.test(lowerMessage);

      // Minimal tool set for informational queries (much faster)
      const minimalTools = {
        getTabs: TAB_MANAGEMENT_TOOLS.getTabs,
        getActiveTab: TAB_MANAGEMENT_TOOLS.getActiveTab,
        getTabStats: TAB_MANAGEMENT_TOOLS.getTabStats,
        getTabGroups: TAB_MANAGEMENT_TOOLS.getTabGroups,
        getWorkspaces: TAB_MANAGEMENT_TOOLS.getWorkspaces,
        getActiveWorkspace: TAB_MANAGEMENT_TOOLS.getActiveWorkspace,
      };

      const toolsToUse = isInformationalQuery ? minimalTools : TOOLS;

      try {
        const result = streamText({
          model: this.model,
          messages: currentMessages,
          tools: toolsToUse,
          temperature: DEFAULT_TEMPERATURE,
          // Note: maxTokens not available in AI SDK streamText, but model may have its own limits
        });

        // Process the full stream to collect text and tool calls
        for await (const chunk of result.fullStream) {
          if (chunk.type === "text-delta") {
            fullContent += chunk.text;
            accumulatedContent += chunk.text;
            this.sendStreamChunk(messageId, {
              content: chunk.text,
              isComplete: false,
            });
          } else if (chunk.type === "tool-call") {
            // Store tool call information
            if ("input" in chunk) {
              toolCallsMap.set(chunk.toolCallId, {
                toolName: chunk.toolName,
                args: chunk.input as Record<string, any>,
              });
            }
          }
        }

        // Get final tool calls from result
        const finalToolCalls = await result.toolCalls;
        if (finalToolCalls) {
          for (const toolCall of finalToolCalls) {
            if (!toolCallsMap.has(toolCall.toolCallId)) {
              if ("input" in toolCall) {
                toolCallsMap.set(toolCall.toolCallId, {
                  toolName: toolCall.toolName,
                  args: toolCall.input as Record<string, any>,
                });
              }
            }
          }
        }
      } catch (error) {
        this.sendErrorMessage(messageId, this.getErrorMessage(error));
        return;
      }

      // If the model called tools, execute them first (even if there's text)
      // This ensures tools are executed even when the LLM generates explanatory text
      if (toolCallsMap.size > 0) {
        // Notify user that tools are being executed
        const toolNames = Array.from(toolCallsMap.values()).map(c => c.toolName).join(", ");
        const executingMsg = `\n\n_Executing: ${toolNames}..._\n\n`;
        accumulatedContent += executingMsg;
        this.sendStreamChunk(messageId, {
          content: executingMsg,
          isComplete: false,
        });

        const toolCallParts: ToolCallPart[] = [];
        const toolResults: ToolResultPart[] = [];

        for (const [toolCallId, call] of Array.from(toolCallsMap.entries())) {
          try {
            const result = await this.executeToolCall(call.toolName, call.args);

            toolCallParts.push({
              type: "tool-call",
              toolCallId: toolCallId,
              toolName: call.toolName,
              input: call.args,
            });

            toolResults.push({
              type: "tool-result",
              toolCallId: toolCallId,
              toolName: call.toolName,
              output: { type: "text", value: result },
            });

            // Send tool result to user
            const resultMsg = `✓ ${result}\n\n`;
            accumulatedContent += resultMsg;
            this.sendStreamChunk(messageId, {
              content: resultMsg,
              isComplete: false,
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[LLMClient] Tool execution error:`, error);

            toolCallParts.push({
              type: "tool-call",
              toolCallId: toolCallId,
              toolName: call.toolName,
              input: call.args,
            });

            toolResults.push({
              type: "tool-result",
              toolCallId: toolCallId,
              toolName: call.toolName,
              output: { type: "text", value: `Error: ${errorMsg}` },
            });

            // Send error to user
            const errorMsgStr = `⚠ Error: ${errorMsg}\n\n`;
            accumulatedContent += errorMsgStr;
            this.sendStreamChunk(messageId, {
              content: errorMsgStr,
              isComplete: false,
            });
          }
        }

        currentMessages.push({
          role: "assistant",
          content: toolCallParts,
        });

        currentMessages.push({
          role: "tool",
          content: toolResults,
        });

        // Continue the loop to get the final response (accumulatedContent persists)
        continue;
      }

      // If text content was generated and no tools to execute, we are done
      if (fullContent.length > 0) {
        const assistantMessage: CoreMessage = {
          role: "assistant",
          content: fullContent,
        };
        currentMessages.push(assistantMessage);

        // Store display version with all accumulated content (including tool feedback)
        this.displayMessages.push({
          role: "assistant",
          content: accumulatedContent || fullContent,
        });

        this.sendStreamChunk(messageId, { content: "", isComplete: true });
        break;
      }

      // If no text and no tool calls, we are done (e.g., empty response)
      // If we have accumulated content from tool execution, store it
      if (accumulatedContent.length > 0) {
        this.displayMessages.push({
          role: "assistant",
          content: accumulatedContent,
        });
      }
      this.sendStreamChunk(messageId, { content: "", isComplete: true });
      break;
    }

    this.messages = currentMessages;
  }

  private getErrorMessage(error: unknown): string {
    const message =
      error instanceof Error ? error.message : String(error);

    if (
      message.includes("Authentication") ||
      message.includes("API Key")
    ) {
      return "Authentication error: Please check your API Key in the .env file.";
    }

    if (
      message.includes("429") ||
      message.includes("rate limit")
    ) {
      return "Rate limit exceeded. Please try again in a few moments.";
    }

    if (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("econnrefused")
    ) {
      return "Network error: Please check your internet connection.";
    }

    if (message.includes("timeout")) {
      return "Request timeout: The service took too long to respond. Please try again.";
    }

    return "Sorry, I encountered an error while processing your request. Please try again.";
  }

  private sendErrorMessage(messageId: string, errorMessage: string): void {
    this.sendStreamChunk(messageId, {
      content: errorMessage,
      isComplete: true,
    });
  }

  private sendStreamChunk(messageId: string, chunk: StreamChunk): void {
    this.webContents.send("chat-response", {
      messageId,
      content: chunk.content,
      isComplete: chunk.isComplete,
      routingInfo: chunk.routingInfo,
    });
  }

  // Clear all messages
  public clearMessages(): void {
    this.messages = [];
    this.displayMessages = [];
  }

  // Get all messages for display (excludes system messages and internal context)
  public getMessages(): CoreMessage[] {
    // Convert display messages back to CoreMessage format for compatibility
    return this.displayMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }
}