/**
 * IntelligentRouter - Orchestrates 4-tier routing system
 * 
 * Tier 1: Pattern Matching <10ms)
 * Tier 2: Flan-T5-Small (20% of queries, 40-60ms) super fast and small
 * Tier 3: SLM Router - Phi-3.5-mini or Qwen2.5-1.5B (90-150ms)
 * Tier 4: Gemini API (complex edge cases, 800-2000ms)
 * 
 * Routes queries intelligently based on complexity and confidence
 */

import { PatternMatcher } from './PatternMatcher';
import { TabGroupingAI } from './TabGroupingAI';
import { SLMRouter } from './SLMRouter';
import { Tab } from './Tab';
import { PerformanceMetrics } from '../utils/PerformanceMetrics';
import { deviceCapabilities } from '../utils/DeviceCapabilities';

export interface RoutingResult {
  action: any;
  route: 'pattern' | 't5' | 'slm' | 'gemini' | 'fallback' | 'direct_llm';
  latency: number;
  confidence: number;
  model?: string;
  reasoning?: string;
}

export class IntelligentRouter {
  private patternMatcher: PatternMatcher;
  private t5Model: TabGroupingAI; // Reuse existing (now uses Flan-T5-Small)
  private slmRouter: SLMRouter;
  private metrics: PerformanceMetrics;

  constructor() {
    this.patternMatcher = new PatternMatcher();
    this.t5Model = new TabGroupingAI();
    this.t5Model.preloadModel();
    this.slmRouter = new SLMRouter();
    this.metrics = new PerformanceMetrics();
  }

  async routeQuery(
    query: string,
    tabs: Tab[],
    context: { activeTabId?: string } = {}
  ): Promise<RoutingResult> {
    const startTime = performance.now();

    // PRE-TIER: Conversational queries - route directly to LLM (no tab management needed)
    if (this.isConversationalQuery(query)) {
      const latency = performance.now() - startTime;
      this.metrics.record('direct_llm', latency, true, query, 1.0, 'Direct LLM');

      return {
        action: {
          shouldUseGemini: true,
          isConversational: true,
          query: query
        },
        route: 'direct_llm',
        latency,
        confidence: 1.0,
        model: 'Gemini API (direct)',
        reasoning: 'Conversational query - routing directly to LLM for fast response'
      };
    }

    // TIER 1: Pattern Matching (70% of queries, <10ms)
    const patternMatch = await this.patternMatcher.match(query, tabs, context);
    if (patternMatch) {
      const latency = performance.now() - startTime;
      this.metrics.record('pattern', latency, true, query, patternMatch.confidence, 'Pattern Matching');

      return {
        action: patternMatch.result,
        route: 'pattern',
        latency,
        confidence: patternMatch.confidence,
        model: 'None (Pattern Matching)',
        reasoning: `Matched pattern: ${patternMatch.name}`
      };
    }

    // TIER 2: Flan-T5-Small + Knowledge Graph
    // Simple grouping operations route here for fast semantic grouping
    if (this.isGroupingQuery(query)) {
      // Check if this is a simple grouping query (domain-specific, fast)
      if (this.isSimpleGroupingQuery(query)) {
        try {
          // Convert tabs to TabInfo format
          const tabInfos = tabs.map(t => ({
            id: t.id,
            title: t.title,
            url: t.url,
          }));

          // Use T5 + Knowledge Graph for simple grouping operations
          // Knowledge Graph provides semantic understanding and context awareness
          // Defer group name generation for faster response (name can be updated later)
          const seedTabIds = tabs.slice(0, Math.min(3, tabs.length)).map(t => t.id);
          const suggestion = await this.t5Model.suggestTabGrouping(
            seedTabIds,
            tabInfos,
            [],
            true, // deferGroupName - faster response, name generated in background
            true   // useKnowledgeGraph - ALWAYS enabled for accurate grouping
          );

          const latency = performance.now() - startTime;
          this.metrics.record('t5', latency, true, query, suggestion.confidence, 'Flan-T5-Small + Knowledge Graph');

          return {
            action: suggestion,
            route: 't5',
            latency,
            confidence: suggestion.confidence,
            model: 'Flan-T5-Small + Knowledge Graph',
            reasoning: 'Simple grouping query handled by T5 with Knowledge Graph for fast semantic accuracy'
          };
        } catch (error) {
          console.warn('[IntelligentRouter] T5+KG failed, escalating to SLM:', error);
          // Fall through to SLM for complex grouping
        }
      }
      // Complex grouping queries fall through to SLM (below)
    }

    // Check for workspace or container operations - route to SLM
    if (this.isWorkspaceQuery(query) || this.isContainerQuery(query)) {
      // Workspace and container operations need complex reasoning
      // Route to SLM (Phi) with Gemini backup
      if (this.slmRouter.isReady()) {
        try {
          const eventHistory = this.t5Model.getEventHistory?.() || [];
          const result = await this.slmRouter.analyze(query, tabs, eventHistory);
          const latency = performance.now() - startTime;
          this.metrics.record('slm', latency, true, query, result.confidence, this.slmRouter.getModelName());

          return {
            action: result,
            route: 'slm',
            latency,
            confidence: result.confidence,
            model: this.slmRouter.getModelName(),
            reasoning: result.reasoning || 'Workspace/container operation handled by SLM'
          };
        } catch (error) {
          console.warn('[IntelligentRouter] SLM failed for workspace/container, escalating to Gemini:', error);
          // Fall through to Gemini
        }
      }

      // TIER 4: Gemini API backup for workspace/container operations
      if (this.shouldUseGemini(query)) {
        try {
          const latency = performance.now() - startTime;
          this.metrics.record('gemini', latency, true, query, 0.9, 'Gemini API');

          return {
            action: {
              message: 'Workspace/container operation requires Gemini API',
              shouldUseGemini: true,
              query: query
            },
            route: 'gemini',
            latency,
            confidence: 0.9,
            model: 'Gemini API (gemini-2.5-pro)',
            reasoning: 'Workspace/container operation escalated to Gemini for complex reasoning'
          };
        } catch (error) {
          console.warn('[IntelligentRouter] Gemini escalation failed:', error);
        }
      }
    }

    // TIER 3: SLM for complex reasoning (10% of queries, 90-150ms)
    // This handles:
    // - Complex grouping queries (not simple domain-specific ones)
    // - Workspace/container operations (already handled above)
    // - Other complex queries requiring reasoning
    if (this.slmRouter.isReady()) {
      try {
        // Get event history from T5 model (they share the same history)
        const eventHistory = this.t5Model.getEventHistory?.() || [];

        const result = await this.slmRouter.analyze(query, tabs, eventHistory);
        const latency = performance.now() - startTime;

        // Determine reasoning message based on query type
        let reasoning = result.reasoning;
        if (this.isGroupingQuery(query) && !this.isSimpleGroupingQuery(query)) {
          reasoning = 'Complex grouping query handled by SLM with Knowledge Graph for intelligent reasoning';
        }

        this.metrics.record('slm', latency, true, query, result.confidence, this.slmRouter.getModelName());

        return {
          action: result,
          route: 'slm',
          latency,
          confidence: result.confidence,
          model: this.slmRouter.getModelName(),
          reasoning: reasoning || result.reasoning
        };
      } catch (error) {
        console.warn('[IntelligentRouter] SLM failed, escalating to Gemini:', error);
      }
    }

    // TIER 4: Gemini API for premium quality (complex edge cases, 800-2000ms)
    // Only use if SLM fails and query is very complex or requires high-quality reasoning
    if (this.isComplexQuery(query) && this.shouldUseGemini(query)) {
      try {
        // Use Gemini API via LLMClient for complex queries
        // Note: This requires LLMClient to be initialized with Gemini provider
        const latency = performance.now() - startTime;
        this.metrics.record('gemini', latency, true, query, 0.9, 'Gemini API');

        // For now, return a structured response indicating Gemini should be used
        // The actual Gemini call would be handled by LLMClient in the chat flow
        return {
          action: {
            message: 'Complex query requires Gemini API',
            shouldUseGemini: true,
            query: query
          },
          route: 'gemini',
          latency,
          confidence: 0.9,
          model: 'Gemini API (gemini-2.5-pro)',
          reasoning: 'Complex query escalated to Gemini for premium quality'
        };
      } catch (error) {
        console.warn('[IntelligentRouter] Gemini escalation failed:', error);
      }
    }

    // CRITICAL: Before fallback, check if this is a grouping query
    // Grouping queries should NEVER fail - ALWAYS route to Gemini if T5/SLM failed
    if (this.isGroupingQuery(query)) {
      // Grouping queries must always succeed - route to Gemini
      const latency = performance.now() - startTime;
      this.metrics.record('gemini', latency, true, query, 0.95, 'Gemini API');

      console.log('[IntelligentRouter] Grouping query detected - routing to Gemini for guaranteed execution');

      return {
        action: {
          shouldUseGemini: true,
          isGroupingQuery: true,
          query: query,
          // Force execution - this ensures LLMClient will call Gemini
          forceExecution: true
        },
        route: 'gemini',
        latency,
        confidence: 0.95,
        model: 'Gemini API (gemini-2.5-pro)',
        reasoning: 'Grouping query - routing to Gemini for guaranteed execution (T5/SLM unavailable or failed)'
      };
    }

    // CRITICAL: Before fallback, check if this is an open/close/pin operation
    // These should NEVER fail - route to SLM or LLM if pattern matching failed
    if (this.isTabActionQuery(query)) {
      // Try SLM first if available
      if (this.slmRouter.isReady()) {
        try {
          const eventHistory = this.t5Model.getEventHistory?.() || [];
          const result = await this.slmRouter.analyze(query, tabs, eventHistory);
          const latency = performance.now() - startTime;
          this.metrics.record('slm', latency, true, query, result.confidence, this.slmRouter.getModelName());

          return {
            action: result,
            route: 'slm',
            latency,
            confidence: result.confidence,
            model: this.slmRouter.getModelName(),
            reasoning: result.reasoning || 'Tab action query handled by SLM (pattern match failed)'
          };
        } catch (error) {
          console.warn('[IntelligentRouter] SLM failed for tab action, escalating to Gemini:', error);
        }
      }

      // If SLM not available or failed, route to Gemini
      const latency = performance.now() - startTime;
      this.metrics.record('gemini', latency, true, query, 0.95, 'Gemini API');

      console.log('[IntelligentRouter] Tab action query detected - routing to Gemini for guaranteed execution');

      return {
        action: {
          shouldUseGemini: true,
          isTabAction: true,
          query: query,
          // Force execution - this ensures LLMClient will call Gemini
          forceExecution: true
        },
        route: 'gemini',
        latency,
        confidence: 0.95,
        model: 'Gemini API (gemini-2.5-pro)',
        reasoning: 'Tab action query (open/close/pin) - routing to Gemini for guaranteed execution'
      };
    }

    // FALLBACK: This should RARELY be reached now
    // Only non-critical queries that don't match any patterns should get here
    const latency = performance.now() - startTime;

    console.warn('[IntelligentRouter] Query fell through to fallback - this should be rare:', query);

    // For any remaining queries, try to route to Gemini instead of heuristics
    this.metrics.record('gemini', latency, true, query, 0.7, 'Gemini API');

    return {
      action: {
        shouldUseGemini: true,
        query: query,
        forceExecution: true
      },
      route: 'gemini',
      latency,
      confidence: 0.7,
      model: 'Gemini API (gemini-2.5-pro)',
      reasoning: 'Query did not match any patterns - routing to Gemini for best-effort execution'
    };
  }


  private isConversationalQuery(query: string): boolean {
    // Conversational queries that don't require tab management tools
    // These should go directly to LLM for fast processing
    const lowerQuery = query.toLowerCase().trim();

    // SHORT FOLLOW-UP RESPONSES - Route to LLM which has conversation context
    // These are likely answers to previous questions (e.g., "5" after "how many tabs?")
    const isShortFollowUp = (
      /^\d+$/.test(lowerQuery) || // Single number: "5", "10", "3"
      /^(yes|no|y|n|ok|sure|yeah|nope|maybe|correct|right|wrong)$/i.test(lowerQuery) || // Yes/No responses
      (lowerQuery.split(/\s+/).length <= 2 && lowerQuery.length <= 20 && !/tab|open|close|pin|group/i.test(lowerQuery)) // Very short responses without tab keywords
    );

    // CONTEXT-DEPENDENT FOLLOW-UP RESPONSES - Need conversation context to understand
    // These are responses to previous questions that need context to interpret
    const isContextDependentFollowUp = (
      /^(just\s+)?(do\s+it|go\s+ahead|proceed|continue|start|begin)(\s+.*)?$/i.test(lowerQuery) || // Action confirmations: "just do it", "go ahead", "just do it random ones"
      /^(just\s+)?(do|make|create|open|close|group)\s+(it|them|those|these|random|any|some)(\s+.*)?$/i.test(lowerQuery) || // Imperative follow-ups: "just do random", "open any"
      /^(just\s+)?do\s+it\s+(random|any|some|whatever)(\s+.*)?$/i.test(lowerQuery) || // Explicit: "just do it random", "just do it random ones"
      /^(random|any|some|whatever|anything|something)(\s+(ones?|tabs?|sites?|urls?))?$/i.test(lowerQuery) || // Vague requests needing context: "random ones", "any tabs"
      /^(just\s+)?(pick|choose|select)\s+(random|any|some)(\s+.*)?$/i.test(lowerQuery) || // Selection requests: "pick random", "choose any"
      /^(just\s+)?(use|try|go\s+with)\s+(random|any|some)(\s+.*)?$/i.test(lowerQuery) // Usage requests: "use random", "try any"
    );

    if (isShortFollowUp || isContextDependentFollowUp) {
      return true; // Route to LLM - it has full conversation context to understand the follow-up
    }

    // Identity/capability queries
    const identityPatterns = [
      /^who\s+are\s+you/i,
      /^what\s+are\s+you/i,
      /^what\s+can\s+you\s+do/i,
      /^what\s+do\s+you\s+do/i,
      /^how\s+can\s+you\s+help/i,
      /^what\s+are\s+your\s+capabilities/i,
      /^what\s+are\s+your\s+features/i,
      /^help\s*$/i,
      /^what\s+is\s+this/i,
      /^tell\s+me\s+about\s+yourself/i
    ];

    // Page summarization queries
    const summarizationPatterns = [
      /^summar(?:ize|ise|y)\s+(?:this\s+)?(?:page|site|website)/i,
      /^what'?s\s+(?:on\s+)?(?:this\s+)?(?:page|site)/i,
      /^tell\s+me\s+about\s+(?:this\s+)?(?:page|site)/i,
      /^explain\s+(?:this\s+)?(?:page|site)/i,
      /^describe\s+(?:this\s+)?(?:page|site)/i,
      /^what\s+does\s+(?:this\s+)?(?:page|site)\s+(?:say|contain|show)/i
    ];

    // General chat/conversation queries (no tab management keywords)
    const chatPatterns = [
      /^hi\s*$/i,
      /^hello\s*$/i,
      /^hey\s*$/i,
      /^thanks/i,
      /^thank\s+you/i,
      /^how\s+are\s+you/i
    ];

    // Check if query matches any conversational pattern
    const isIdentity = identityPatterns.some(pattern => pattern.test(lowerQuery));
    const isSummarization = summarizationPatterns.some(pattern => pattern.test(lowerQuery));
    const isChat = chatPatterns.some(pattern => pattern.test(lowerQuery));

    // Also check if it's a general question without tab management keywords
    const hasTabKeywords = /tab|close|open|pin|group|workspace|container|folder|organize/i.test(lowerQuery);
    const isQuestion = /^(what|who|how|why|when|where|can\s+you|will\s+you|do\s+you)/i.test(lowerQuery);
    const isGeneralQuestion = isQuestion && !hasTabKeywords && lowerQuery.split(/\s+/).length <= 10;

    return isIdentity || isSummarization || isChat || isGeneralQuestion;
  }

  private isTabActionQuery(query: string): boolean {
    // Detect open/close/pin operations that should NEVER fail
    // These are critical operations that need reliable execution

    // Open operations
    const isOpen = /^open\s+/i.test(query) && (
      /\d+\s+.*\s+tabs?/i.test(query) || // "open 4 linkedin tabs"
      /(facebook|linkedin|youtube|github|twitter|instagram|outlook|gmail|reddit|fb|li|yt|gh|tw|ig)/i.test(query) || // Domain names
      /https?:\/\//i.test(query) || // URLs
      /\.(com|org|net|io|edu|gov|co|dev)/i.test(query) // Domain extensions
    );

    // Close operations
    const isClose = /^close\s+/i.test(query) && (
      /(all|tabs?|facebook|linkedin|youtube|github|twitter|instagram|outlook|gmail|reddit|fb|li|yt|gh|tw|ig)/i.test(query)
    );

    // Pin/unpin operations
    const isPin = /^(pin|unpin)\s+/i.test(query);

    return isOpen || isClose || isPin;
  }

  private isGroupingQuery(query: string): boolean {
    // All grouping operations
    return /group|organize|categorize/i.test(query);
  }

  private isSimpleGroupingQuery(query: string): boolean {
    // Simple grouping: domain-specific, direct grouping commands
    // Examples: "group facebook tabs", "group all linkedin", "group youtube tabs"
    const lowerQuery = query.toLowerCase().trim();

    // Match patterns like:
    // - "group [all] [my] facebook tabs"
    // - "group [all] linkedin [tabs]"
    // - "group [all] [my] youtube [tabs]"
    const simplePattern = /^group\s+(?:all\s+)?(?:my\s+)?(facebook|fb|linkedin|linked\s*in|li|youtube|yt|github|gh|twitter|x|instagram|ig|pinterest|reddit|stackoverflow|stack\s*overflow|gmail|outlook|amazon|netflix|spotify|discord|slack|zoom|teams|microsoft|google|apple|meta)\s*(?:tabs?)?$/i;

    return simplePattern.test(lowerQuery);
  }

  private isWorkspaceQuery(query: string): boolean {
    // Workspace operations need complex reasoning - route to SLM
    return /workspace|move.*to.*workspace|put.*to.*workspace|send.*to.*workspace|switch.*workspace|create.*workspace/i.test(query);
  }

  private isContainerQuery(query: string): boolean {
    // Container operations need complex reasoning - route to SLM
    return /container|move.*to.*container|put.*to.*container|assign.*container/i.test(query);
  }

  private isComplexQuery(query: string): boolean {
    // Complex queries have:
    // - Multiple clauses (and, or, but, also)
    // - Negation (not, don't, can't)
    // - Long queries (>15 words)
    // - Abstract concepts (workflow, context, relationship)
    const hasMultipleClauses = /and|or|but|also|furthermore|however/i.test(query);
    const hasNegation = /not|no |don't|can't|won't|shouldn't/i.test(query);
    const wordCount = query.split(/\s+/).length;
    const hasAbstractConcepts = /workflow|context|relationship|semantic|temporal|pattern/i.test(query);

    return (hasMultipleClauses || hasNegation || wordCount > 15 || hasAbstractConcepts);
  }

  private shouldUseGemini(query: string): boolean {
    // Workspace and container operations always get Gemini backup
    if (this.isWorkspaceQuery(query) || this.isContainerQuery(query)) {
      return true;
    }

    // Use Gemini for queries that need:
    // - High-quality reasoning
    // - Complex multi-step analysis
    // - Contextual understanding across multiple domains
    const needsHighQuality = /analyze|understand|explain|reason|consider|evaluate/i.test(query);
    const isMultiStep = /then|after|before|next|sequence|step/i.test(query);
    const needsContext = /context|background|history|previous|related/i.test(query);

    return needsHighQuality || isMultiStep || needsContext;
  }



  getMetrics() {
    return this.metrics.getStats();
  }

  getPatternCount(): number {
    return this.patternMatcher.getPatternCount();
  }

  /**
   * Get device capabilities
   */
  async getDeviceCapabilities() {
    return await deviceCapabilities.detect();
  }
}

