/**
 * FunctionRegistry - Function calling pattern for tab management actions
 * 
 * Maps natural language queries to structured function calls
 * Provides extensible API for tab actions
 */

import { Tab } from '../main/Tab';

export interface FunctionCall {
  function: string;
  args: Record<string, any>;
  confidence: number;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'string[]';
    description: string;
    required?: boolean;
  }[];
}

export type TabActionFunc = (args: any, tabs: Tab[]) => Promise<any>;

export class FunctionRegistry {
  private functions = new Map<string, TabActionFunc>();
  private definitions: FunctionDefinition[] = [];

  /**
   * Register a tab action function
   */
  register(
    name: string,
    description: string,
    parameters: FunctionDefinition['parameters'],
    handler: TabActionFunc
  ): void {
    this.functions.set(name, handler);
    this.definitions.push({
      name,
      description,
      parameters
    });
  }

  /**
   * Execute a function call
   */
  async execute(call: FunctionCall, tabs: Tab[]): Promise<any> {
    const handler = this.functions.get(call.function);
    if (!handler) {
      throw new Error(`Function ${call.function} not found`);
    }

    return await handler(call.args, tabs);
  }

  /**
   * Get function definitions for LLM prompt
   */
  getFunctionDefinitions(): FunctionDefinition[] {
    return [...this.definitions];
  }

  /**
   * Get function definitions as formatted string for prompt
   */
  getFunctionDefinitionsPrompt(): string {
    return this.definitions.map(def => {
      const params = def.parameters.map(p => {
        const required = p.required !== false ? ' (required)' : ' (optional)';
        return `  - ${p.name}: ${p.type}${required} - ${p.description}`;
      }).join('\n');

      return `${def.name}(${def.parameters.map(p => p.name).join(', ')})
Description: ${def.description}
Parameters:
${params}`;
    }).join('\n\n');
  }

  /**
   * Check if function exists
   */
  hasFunction(name: string): boolean {
    return this.functions.has(name);
  }

  /**
   * Get all registered function names
   */
  getFunctionNames(): string[] {
    return Array.from(this.functions.keys());
  }
}

// Default function registry instance
export const tabFunctionRegistry = new FunctionRegistry();

// Register default tab management functions
tabFunctionRegistry.register(
  'closeTabsByPattern',
  'Close tabs matching a pattern (domain, title keyword, or URL pattern)',
  [
    { name: 'pattern', type: 'string', description: 'Pattern to match (domain, keyword, or URL)', required: true }
  ],
  async (args: { pattern: string }, tabs: Tab[]) => {
    const { pattern } = args;
    const lowerPattern = pattern.toLowerCase();

    const matchingTabs = tabs.filter(tab =>
      tab.domain.toLowerCase().includes(lowerPattern) ||
      tab.title.toLowerCase().includes(lowerPattern) ||
      tab.url.toLowerCase().includes(lowerPattern)
    );

    return {
      action: 'close',
      tabIds: matchingTabs.map(t => t.id),
      count: matchingTabs.length,
      message: `Would close ${matchingTabs.length} tab(s) matching "${pattern}"`
    };
  }
);

tabFunctionRegistry.register(
  'createTabGroup',
  'Create a new tab group with specified tabs',
  [
    { name: 'tabIds', type: 'string[]', description: 'Array of tab IDs to group', required: true },
    { name: 'groupName', type: 'string', description: 'Name for the group', required: true },
    { name: 'color', type: 'string', description: 'Optional color for the group', required: false }
  ],
  async (args: { tabIds: string[]; groupName: string; color?: string }, tabs: Tab[]) => {
    const { tabIds, groupName, color } = args;

    const groupTabs = tabs.filter(t => tabIds.includes(t.id));

    return {
      action: 'group',
      tabIds,
      groupName,
      color,
      count: groupTabs.length,
      message: `Would create group "${groupName}" with ${groupTabs.length} tab(s)`
    };
  }
);

tabFunctionRegistry.register(
  'findTabsByKeyword',
  'Find tabs matching keywords in title or URL',
  [
    { name: 'keywords', type: 'string[]', description: 'Keywords to search for', required: true }
  ],
  async (args: { keywords: string[] }, tabs: Tab[]) => {
    const { keywords } = args;

    const matchingTabs = tabs.filter(tab => {
      const searchText = `${tab.title} ${tab.url}`.toLowerCase();
      return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
    });

    return {
      action: 'find',
      tabIds: matchingTabs.map(t => t.id),
      count: matchingTabs.length,
      message: `Found ${matchingTabs.length} tab(s) matching keywords: ${keywords.join(', ')}`
    };
  }
);

tabFunctionRegistry.register(
  'archiveTabs',
  'Archive (suspend) tabs to save memory',
  [
    { name: 'tabIds', type: 'string[]', description: 'Array of tab IDs to archive', required: true }
  ],
  async (args: { tabIds: string[] }, _tabs: Tab[]) => {
    const { tabIds } = args;

    return {
      action: 'archive',
      tabIds,
      count: tabIds.length,
      message: `Would archive ${tabIds.length} tab(s)`
    };
  }
);

tabFunctionRegistry.register(
  'pinTabs',
  'Pin tabs to keep them always visible',
  [
    { name: 'tabIds', type: 'string[]', description: 'Array of tab IDs to pin', required: true }
  ],
  async (args: { tabIds: string[] }, _tabs: Tab[]) => {
    const { tabIds } = args;

    return {
      action: 'pin',
      tabIds,
      count: tabIds.length,
      message: `Would pin ${tabIds.length} tab(s)`
    };
  }
);

tabFunctionRegistry.register(
  'suggestTabGroups',
  'Suggest tab groups based on semantic similarity',
  [
    { name: 'minGroupSize', type: 'number', description: 'Minimum tabs per group', required: false }
  ],
  async (args: { minGroupSize?: number }, tabs: Tab[]) => {
    const minSize = args.minGroupSize || 2;

    // Simple domain-based grouping as example
    const domainMap = new Map<string, Tab[]>();
    tabs.forEach(tab => {
      if (!domainMap.has(tab.domain)) {
        domainMap.set(tab.domain, []);
      }
      domainMap.get(tab.domain)!.push(tab);
    });

    const suggestions = Array.from(domainMap.entries())
      .filter(([_, tabs]) => tabs.length >= minSize)
      .map(([domain, tabs]) => ({
        groupName: domain,
        tabIds: tabs.map(t => t.id),
        confidence: 0.7
      }));

    return {
      action: 'suggest',
      suggestions,
      count: suggestions.length,
      message: `Found ${suggestions.length} potential group(s)`
    };
  }
);

