import {
  streamText,
  type LanguageModel,
  type CoreMessage,
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
import {
  closeTabsTool,
  createTabTool,
  pinTabsTool,
  createTabGroupTool,
  editTabGroupTool,
} from "./TabManagementTools";

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, "../../.env") });

type LLMProvider = "openai" | "anthropic" | "google";

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-20241022",
  google: "gemini-2.5-pro",
};

const DEFAULT_TEMPERATURE = 0.7;

// Tool definitions for tab commands (privacy-focused subset)
const TOOLS = {
  closeTabs: closeTabsTool,
  createTab: createTabTool,
  pinTabs: pinTabsTool,
  createTabGroup: createTabGroupTool,
  editTabGroup: editTabGroupTool,
};

export interface UndoableAction {
  type: "closeTabs" | "pinTab" | "unpinTab" | "createTabGroup" | "editTabGroup" | "deleteTabGroup";
  data: any; // Action-specific data for undo
}

export interface CommandResult {
  success: boolean;
  message: string;
  actionSummary?: string;
  undoableAction?: UndoableAction; // Action that can be undone
}

export class TabCommandService {
  private window: Window;
  private api: TabManagementAPI;
  private provider: LLMProvider;
  private modelName: string;
  private model: LanguageModel | null;
  private lastUndoableAction: UndoableAction | null = null;

  constructor(window: Window) {
    this.window = window;
    this.api = new TabManagementAPI(window);
    this.provider = this.getProvider();
    this.modelName = this.getModelName();
    this.model = this.initializeModel();
  }

  private getProvider(): LLMProvider {
    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    if (provider === "anthropic" || provider === "openai") {
      return provider as LLMProvider;
    }
    if (provider === "google") {
      return "google";
    }
    
    // Default behavior: prioritize Google
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return "google";
    }
    if (process.env.OPENAI_API_KEY) {
      return "openai";
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return "anthropic";
    }
    
    return "google";
  }

  private getModelName(): string {
    return process.env.LLM_MODEL || DEFAULT_MODELS[this.provider];
  }

  private getApiKey(): string | undefined {
    switch (this.provider) {
      case "google":
        return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      case "openai":
        return process.env.OPENAI_API_KEY;
      case "anthropic":
        return process.env.ANTHROPIC_API_KEY;
      default:
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

  /**
   * Process a natural language tab command.
   * PRIVACY-FIRST: Only sends the command text to the LLM, not tab data.
   * Tab data is processed locally after receiving the intent.
   */
  public async processCommand(command: string): Promise<CommandResult> {
    if (!this.model) {
      return {
        success: false,
        message: "LLM model is not available. Please check your API keys in the .env file.",
      };
    }

    try {
      // System message that explains the privacy-first approach
      const systemMessage: CoreMessage = {
        role: "system",
        content: `You are a helpful browser assistant that interprets natural language commands for managing browser tabs.

IMPORTANT: You only receive the user's command text. You do NOT receive information about open tabs.
Your job is to interpret the command and return structured tool calls that specify:
- What action to take (close, create, pin, group, etc.)
- What criteria to use (domain, title pattern, URL pattern, etc.)

Examples:
- "Close all my LinkedIn tabs" → Use closeTabs with domain: "linkedin.com"
- "Pin this tab" → Use pinTab with action: "pin" (for active tab, use domain or titlePattern)
- "Pin all LinkedIn tabs" → Use pinTab with domain: "linkedin.com" and action: "pin"
- "Unpin all tabs" → Use pinTab with action: "unpin" (you'll need to specify criteria or use a pattern)
- "Group all my Pinterest tabs" → Use createTabGroup with domain: "pinterest.com" and a descriptive groupName
- "Create a tab group with all tabs related to project x" → Use createTabGroup with titlePattern: "project x"
- "Close all tabs except this one" → Use closeTabs with excludeActive: true
- "Close the tab playing music" → Use closeTabs with playingAudio: true
- "Open a new tab with google.com" → Use createTab with url: "https://google.com"

Always provide clear, friendly responses explaining what actions you're taking.`,
      };

      const userMessage: CoreMessage = {
        role: "user",
        content: command,
      };

      const messages: CoreMessage[] = [systemMessage, userMessage];
      let currentMessages = [...messages];
      let actionSummary = "";

      // Process the command in a loop to handle tool calls
      while (true) {
        const result = streamText({
          model: this.model,
          messages: currentMessages,
          tools: TOOLS,
          temperature: DEFAULT_TEMPERATURE,
        });

        let fullContent = "";
        const toolCallsMap = new Map<
          string,
          { toolName: string; args: Record<string, any> }
        >();

        // Process the stream to collect text and tool calls
        for await (const chunk of result.fullStream) {
          if (chunk.type === "text-delta") {
            fullContent += chunk.text;
            actionSummary += chunk.text;
          } else if (chunk.type === "tool-call") {
            if ("input" in chunk) {
              toolCallsMap.set(chunk.toolCallId, {
                toolName: chunk.toolName,
                args: chunk.input as Record<string, any>,
              });
            }
          }
        }

        // Get final tool calls
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

        // If text content was generated, we're done
        if (fullContent.length > 0) {
          const assistantMessage: CoreMessage = {
            role: "assistant",
            content: fullContent,
          };
          currentMessages.push(assistantMessage);
          break;
        }

        // If tools were called, execute them locally
        if (toolCallsMap.size > 0) {
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

              actionSummary += `\n✓ ${result}`;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              
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

              actionSummary += `\n⚠ Error: ${errorMsg}`;
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

          // Continue to get final response
          continue;
        }

        // No text and no tool calls, we're done
        break;
      }

      return {
        success: true,
        message: actionSummary || "Command processed successfully.",
        actionSummary,
        undoableAction: this.lastUndoableAction || undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error processing command: ${errorMessage}`,
      };
    }
  }

  private async executeToolCall(
    toolName: string,
    args: Record<string, any>
  ): Promise<string> {
    try {
      console.log(`[TabCommandService] Executing tool: ${toolName}`, args);
      
      let result: string;
      switch (toolName) {
        case "closeTabs": {
          // Store tab info for undo before closing
    let tabsToClose: string[] = [];
    if (args.excludeActive) {
      const activeTabId = this.window.activeTab?.id;
      tabsToClose = this.window.allTabs
        .filter((tab) => tab.id !== activeTabId)
        .map((tab) => tab.id);
    } else if (args.tabIds && args.tabIds.length > 0) {
            tabsToClose = args.tabIds.filter(id => this.window.getTab(id) !== null);
    } else {
      const matchingTabs = this.window.findTabsByCriteria({
        domain: args.domain,
        titlePattern: args.titlePattern,
        urlPattern: args.urlPattern,
        playingAudio: args.playingAudio,
      });
      tabsToClose = matchingTabs.map((tab) => tab.id);
    }

    const closedTabsInfo = tabsToClose.map(tabId => {
      const tab = this.window.getTab(tabId);
      return tab ? { id: tabId, url: tab.url, title: tab.title, pinned: tab.pinned } : null;
    }).filter((info): info is { id: string; url: string; title: string; pinned: boolean } => info !== null);

          const closeResult = this.api.closeTabs(args as {
            tabIds?: string[];
            domain?: string;
            titlePattern?: string;
            urlPattern?: string;
            excludeActive?: boolean;
            playingAudio?: boolean;
            limit?: number;
          });
    
    // Store undoable action
    this.lastUndoableAction = {
      type: "closeTabs",
      data: { closedTabs: closedTabsInfo }
    };
    
    const criteria = args.domain
      ? `domain '${args.domain}'`
      : args.titlePattern
      ? `title pattern '${args.titlePattern}'`
      : args.urlPattern
      ? `URL pattern '${args.urlPattern}'`
      : args.playingAudio === true
      ? "playing audio"
      : args.excludeActive
      ? "all except active"
      : "specified tabs";

          result = `Successfully closed ${closeResult.closedCount} tab(s) matching ${criteria}.`;
          break;
        }
        case "createTab": {
          const createResult = this.api.createTab(args.url as string | undefined);
          result = `Successfully created a new tab${args.url ? ` with URL: ${args.url}` : ""}. Tab ID: ${createResult.id}.`;
          break;
        }
        case "createTabs": {
          const createResults = this.api.createTabs(args.urls as string[]);
          result = `Successfully created ${createResults.length} tab(s): ${createResults.map(t => t.id).join(", ")}`;
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

    // Store undoable action
          if (args.action === "pin" && pinResult.pinnedCount > 0) {
      this.lastUndoableAction = {
        type: "pinTab",
              data: { tabIds: pinResult.affectedTabIds }
      };
          } else if (args.action === "unpin" && pinResult.unpinnedCount > 0) {
      this.lastUndoableAction = {
        type: "unpinTab",
              data: { tabIds: pinResult.affectedTabIds }
      };
    }

    const criteria = args.domain
      ? `domain '${args.domain}'`
      : args.titlePattern
      ? `title pattern '${args.titlePattern}'`
      : args.urlPattern
      ? `URL pattern '${args.urlPattern}'`
      : "specified tabs";

    if (args.action === "pin") {
            result = `Successfully pinned ${pinResult.pinnedCount} tab(s) matching ${criteria}.`;
    } else if (args.action === "unpin") {
            result = `Successfully unpinned ${pinResult.unpinnedCount} tab(s) matching ${criteria}.`;
    } else {
            result = `Successfully ${pinResult.pinnedCount > 0 ? `pinned ${pinResult.pinnedCount}` : ""}${pinResult.pinnedCount > 0 && pinResult.unpinnedCount > 0 ? " and " : ""}${pinResult.unpinnedCount > 0 ? `unpinned ${pinResult.unpinnedCount}` : ""} tab(s) matching ${criteria}.`;
    }
          break;
  }
        case "createTabGroup": {
          const groupResult = this.api.createGroup(args as {
    tabIds?: string[];
    domain?: string;
    titlePattern?: string;
    urlPattern?: string;
    groupName: string;
    color?: "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan";
          });

    // Store undoable action
    this.lastUndoableAction = {
      type: "createTabGroup",
            data: { groupId: groupResult.groupId }
    };

    const criteria = args.domain
      ? `domain '${args.domain}'`
      : args.titlePattern
      ? `title pattern '${args.titlePattern}'`
      : args.urlPattern
      ? `URL pattern '${args.urlPattern}'`
      : "specified tabs";

          result = `Successfully created tab group '${args.groupName}' (ID: ${groupResult.groupId}) with ${groupResult.tabCount} tab(s) matching ${criteria}.`;
          break;
        }
        case "editTabGroup": {
          const editResult = this.api.editGroup(args as {
            groupId: string;
            newName?: string;
            newColor?: "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan";
            tabsToAdd?: string[];
            tabsToRemove?: string[];
            addByDomain?: string;
            addByTitlePattern?: string;
            removeByDomain?: string;
            removeByTitlePattern?: string;
          });
          
          if (!editResult.success) {
            result = `No changes to apply to tab group ${args.groupId}.`;
          } else {
            const existingGroup = this.window.getTabGroup(args.groupId);
            result = `Successfully edited tab group '${existingGroup?.name || args.groupId}' (${args.groupId}). Changes: ${editResult.changes.join(", ")}.`;
          }
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
        case "moveTabsToWorkspace": {
          const moveResult = this.api.moveTabsToWorkspace(args.workspaceId as string, {
            tabIds: args.tabIds as string[] | undefined,
            domain: args.domain as string | undefined,
            titlePattern: args.titlePattern as string | undefined,
          });
          result = `Moved ${moveResult.movedCount} tab(s) to workspace ${args.workspaceId}`;
          break;
        }
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
      
      console.log(`[TabCommandService] Tool ${toolName} executed successfully:`, result);
      return result;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`[TabCommandService] Error executing tool ${toolName}:`, errorMessage, e);
      throw new Error(`Failed to execute ${toolName}: ${errorMessage}`);
    }
  }

  // Removed individual tool implementation methods - now using TabManagementAPI

  /**
   * Undo the last action
   */
  public undoLastAction(): CommandResult {
    if (!this.lastUndoableAction) {
      return {
        success: false,
        message: "No action to undo.",
      };
    }

    try {
      const action = this.lastUndoableAction;
      this.lastUndoableAction = null; // Clear after undo

      switch (action.type) {
        case "closeTabs":
          // Restore closed tabs
          const closedTabs = action.data.closedTabs as Array<{ id: string; url: string; title: string; pinned: boolean }>;
          let restoredCount = 0;
          
          for (const tabInfo of closedTabs) {
            const newTab = this.window.createTab(tabInfo.url);
            if (tabInfo.pinned) {
              this.window.pinTab(newTab.id);
            }
            restoredCount++;
          }
          
          return {
            success: true,
            message: `Restored ${restoredCount} tab(s).`,
          };

        case "pinTab":
          // Unpin tabs that were pinned
          const pinnedTabIds = action.data.tabIds as string[];
          for (const tabId of pinnedTabIds) {
            const tab = this.window.getTab(tabId);
            if (tab && tab.pinned) {
              this.window.unpinTab(tabId);
            }
          }
          return {
            success: true,
            message: `Unpinned ${pinnedTabIds.length} tab(s).`,
          };

        case "unpinTab":
          // Re-pin tabs that were unpinned
          const unpinnedTabIds = action.data.tabIds as string[];
          for (const tabId of unpinnedTabIds) {
            const tab = this.window.getTab(tabId);
            if (tab && !tab.pinned) {
              this.window.pinTab(tabId);
            }
          }
          return {
            success: true,
            message: `Re-pinned ${unpinnedTabIds.length} tab(s).`,
          };

        case "createTabGroup":
          // Delete the created group
          const groupId = action.data.groupId as string;
          this.window.deleteTabGroup(groupId);
          return {
            success: true,
            message: `Removed tab group.`,
          };

        case "editTabGroup":
          // Restore group to previous state
          // This would require storing previous state, simplified for now
          return {
            success: false,
            message: "Undo for group editing is not yet supported.",
          };

        default:
          return {
            success: false,
            message: `Undo not supported for action type: ${action.type}`,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error undoing action: ${errorMessage}`,
      };
    }
  }

  // Removed editTabGroup method - now using TabManagementAPI
}

