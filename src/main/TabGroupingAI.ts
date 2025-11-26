/**
 * TabGroupingAI - Local AI service for intelligent tab grouping
 * Uses Flan-T5-Small model for on-device tab grouping suggestions
 * Enhanced with Knowledge Graph for semantic and temporal understanding
 * Model: https://huggingface.co/Xenova/flan-t5-small
 */

import { TabKnowledgeGraph, TabEvent } from '../utils/KnowledgeGraph';
import { TemporalPatternMiner, WorkflowSuggestion } from '../utils/TemporalPatternMiner';

interface TabInfo {
  id: string;
  title: string;
  url: string;
}

interface GroupingSuggestion {
  groupName: string;
  tabIds: string[];
  confidence: number;
  reason?: string; // Why these tabs are grouped
}

export class TabGroupingAI {
  private model: any = null;
  private tokenizer: any = null;
  private isModelLoading: boolean = false;
  private modelLoadPromise: Promise<void> | null = null;
  private loadedModelName: string = 'none'; // Track which model was loaded

  // Knowledge Graph for semantic and temporal understanding
  private knowledgeGraph: TabKnowledgeGraph;
  private patternMiner: TemporalPatternMiner;

  // Cache for group name suggestions (key: feature hash, value: group name)
  private groupNameCache: Map<string, string> = new Map();

  // Cache for similarity calculations (key: tab pair hash, value: similarity score)
  private similarityCache: Map<string, number> = new Map();

  // Pre-computed domain cache for tabs (key: tab id, value: domain)
  private domainCache: Map<string, string> = new Map();

  // Pre-computed title words cache (key: tab id, value: Set of words)
  private titleWordsCache: Map<string, Set<string>> = new Map();

  // Pre-computed URL path cache (key: tab id, value: array of path segments)
  private urlPathCache: Map<string, string[]> = new Map();

  // Event history for temporal pattern mining
  private eventHistory: TabEvent[] = [];

  // Knowledge Graph cache (similar to SLMRouter)
  private cachedGraph: { tabIds: string; graph: TabKnowledgeGraph; eventHistoryHash: string } | null = null;

  constructor() {
    this.knowledgeGraph = new TabKnowledgeGraph();
    this.patternMiner = new TemporalPatternMiner();
  }

  /**
   * Get the name of the currently loaded model
   */
  public getModelName(): string {
    return this.loadedModelName;
  }

  /**
   * Preload the model on initialization (called from constructor or startup)
   */
  public preloadModel(): void {
    // Start loading model in background immediately
    this.loadModel().catch((error) => {
      console.error('[TabGroupingAI] Preload failed:', error);
    });
  }

  /**
   * Initialize and load the AI model
   */
  private async loadModel(): Promise<void> {
    if (this.model && this.tokenizer) {
      return; // Model already loaded
    }

    if (this.isModelLoading && this.modelLoadPromise) {
      return this.modelLoadPromise; // Model is currently loading
    }

    this.isModelLoading = true;
    this.modelLoadPromise = (async () => {
      try {
        // Use @xenova/transformers for local inference (no Python required)
        const { pipeline } = await import('@xenova/transformers');

        // Note: The smart-tab-topic model exists but uses ONNX IR v10
        // which is incompatible with Electron's ONNX runtime (max IR v8).
        // Using Flan-T5-Small as primary model - it works great for tab grouping!
        // Model: https://huggingface.co/Xenova/flan-t5-small
        let generator;

        // Use Flan-T5-Small directly (no fallback needed)
        const modelOptions = [
          {
            name: 'Xenova/flan-t5-small', // Primary model - compatible with Electron
            displayName: 'Flan-T5-Small',
            options: {
              quantized: true,
              device: 'cpu' // Use CPU backend to avoid ONNX/worker issues in Electron
            }
          }
        ];

        let lastError: any = null;
        for (const modelConfig of modelOptions) {
          try {
            console.log(`[TabGroupingAI] Attempting to load ${modelConfig.name}...`);

            // Set environment to avoid worker issues in Electron
            if (typeof process !== 'undefined' && process.env) {
              // Disable workers in Electron to avoid path issues
              process.env.USE_WORKER = 'false';
            }

            generator = await pipeline(
              'text2text-generation',
              modelConfig.name,
              {
                ...modelConfig.options,
                // Additional options to avoid ONNX/worker issues
                progress_callback: undefined, // Disable progress callbacks that might use workers
              }
            );
            console.log(`[TabGroupingAI] Successfully loaded ${modelConfig.name}`);
            this.loadedModelName = modelConfig.displayName; // Track which model was loaded
            break; // Success, exit loop
          } catch (error: any) {
            lastError = error;
            const errorMsg = error?.message || String(error);
            console.warn(`[TabGroupingAI] Failed to load ${modelConfig.name}:`, errorMsg);
            // Continue to next model
            continue;
          }
        }

        if (!generator) {
          throw new Error(`All model loading attempts failed. Last error: ${lastError?.message || 'Unknown'}`);
        }

        this.model = generator;
        this.tokenizer = generator.tokenizer;
        console.log('[TabGroupingAI] Model loaded successfully');
      } catch (error) {
        console.error('[TabGroupingAI] Failed to load model after all attempts:', error);
        console.warn('[TabGroupingAI] Falling back to heuristic-based grouping (no AI model)');
        // Fallback: model will be null, we'll use heuristics instead
        this.model = null;
        this.tokenizer = null;
        this.loadedModelName = 'heuristic-only (no AI model)';
      } finally {
        this.isModelLoading = false;
      }
    })();

    return this.modelLoadPromise;
  }

  /**
   * Extract keywords and topics from tab titles and URLs
   */
  private extractTabFeatures(tabs: TabInfo[]): string {
    const features: string[] = [];

    for (const tab of tabs) {
      // Extract domain from URL
      try {
        const url = new URL(tab.url);
        const domain = url.hostname.replace(/^www\./, '');
        features.push(domain);
      } catch {
        // Invalid URL, skip
      }

      // Extract keywords from title
      const titleWords = tab.title
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3) // Filter short words
        .slice(0, 5); // Take first 5 meaningful words

      features.push(...titleWords);
    }

    // Create a summary text for the model
    const uniqueFeatures = [...new Set(features)];
    return uniqueFeatures.join(' ');
  }

  /**
   * Generate a group name using T5 model (with caching)
   * Uses specific prompt format: "Topic from keywords: [keywords]. titles: \n [title1] \n [title2] \n [title3]"
   */
  private async generateGroupName(
    tabFeatures: string,
    tabTitles: string[] = []
  ): Promise<string> {
    // Check cache first (simple hash of features)
    const cacheKey = this.hashString(tabFeatures + tabTitles.join('|'));
    if (this.groupNameCache.has(cacheKey)) {
      return this.groupNameCache.get(cacheKey)!;
    }

    if (!this.model) {
      // Fallback: generate name from features
      const words = tabFeatures.split(' ').slice(0, 3);
      const name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      this.groupNameCache.set(cacheKey, name);
      return name;
    }

    try {
      // Format input for T5 model
      // Format: "Topic from keywords: [keywords]. titles: \n [title1] \n [title2] \n [title3]"
      const keywords = this.extractKeywordsFromFeatures(tabFeatures);
      const titles = tabTitles.length > 0
        ? tabTitles.slice(0, 3) // Max 3 titles per prompt spec
        : tabFeatures.split(' ').slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1));

      let prompt: string;
      if (keywords.length > 0) {
        prompt = `Topic from keywords: ${keywords.join(', ')}. titles: \n ${titles.join(' \n ')}`;
      } else {
        // If no keywords, omit keywords part (for single-tab scenarios)
        prompt = `titles: \n ${titles.join(' \n ')}`;
      }

      const result = await this.model(prompt, {
        max_new_tokens: 10, // Model generates 1-3 word labels
        temperature: 0.3, // Lower temperature for more deterministic output
        do_sample: false, // Deterministic for consistency
      });

      const generatedText = result[0]?.generated_text || '';

      // Clean up the generated text (remove prompt, handle special cases)
      let groupName = generatedText
        .replace(prompt, '')
        .trim()
        .split('\n')[0]
        .split('.')[0]
        .trim();

      // Handle model's special outputs
      if (groupName.toLowerCase() === 'none' || groupName.toLowerCase() === 'adult content') {
        groupName = this.generateFallbackName(tabFeatures);
      }

      const finalName = groupName || this.generateFallbackName(tabFeatures);
      // Cache the result
      this.groupNameCache.set(cacheKey, finalName);
      return finalName;
    } catch (error) {
      console.error('[TabGroupingAI] Error generating group name:', error);
      const fallbackName = this.generateFallbackName(tabFeatures);
      this.groupNameCache.set(cacheKey, fallbackName);
      return fallbackName;
    }
  }

  /**
   * Extract keywords from tab features for T5 prompt format
   */
  private extractKeywordsFromFeatures(features: string): string[] {
    // Extract domain names and meaningful words
    const words = features.split(' ');
    const keywords: string[] = [];

    // Extract domains (words containing dots)
    const domains = words.filter(w => w.includes('.'));
    keywords.push(...domains);

    // Extract meaningful words (length > 4, not common words)
    const meaningfulWords = words.filter(w =>
      w.length > 4 &&
      !this.isStopWord(w) &&
      !w.includes('.')
    );
    keywords.push(...meaningfulWords.slice(0, 3)); // Max 3 keywords

    return keywords;
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Simple string hash for caching
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Fallback method to generate group name from features
   */
  private generateFallbackName(features: string): string {
    const words = features.split(' ').filter(w => w.length > 2);
    if (words.length === 0) return 'New Group';

    // Take the most common domain or first meaningful word
    const domain = words.find(w => !w.includes(' ') && w.includes('.')) || words[0];
    return domain.charAt(0).toUpperCase() + domain.slice(1).replace(/\.(com|org|net|io)$/, '');
  }

  /**
   * Pre-compute and cache domain, title words, and URL paths for a tab
   */
  private precomputeTabFeatures(tab: TabInfo): void {
    // Cache domain
    if (!this.domainCache.has(tab.id)) {
      try {
        const domain = new URL(tab.url).hostname.replace(/^www\./, '');
        this.domainCache.set(tab.id, domain);
      } catch {
        this.domainCache.set(tab.id, '');
      }
    }

    // Cache title words
    if (!this.titleWordsCache.has(tab.id)) {
      const words = new Set(tab.title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      this.titleWordsCache.set(tab.id, words);
    }

    // Cache URL path
    if (!this.urlPathCache.has(tab.id)) {
      try {
        const path = new URL(tab.url).pathname.split('/').filter(p => p.length > 0);
        this.urlPathCache.set(tab.id, path);
      } catch {
        this.urlPathCache.set(tab.id, []);
      }
    }
  }

  /**
   * Pre-compute features for all tabs (optimization for batch operations)
   */
  private precomputeAllTabFeatures(tabs: TabInfo[]): void {
    for (const tab of tabs) {
      this.precomputeTabFeatures(tab);
    }
  }

  /**
   * Calculate similarity between tabs using TF-IDF-like approach (with caching and pre-computed features)
   */
  private calculateTabSimilarity(tab1: TabInfo, tab2: TabInfo): number {
    // Check cache first (order-independent hash)
    const cacheKey = this.hashString(
      [tab1.id, tab2.id].sort().join('|')
    );
    if (this.similarityCache.has(cacheKey)) {
      return this.similarityCache.get(cacheKey)!;
    }

    // Ensure features are pre-computed
    this.precomputeTabFeatures(tab1);
    this.precomputeTabFeatures(tab2);

    let similarity = 0;

    // Domain similarity (high weight) - use cached domain
    const domain1 = this.domainCache.get(tab1.id) || '';
    const domain2 = this.domainCache.get(tab2.id) || '';
    if (domain1 && domain2) {
      if (domain1 === domain2) {
        similarity += 0.5;
      } else if (domain1.includes(domain2) || domain2.includes(domain1)) {
        similarity += 0.3;
      }
    }

    // Title similarity (medium weight) - use cached title words
    const title1Words = this.titleWordsCache.get(tab1.id) || new Set<string>();
    const title2Words = this.titleWordsCache.get(tab2.id) || new Set<string>();
    const commonWords = [...title1Words].filter(w => title2Words.has(w));
    if (commonWords.length > 0) {
      similarity += (commonWords.length / Math.max(title1Words.size, title2Words.size)) * 0.3;
    }

    // URL path similarity (low weight) - use cached path
    const path1 = this.urlPathCache.get(tab1.id) || [];
    const path2 = this.urlPathCache.get(tab2.id) || [];
    const commonPaths = path1.filter(p => path2.includes(p));
    if (commonPaths.length > 0) {
      similarity += 0.2;
    }

    const finalSimilarity = Math.min(similarity, 1.0);
    // Cache the result
    this.similarityCache.set(cacheKey, finalSimilarity);
    return finalSimilarity;
  }

  /**
   * Suggest related tabs for grouping
   */
  private suggestRelatedTabs(
    seedTabs: TabInfo[],
    allTabs: TabInfo[],
    excludeTabIds: string[] = []
  ): string[] {
    const suggestions: Array<{ tabId: string; score: number }> = [];

    // Optimized: Use Set for O(1) exclusion checks
    const excludeSet = new Set(excludeTabIds);

    for (const candidateTab of allTabs) {
      if (excludeSet.has(candidateTab.id)) {
        continue; // Skip tabs already in group or excluded
      }

      // Calculate average similarity to seed tabs
      let totalSimilarity = 0;
      let count = 0;

      for (const seedTab of seedTabs) {
        const similarity = this.calculateTabSimilarity(seedTab, candidateTab);
        totalSimilarity += similarity;
        count++;
      }

      const avgSimilarity = count > 0 ? totalSimilarity / count : 0;

      if (avgSimilarity > 0.2) {
        // Threshold: tabs with >20% similarity are suggested
        suggestions.push({
          tabId: candidateTab.id,
          score: avgSimilarity,
        });
      }
    }

    // Sort by score and return top suggestions
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 10) // Limit to top 10 suggestions
      .map(s => s.tabId);
  }

  /**
   * Main method: Suggest tab grouping with AI-generated name and related tabs
   * Enhanced with Knowledge Graph for better semantic understanding
   * Group name generation can be deferred to background for better performance
   */
  async suggestTabGrouping(
    seedTabIds: string[],
    allTabs: TabInfo[],
    excludeTabIds: string[] = [],
    deferGroupName: boolean = false,
    useKnowledgeGraph: boolean = true
  ): Promise<GroupingSuggestion> {
    // Ensure model is loaded
    await this.loadModel();

    // Pre-compute features
    for (const tab of allTabs) {
      this.precomputeTabFeatures(tab);
    }

    // Get seed tab information
    const seedTabs = allTabs.filter(tab => seedTabIds.includes(tab.id));

    if (seedTabs.length === 0) {
      throw new Error('No seed tabs provided');
    }

    // Use Knowledge Graph if enabled and we have tab objects
    if (useKnowledgeGraph && allTabs.length > 0) {
      try {
        // Convert TabInfo to Tab objects (simplified - in real implementation, pass Tab objects)
        // For now, we'll use the knowledge graph's semantic analysis
        const tabObjects = allTabs.map(t => ({
          id: t.id,
          title: t.title,
          url: t.url,
          domain: this.extractDomain(t.url)
        })) as any[];

        // Create cache key from tab IDs and event history
        const currentTabIds = allTabs.map(t => t.id).sort().join(',');
        const eventHistoryHash = this.eventHistory.length > 0
          ? `${this.eventHistory.length}-${this.eventHistory[this.eventHistory.length - 1].timestamp}`
          : 'empty';

        // Reuse cached graph if tabs and event history haven't changed
        if (this.cachedGraph?.tabIds === currentTabIds &&
          this.cachedGraph?.eventHistoryHash === eventHistoryHash) {
          // Use cached graph - no rebuild needed (much faster!)
          console.log('[TabGroupingAI] Using cached Knowledge Graph (tabs unchanged)');
        } else {
          // Build new graph and cache it
          await this.knowledgeGraph.buildGraph(tabObjects as any, this.eventHistory);
          this.cachedGraph = {
            tabIds: currentTabIds,
            graph: this.knowledgeGraph,
            eventHistoryHash
          };
          console.log('[TabGroupingAI] Built and cached new Knowledge Graph');
        }

        // Get suggestions from knowledge graph
        const graphGroups = this.knowledgeGraph.getSuggestedGroups(2);

        // Find group that contains seed tabs
        const matchingGroup = graphGroups.find(group =>
          seedTabIds.some(id => group.tabs.some(t => t.id === id))
        );

        if (matchingGroup && matchingGroup.tabs.length >= 2) {
          const relatedTabIds = matchingGroup.tabs
            .map(t => t.id)
            .filter(id => !excludeTabIds.includes(id));

          // Generate group name
          const tabFeatures = this.extractTabFeatures(seedTabs);
          const tabTitles = seedTabs.map(t => t.title);
          let groupName: string;

          if (deferGroupName) {
            groupName = matchingGroup.label || this.generateFallbackName(tabFeatures);
            this.generateGroupName(tabFeatures, tabTitles).then((aiName) => {
              const cacheKey = this.hashString(tabFeatures + tabTitles.join('|'));
              this.groupNameCache.set(cacheKey, aiName);
            }).catch(() => { });
          } else {
            groupName = matchingGroup.label || await this.generateGroupName(tabFeatures, tabTitles);
          }

          return {
            groupName,
            tabIds: relatedTabIds,
            confidence: matchingGroup.confidence,
            reason: matchingGroup.reason
          };
        }
      } catch (error) {
        console.warn('[TabGroupingAI] Knowledge Graph failed, falling back to heuristics:', error);
      }
    }

    // Fallback to original heuristic-based approach
    const tabFeatures = this.extractTabFeatures(seedTabs);
    const tabTitles = seedTabs.map(t => t.title);
    const relatedTabIds = this.suggestRelatedTabs(seedTabs, allTabs, [
      ...seedTabIds,
      ...excludeTabIds,
    ]);

    let groupName: string;
    if (deferGroupName) {
      groupName = this.generateFallbackName(tabFeatures);
      this.generateGroupName(tabFeatures, tabTitles).then((aiName) => {
        const cacheKey = this.hashString(tabFeatures + tabTitles.join('|'));
        this.groupNameCache.set(cacheKey, aiName);
      }).catch(() => { });
    } else {
      groupName = await this.generateGroupName(tabFeatures, tabTitles);
    }

    const confidence = Math.min(0.5 + (relatedTabIds.length / 20), 1.0);

    return {
      groupName,
      tabIds: relatedTabIds,
      confidence,
    };
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  /**
   * Record tab event for temporal pattern mining
   */
  recordEvent(event: TabEvent): void {
    this.eventHistory.push(event);
    // Keep only last 1000 events
    if (this.eventHistory.length > 1000) {
      this.eventHistory = this.eventHistory.slice(-1000);
    }
  }

  /**
   * Get event history for sharing with other components (like SLMRouter)
   */
  getEventHistory(): TabEvent[] {
    return [...this.eventHistory]; // Return copy to prevent mutation
  }

  /**
   * Get workflow suggestions based on temporal patterns
   */
  getWorkflowSuggestions(currentTabIds: string[], allTabIds: string[]): WorkflowSuggestion[] {
    // Mine patterns from history
    this.patternMiner.mineFrequentSequences(this.eventHistory);

    // Get suggestions
    return this.patternMiner.suggestWorkflowRecovery(currentTabIds, allTabIds);
  }

  /**
   * Get knowledge graph statistics
   */
  getKnowledgeGraphStats() {
    return this.knowledgeGraph.getStats();
  }

  /**
   * Batch suggest multiple groups from all ungrouped tabs
   * Enhanced with Knowledge Graph clustering
   * Continues until all possible tabs are grouped
   */
  async suggestMultipleGroups(
    allTabs: TabInfo[],
    excludeTabIds: string[] = [],
    useKnowledgeGraph: boolean = true
  ): Promise<GroupingSuggestion[]> {
    await this.loadModel();

    // Try Knowledge Graph first if enabled
    if (useKnowledgeGraph && allTabs.length > 0) {
      try {
        const tabObjects = allTabs.map(t => ({
          id: t.id,
          title: t.title,
          url: t.url,
          domain: this.extractDomain(t.url)
        })) as any[];

        await this.knowledgeGraph.buildGraph(tabObjects as any, this.eventHistory);
        const graphGroups = this.knowledgeGraph.getSuggestedGroups(2);

        // Filter out excluded tabs and convert to GroupingSuggestion format
        const suggestions = graphGroups
          .filter(group => {
            // Check if group has any excluded tabs
            return !group.tabs.some(t => excludeTabIds.includes(t.id));
          })
          .map(group => ({
            groupName: group.label,
            tabIds: group.tabs.map(t => t.id),
            confidence: group.confidence,
            reason: group.reason
          }));

        if (suggestions.length > 0) {
          console.log(`[TabGroupingAI] Knowledge Graph suggested ${suggestions.length} groups`);
          return suggestions;
        }
      } catch (error) {
        console.warn('[TabGroupingAI] Knowledge Graph failed, using heuristics:', error);
      }
    }

    // Fallback to original heuristic-based approach
    const groups: GroupingSuggestion[] = [];
    const excludeSet = new Set(excludeTabIds); // Optimized: Set for O(1) lookups
    const processedTabIds = new Set<string>([...excludeTabIds]);
    let remainingTabs = allTabs.filter(tab => !excludeSet.has(tab.id));

    // Pre-compute features for all tabs once (optimization)
    this.precomputeAllTabFeatures(remainingTabs);

    // Continue grouping until no more groups can be formed
    let maxIterations = 10; // Safety limit to prevent infinite loops
    let iteration = 0;

    while (remainingTabs.length >= 2 && iteration < maxIterations) {
      iteration++;

      // Group tabs by domain first (fast heuristic)
      // Note: If Tab objects had domain property, we'd use that for better performance
      const domainGroups = new Map<string, TabInfo[]>();
      for (const tab of remainingTabs) {
        try {
          // Use cached domain if available (from pre-computed features)
          const domain = this.domainCache.get(tab.id) ||
            new URL(tab.url).hostname.replace(/^www\./, '');
          if (!domainGroups.has(domain)) {
            domainGroups.set(domain, []);
          }
          domainGroups.get(domain)!.push(tab);
        } catch {
          // Invalid URL, skip
        }
      }

      // Process domain groups in parallel for better performance
      const domainGroupEntries = Array.from(domainGroups.entries()).filter(
        ([, tabs]) => tabs.length >= 2 // Need at least 2 tabs
      );

      if (domainGroupEntries.length === 0) {
        break; // No more groups can be formed
      }

      // Process suggestions in parallel (increased from 5 to 10 for better performance)
      const batchSize = 10;
      const newGroups: GroupingSuggestion[] = [];

      for (let i = 0; i < domainGroupEntries.length; i += batchSize) {
        const batch = domainGroupEntries.slice(i, i + batchSize);

        const batchPromises = batch.map(async ([, tabs]) => {
          // Filter out already processed tabs
          const availableTabs = tabs.filter(t => !processedTabIds.has(t.id));
          if (availableTabs.length < 2) {
            return null; // Not enough unprocessed tabs in this domain
          }

          const seedTabIds = availableTabs.slice(0, 3).map(t => t.id); // Use first 3 as seeds

          try {
            // Defer group name generation for better performance (use fallback name initially)
            const suggestion = await this.suggestTabGrouping(
              seedTabIds,
              allTabs,
              Array.from(processedTabIds),
              true // deferGroupName = true
            );

            // Filter suggestion to only include tabs from this domain that are available
            // Optimized: Use Set for O(1) lookups
            const availableTabIdsSet = new Set(availableTabs.map(t => t.id));
            const validTabIds = suggestion.tabIds.filter(id =>
              availableTabIdsSet.has(id)
            );

            if (validTabIds.length < 2) {
              return null; // Not enough valid tabs
            }

            // Update suggestion with valid tab IDs
            suggestion.tabIds = validTabIds;

            // Mark only the tabs actually in this group as processed
            validTabIds.forEach(id => processedTabIds.add(id));

            return suggestion;
          } catch (error) {
            console.error('[TabGroupingAI] Error suggesting group:', error);
            return null;
          }
        });

        // Wait for batch to complete before starting next batch (to avoid memory issues)
        const batchResults = await Promise.all(batchPromises);
        for (const result of batchResults) {
          if (result && result.tabIds.length >= 2) {
            newGroups.push(result);
          }
        }
      }

      // Add new groups to the result
      groups.push(...newGroups);

      // Update remaining tabs (exclude all processed tabs)
      remainingTabs = allTabs.filter(tab => !processedTabIds.has(tab.id));

      // If no new groups were created in this iteration, break
      if (newGroups.length === 0) {
        break;
      }
    }

    return groups;
  }

  /**
   * Parse simple tab management commands locally (no cloud LLM needed)
   * Returns null if command is too complex and needs cloud LLM
   */
  public parseSimpleCommand(
    command: string,
    _allTabs: TabInfo[] // Reserved for future use (e.g., validation, suggestions)
  ): {
    action: 'close' | 'open' | 'closeWorkspace' | null;
    criteria: {
      domain?: string;
      titlePattern?: string;
      urlPattern?: string;
      limit?: number;
      excludeActive?: boolean;
      url?: string;
      workspaceId?: string;
    };
  } | null {
    const lowerCommand = command.toLowerCase().trim();

    // Pattern: "close all tabs"
    if (/^close\s+(all\s+)?tabs?$/.test(lowerCommand)) {
      return {
        action: 'close',
        criteria: { excludeActive: true }, // Keep active tab
      };
    }

    // Pattern: "close this workspace" or "close workspace"
    if (/^close\s+(this\s+)?workspace$/.test(lowerCommand)) {
      return {
        action: 'closeWorkspace',
        criteria: {}, // Will need workspace context
      };
    }

    // Pattern: "close X tabs" (where X is a number)
    const closeCountMatch = lowerCommand.match(/^close\s+(\d+)\s+tabs?$/);
    if (closeCountMatch) {
      const count = parseInt(closeCountMatch[1], 10);
      // Close first N tabs (excluding active)
      return {
        action: 'close',
        criteria: { limit: count, excludeActive: true },
      };
    }

    // Pattern: "close X tabs from domain Y"
    const closeDomainMatch = lowerCommand.match(/^close\s+(\d+)?\s+tabs?\s+(from\s+)?([a-z0-9.-]+\.(com|org|net|io|edu|gov))$/i);
    if (closeDomainMatch) {
      const count = closeDomainMatch[1] ? parseInt(closeDomainMatch[1], 10) : undefined;
      const domain = closeDomainMatch[3];
      return {
        action: 'close',
        criteria: { domain, limit: count },
      };
    }

    // Pattern: "open [url]" or "open tab with [url]"
    const openUrlMatch = lowerCommand.match(/^open\s+(tab\s+with\s+)?(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9.-]+\.(com|org|net|io|edu|gov))$/i);
    if (openUrlMatch) {
      let url = openUrlMatch[2];
      // Add https:// if missing
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      return {
        action: 'open',
        criteria: { url },
      };
    }

    // Pattern: "close tabs with 'pattern' in title"
    const closeTitleMatch = lowerCommand.match(/^close\s+tabs?\s+(with\s+)?['"]?([^'"]+)['"]?\s+in\s+title$/i);
    if (closeTitleMatch) {
      return {
        action: 'close',
        criteria: { titlePattern: closeTitleMatch[2] },
      };
    }

    // Pattern: "close X tabs with 'pattern' in title"
    const closeTitleCountMatch = lowerCommand.match(/^close\s+(\d+)\s+tabs?\s+(with\s+)?['"]?([^'"]+)['"]?\s+in\s+title$/i);
    if (closeTitleCountMatch) {
      return {
        action: 'close',
        criteria: { titlePattern: closeTitleCountMatch[3], limit: parseInt(closeTitleCountMatch[1], 10) },
      };
    }

    // Too complex - needs cloud LLM
    return null;
  }
}

