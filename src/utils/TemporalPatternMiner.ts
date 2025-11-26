/**
 * TemporalPatternMiner - Extracts workflow patterns from user behavior
 * 
 * Identifies:
 * - Frequent tab opening sequences
 * - Time-based patterns (morning routine, research session, etc.)
 * - Contextual workflows
 * - Recovery suggestions
 */

import { TabEvent, TemporalPattern } from './KnowledgeGraph';

export interface WorkflowSuggestion {
  type: 'workflow_recovery' | 'next_tabs' | 'session_restore';
  message: string;
  suggestedTabs: string[];
  confidence: number;
  context?: string;
  pattern?: TemporalPattern;
}

export interface SessionContext {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number; // 0-6
  duration: number; // Session duration in ms
  tabCount: number;
  domains: string[];
}

export class TemporalPatternMiner {
  private patterns: TemporalPattern[] = [];
  private sessionContexts: Map<string, SessionContext> = new Map();

  /**
   * Mine frequent sequences from event history
   */
  mineFrequentSequences(
    history: TabEvent[],
    options: {
      minSupport?: number; // Minimum frequency
      maxGap?: number; // Max time gap between events (ms)
      minSequenceLength?: number;
      maxSequenceLength?: number;
    } = {}
  ): TemporalPattern[] {
    const {
      minSupport = 3,
      maxGap = 5 * 60 * 1000, // 5 minutes default
      minSequenceLength = 2,
      maxSequenceLength = 5
    } = options;

    // Group events into sessions
    const sessions = this.groupIntoSessions(history, maxGap);

    // Extract sequences from each session
    const sequenceMap = new Map<string, {
      count: number;
      timeGaps: number[];
      contexts: SessionContext[];
    }>();

    for (const session of sessions) {
      const context = this.analyzeSessionContext(session);
      const sessionKey = this.generateSessionKey(session);
      this.sessionContexts.set(sessionKey, context);

      const openEvents = session
        .filter(e => e.type === 'open' || e.type === 'switch')
        .map(e => e.tabId);

      // Extract sequences of different lengths
      for (let len = minSequenceLength; len <= Math.min(maxSequenceLength, openEvents.length); len++) {
        for (let i = 0; i <= openEvents.length - len; i++) {
          const sequence = openEvents.slice(i, i + len);
          const sequenceKey = sequence.join('→');

          if (!sequenceMap.has(sequenceKey)) {
            sequenceMap.set(sequenceKey, { count: 0, timeGaps: [], contexts: [] });
          }

          const entry = sequenceMap.get(sequenceKey)!;
          entry.count++;
          entry.contexts.push(context);

          // Calculate time gaps
          const events = session.filter(e => 
            sequence.includes(e.tabId) && 
            (e.type === 'open' || e.type === 'switch')
          );
          
          if (events.length >= 2) {
            for (let j = 1; j < events.length; j++) {
              const gap = events[j].timestamp - events[j - 1].timestamp;
              entry.timeGaps.push(gap);
            }
          }
        }
      }
    }

    // Convert to TemporalPattern objects
    this.patterns = [];
    for (const [sequenceKey, data] of sequenceMap.entries()) {
      if (data.count >= minSupport) {
        const tabIds = sequenceKey.split('→');
        const avgTimeGap = data.timeGaps.length > 0
          ? data.timeGaps.reduce((a, b) => a + b, 0) / data.timeGaps.length
          : 0;

        // Infer context from session contexts
        const dominantContext = this.inferDominantContext(data.contexts);

        this.patterns.push({
          sequence: tabIds,
          frequency: data.count,
          avgTimeGap,
          confidence: Math.min(1, data.count / 10), // Normalize
          context: dominantContext
        });
      }
    }

    // Sort by frequency
    this.patterns.sort((a, b) => b.frequency - a.frequency);

    return this.patterns;
  }

  /**
   * Suggest workflow recovery based on current state
   */
  suggestWorkflowRecovery(
    currentTabIds: string[],
    allTabIds: string[]
  ): WorkflowSuggestion[] {
    const suggestions: WorkflowSuggestion[] = [];

    // Find patterns that match current state
    const matchingPatterns = this.patterns.filter(pattern => {
      // Check if current tabs match the beginning of a pattern
      if (currentTabIds.length === 0) return false;
      if (pattern.sequence.length < currentTabIds.length) return false;

      return currentTabIds.every((id, index) => 
        pattern.sequence[index] === id
      );
    });

    for (const pattern of matchingPatterns) {
      const nextIndex = currentTabIds.length;
      
      if (nextIndex < pattern.sequence.length) {
        const nextTabId = pattern.sequence[nextIndex];
        
        // Check if tab still exists
        if (allTabIds.includes(nextTabId)) {
          suggestions.push({
            type: 'next_tabs',
            message: `You often open ${this.getTabName(nextTabId)} after these tabs. Continue workflow?`,
            suggestedTabs: [nextTabId],
            confidence: pattern.confidence,
            context: pattern.context,
            pattern
          });
        } else {
          // Tab was closed, suggest recovery
          suggestions.push({
            type: 'workflow_recovery',
            message: `You often open these tabs together. Restore the workflow?`,
            suggestedTabs: pattern.sequence.filter(id => !currentTabIds.includes(id)),
            confidence: pattern.confidence * 0.8, // Lower confidence for recovery
            context: pattern.context,
            pattern
          });
        }
      }
    }

    // Suggest session restore based on time of day
    const timeBasedSuggestions = this.suggestTimeBasedWorkflows(currentTabIds);
    suggestions.push(...timeBasedSuggestions);

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Suggest workflows based on time of day
   */
  private suggestTimeBasedWorkflows(_currentTabIds: string[]): WorkflowSuggestion[] {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    let timeOfDay: SessionContext['timeOfDay'];
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';

    // Find patterns that typically occur at this time
    const timeBasedPatterns = this.patterns.filter(pattern => {
      // Check if pattern's context matches current time
      // This is a simplified check - in production, you'd analyze session contexts
      return pattern.context && 
             this.matchesTimeContext(pattern.context, timeOfDay, dayOfWeek);
    });

    if (timeBasedPatterns.length === 0) return [];

    const bestPattern = timeBasedPatterns[0];
    
    return [{
      type: 'session_restore',
      message: `You often start with these tabs at this time. Restore your ${timeOfDay} routine?`,
      suggestedTabs: bestPattern.sequence.slice(0, 3), // First few tabs
      confidence: bestPattern.confidence * 0.7,
      context: bestPattern.context,
      pattern: bestPattern
    }];
  }

  /**
   * Predict next tabs based on current sequence
   */
  predictNextTabs(currentTabIds: string[]): string[] {
    if (currentTabIds.length === 0) return [];

    const matchingPatterns = this.patterns.filter(pattern => {
      if (pattern.sequence.length <= currentTabIds.length) return false;
      
      return currentTabIds.every((id, index) => 
        pattern.sequence[index] === id
      );
    });

    if (matchingPatterns.length === 0) return [];

    // Get most frequent pattern
    const bestPattern = matchingPatterns[0];
    const nextIndex = currentTabIds.length;
    
    if (nextIndex < bestPattern.sequence.length) {
      return [bestPattern.sequence[nextIndex]];
    }

    return [];
  }

  /**
   * Get patterns for a specific context
   */
  getPatternsByContext(context: string): TemporalPattern[] {
    return this.patterns.filter(p => p.context === context);
  }

  /**
   * Analyze session context
   */
  private analyzeSessionContext(session: TabEvent[]): SessionContext {
    if (session.length === 0) {
      return {
        timeOfDay: 'afternoon',
        dayOfWeek: new Date().getDay(),
        duration: 0,
        tabCount: 0,
        domains: []
      };
    }

    const firstEvent = session[0];
    const lastEvent = session[session.length - 1];
    const date = new Date(firstEvent.timestamp);
    const hour = date.getHours();

    let timeOfDay: SessionContext['timeOfDay'];
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';

    // Extract unique domains (would need tab lookup in real implementation)
    const domains: string[] = []; // Placeholder

    return {
      timeOfDay,
      dayOfWeek: date.getDay(),
      duration: lastEvent.timestamp - firstEvent.timestamp,
      tabCount: new Set(session.map(e => e.tabId)).size,
      domains
    };
  }

  /**
   * Group events into sessions
   */
  private groupIntoSessions(events: TabEvent[], maxGap: number): TabEvent[][] {
    if (events.length === 0) return [];

    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const sessions: TabEvent[][] = [];
    let currentSession: TabEvent[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].timestamp - sorted[i - 1].timestamp;
      
      if (gap <= maxGap) {
        currentSession.push(sorted[i]);
      } else {
        sessions.push(currentSession);
        currentSession = [sorted[i]];
      }
    }

    if (currentSession.length > 0) {
      sessions.push(currentSession);
    }

    return sessions;
  }

  /**
   * Generate session key for caching
   */
  private generateSessionKey(session: TabEvent[]): string {
    const tabIds = Array.from(new Set(session.map(e => e.tabId))).sort();
    return tabIds.join(',');
  }

  /**
   * Infer dominant context from session contexts
   */
  private inferDominantContext(contexts: SessionContext[]): string | undefined {
    if (contexts.length === 0) return undefined;

    const timeOfDayCounts = new Map<string, number>();
    contexts.forEach(ctx => {
      timeOfDayCounts.set(
        ctx.timeOfDay,
        (timeOfDayCounts.get(ctx.timeOfDay) || 0) + 1
      );
    });

    const dominantTime = Array.from(timeOfDayCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    return dominantTime ? `${dominantTime} routine` : undefined;
  }

  /**
   * Check if context matches time
   */
  private matchesTimeContext(
    context: string | undefined,
    timeOfDay: SessionContext['timeOfDay'],
    _dayOfWeek: number
  ): boolean {
    if (!context) return false;
    
    const lowerContext = context.toLowerCase();
    return lowerContext.includes(timeOfDay);
  }

  /**
   * Get tab name (placeholder - would need tab lookup)
   */
  private getTabName(tabId: string): string {
    return `tab ${tabId.slice(-4)}`;
  }

  /**
   * Get statistics
   */
  getStats(): {
    patternCount: number;
    avgFrequency: number;
    avgSequenceLength: number;
  } {
    if (this.patterns.length === 0) {
      return { patternCount: 0, avgFrequency: 0, avgSequenceLength: 0 };
    }

    const avgFrequency = this.patterns.reduce((sum, p) => sum + p.frequency, 0) / this.patterns.length;
    const avgSequenceLength = this.patterns.reduce((sum, p) => sum + p.sequence.length, 0) / this.patterns.length;

    return {
      patternCount: this.patterns.length,
      avgFrequency,
      avgSequenceLength
    };
  }
}

