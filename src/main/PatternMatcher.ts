/**
 * PatternMatcher - Tier 1: Fast pattern matching(<10ms)
 * 
 * Handles common tab management commands using regex patterns
 * No AI needed - instant execution for simple commands
 */

import { Tab } from './Tab';

interface PatternMatch {
  name: string;
  params: Record<string, string>;
  confidence: number;
  result: any;
  latency: number;
}

interface PatternHandler {
  regex: RegExp;
  handler: (tabs: Tab[], params: Record<string, string>, context: { activeTabId?: string }) => Promise<any>;
  description: string;
}

export class PatternMatcher {
  private patterns = new Map<string, PatternHandler>();

  constructor() {
    this.registerPatterns();
  }

  private registerPatterns(): void {
    // Close patterns
    this.register('close_linkedin', {
      regex: /^close\s+(?:(\d+)\s+)?(?:all\s+)?(?:my\s+)?(?:linkedin|li)(?:\s+tabs?)?$/i,
      handler: async (tabs, params) => {
        let matching = tabs.filter(t => t.url.toLowerCase().includes('linkedin'));

        // If quantity specified, limit to that number
        if (params.count) {
          const count = parseInt(params.count, 10);
          matching = matching.slice(0, count);
        }

        return { action: 'close', tabIds: matching.map(t => t.id), count: matching.length };
      },
      description: 'Close LinkedIn tabs (optionally specify quantity)'
    });

    this.register('close_facebook', {
      regex: /^close\s+(?:(\d+)\s+)?(?:all\s+)?(?:my\s+)?(?:facebook|fb)(?:\s+tabs?)?$/i,
      handler: async (tabs, params) => {
        let matching = tabs.filter(t => t.url.toLowerCase().includes('facebook'));

        // If quantity specified, limit to that number
        if (params.count) {
          const count = parseInt(params.count, 10);
          matching = matching.slice(0, count);
        }

        return { action: 'close', tabIds: matching.map(t => t.id), count: matching.length };
      },
      description: 'Close Facebook tabs (optionally specify quantity)'
    });

    this.register('close_twitter', {
      regex: /^close\s+(?:(\d+)\s+)?(?:all\s+)?(?:my\s+)?(?:twitter|x\.com|tweet)(?:\s+tabs?)?$/i,
      handler: async (tabs, params) => {
        let matching = tabs.filter(t =>
          t.url.toLowerCase().includes('twitter') ||
          t.url.toLowerCase().includes('x.com')
        );

        // If quantity specified, limit to that number
        if (params.count) {
          const count = parseInt(params.count, 10);
          matching = matching.slice(0, count);
        }

        return { action: 'close', tabIds: matching.map(t => t.id), count: matching.length };
      },
      description: 'Close Twitter/X tabs (optionally specify quantity)'
    });

    this.register('close_domain', {
      regex: /close.*(?:all\s+)?(?:my\s+)?tabs?\s+(?:from\s+)?([a-z0-9.-]+\.(?:com|org|net|io|edu|gov|co|dev))/i,
      handler: async (tabs, params) => {
        const domain = params.domain.toLowerCase();
        const matching = tabs.filter(t => {
          try {
            return new URL(t.url).hostname.toLowerCase().includes(domain);
          } catch {
            return false;
          }
        });
        return { action: 'close', tabIds: matching.map(t => t.id), count: matching.length };
      },
      description: 'Close tabs from specific domain'
    });

    this.register('close_all_except_active', {
      regex: /close.*(?:all\s+)?tabs?\s+(?:except|but)\s+(?:this|active|current)/i,
      handler: async (tabs, _, context) => {
        const activeTabId = context.activeTabId;
        const matching = tabs.filter(t => t.id !== activeTabId);
        return { action: 'close', tabIds: matching.map(t => t.id), count: matching.length };
      },
      description: 'Close all tabs except active'
    });

    this.register('close_all', {
      regex: /close\s+(?:all\s+)?tabs?$/i,
      handler: async (tabs, _, context) => {
        const activeTabId = context.activeTabId;
        const matching = tabs.filter(t => t.id !== activeTabId); // Keep active tab
        return { action: 'close', tabIds: matching.map(t => t.id), count: matching.length };
      },
      description: 'Close all tabs'
    });

    // NOTE: Grouping patterns removed - all grouping operations route to T5+Knowledge Graph
    // This ensures accurate semantic grouping with context awareness

    // Pin patterns
    this.register('pin_active', {
      regex: /pin\s+(?:this|active|current)\s+tab/i,
      handler: async (_tabs, _, context) => {
        if (!context.activeTabId) return { action: 'pin', tabIds: [], count: 0 };
        return { action: 'pin', tabIds: [context.activeTabId], count: 1 };
      },
      description: 'Pin active tab'
    });

    this.register('unpin_all', {
      regex: /unpin\s+(?:all\s+)?tabs?/i,
      handler: async (tabs, _) => {
        const pinned = tabs.filter(t => t.pinned);
        return { action: 'unpin', tabIds: pinned.map(t => t.id), count: pinned.length };
      },
      description: 'Unpin all tabs'
    });

    // Find patterns
    this.register('find_tabs', {
      regex: /find.*tabs?.*(?:about|with|containing)\s+['"]?([^'"]+)['"]?/i,
      handler: async (tabs, params) => {
        const keyword = params.keyword.toLowerCase();
        const matching = tabs.filter(t =>
          t.title.toLowerCase().includes(keyword) ||
          t.url.toLowerCase().includes(keyword)
        );
        return { action: 'find', tabIds: matching.map(t => t.id), count: matching.length };
      },
      description: 'Find tabs by keyword'
    });

    // Open patterns
    // Shortcut patterns (fb, yt, gh, li, etc.)
    this.register('open_shortcut', {
      regex: /^open\s+(fb|facebook|yt|youtube|gh|github|li|linkedin|tw|twitter|ig|instagram|outlook|gmail|reddit)$/i,
      handler: async (_tabs, params) => {
        const shortcuts: Record<string, string> = {
          'fb': 'facebook.com',
          'facebook': 'facebook.com',
          'yt': 'youtube.com',
          'youtube': 'youtube.com',
          'gh': 'github.com',
          'github': 'github.com',
          'li': 'linkedin.com',
          'linkedin': 'linkedin.com',
          'tw': 'twitter.com',
          'twitter': 'twitter.com',
          'ig': 'instagram.com',
          'instagram': 'instagram.com',
          'outlook': 'outlook.com',
          'gmail': 'gmail.com',
          'reddit': 'reddit.com'
        };

        const shortcut = params.shortcut?.toLowerCase() || '';
        const domain = shortcuts[shortcut] || shortcut;
        const url = `https://${domain}`;

        return { action: 'open', url, count: 1 };
      },
      description: 'Open site by shortcut (fb, yt, gh, etc.)'
    });

    // Open multiple tabs by domain (e.g., "open 5 facebook tabs", "open 6 linkedin", "open 4 linked in tabs")
    this.register('open_multiple_tabs_by_domain', {
      regex: /^open\s+(\d+)\s+(?:my\s+)?(facebook|fb|linked\s*in|li|youtube|yt|github|gh|twitter|tw|instagram|ig|outlook|gmail|reddit)\s+tabs?$/i,
      handler: async (_tabs, params) => {
        const count = parseInt(params.count || '1');
        let domainShortcut = params.domain?.toLowerCase() || '';

        // Normalize "linked in" or "linkedin" to "linkedin"
        domainShortcut = domainShortcut.replace(/\s+/g, '');

        const shortcuts: Record<string, string> = {
          'fb': 'facebook.com',
          'facebook': 'facebook.com',
          'li': 'linkedin.com',
          'linkedin': 'linkedin.com',
          'yt': 'youtube.com',
          'youtube': 'youtube.com',
          'gh': 'github.com',
          'github': 'github.com',
          'tw': 'twitter.com',
          'twitter': 'twitter.com',
          'ig': 'instagram.com',
          'instagram': 'instagram.com',
          'outlook': 'outlook.com',
          'gmail': 'gmail.com',
          'reddit': 'reddit.com'
        };

        const domain = shortcuts[domainShortcut] || domainShortcut;
        const url = `https://${domain}`;

        return {
          action: 'open_multiple',
          url,
          count,
          urls: Array(count).fill(url)
        };
      },
      description: 'Open multiple tabs by domain (e.g., open 5 facebook tabs)'
    });

    // Open URL pattern (generic)
    this.register('open_url', {
      regex: /^open\s+(?:tab\s+with\s+)?(?:url\s+)?(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9.-]+\.(?:com|org|net|io|edu|gov|co|dev))$/i,
      handler: async (_tabs, params) => {
        let url = params.url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = `https://${url}`;
        }
        return { action: 'open', url, count: 1 };
      },
      description: 'Open URL in new tab'
    });

    // Focus patterns
    this.register('focus_work', {
      regex: /(?:I\s+want\s+to\s+)?focus\s+on\s+(?:working|work)/i,
      handler: async (tabs, _) => {
        // Identify work-related tabs based on domain and title
        const workTabs = tabs.filter(t => {
          const domain = t.domain.toLowerCase();
          const title = t.title.toLowerCase();

          // Work-related domains
          const workDomains = [
            'github', 'gitlab', 'bitbucket',
            'linkedin', 'stackoverflow', 'stackexchange',
            'jira', 'confluence', 'atlassian',
            'slack', 'teams', 'zoom',
            'gmail', 'outlook', 'office365',
            'notion', 'trello', 'asana',
            'figma', 'sketch', 'adobe'
          ];

          const isWorkDomain = workDomains.some(wd => domain.includes(wd));
          const hasWorkTitle = title.includes('work') ||
            title.includes('project') ||
            title.includes('task') ||
            title.includes('meeting');

          return isWorkDomain || hasWorkTitle;
        });

        const nonWorkTabs = tabs.filter(t => !workTabs.includes(t));

        return {
          action: 'focus',
          tabIds: workTabs.map(t => t.id),
          hideTabIds: nonWorkTabs.map(t => t.id),
          count: workTabs.length,
          hiddenCount: nonWorkTabs.length
        };
      },
      description: 'Focus on work tabs'
    });
  }

  private register(name: string, handler: PatternHandler): void {
    this.patterns.set(name, handler);
  }

  async match(
    query: string,
    tabs: Tab[],
    context: { activeTabId?: string } = {}
  ): Promise<PatternMatch | null> {
    const startTime = performance.now();

    for (const [name, pattern] of this.patterns.entries()) {
      const match = query.match(pattern.regex);
      if (match) {
        // Extract parameters from regex groups
        const params: Record<string, string> = {};
        const groups = match.slice(1); // Skip full match

        if (groups.length > 0) {
          // Map groups to parameter names based on pattern
          if (name === 'close_domain') {
            params.domain = groups[0];
          } else if (name === 'find_tabs') {
            params.keyword = groups[0];
          } else if (name === 'open_url') {
            params.url = groups[0];
          } else if (name === 'open_shortcut') {
            params.shortcut = groups[0];
          } else if (name === 'open_multiple_tabs_by_domain') {
            params.count = groups[0];
            params.domain = groups[1];
          } else if (name === 'close_linkedin' || name === 'close_facebook' || name === 'close_twitter') {
            // Extract count if present (first capture group)
            if (groups[0]) {
              params.count = groups[0];
            }
          }
        }

        const result = await pattern.handler(tabs, params, context);
        const latency = performance.now() - startTime;

        return {
          name,
          params,
          confidence: 0.95, // High confidence for pattern matches
          result,
          latency
        };
      }
    }

    return null;
  }

  getPatternCount(): number {
    return this.patterns.size;
  }

  getPatternDescriptions(): Array<{ name: string; description: string }> {
    return Array.from(this.patterns.entries()).map(([name, pattern]) => ({
      name,
      description: pattern.description
    }));
  }
}

