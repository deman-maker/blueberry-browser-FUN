/**
 * TabKnowledgeGraph - Builds semantic and temporal relationships between tabs
 * 
 * Key Features:
 * - Semantic similarity using embeddings/TF-IDF
 * - Temporal pattern extraction (workflow sequences)
 * - Graph clustering for intelligent grouping
 * - Context-aware suggestions
 */

// Lightweight tab interface for knowledge graph
export interface TabLike {
  id: string;
  title: string;
  url: string;
  domain: string;
}

export interface TabNode {
  id: string;
  tab: TabLike;
  embedding: number[]; // Semantic embedding (or TF-IDF vector)
  keywords: string[];
  timestamp: number;
  context: 'work' | 'research' | 'shopping' | 'entertainment' | 'social' | 'other';
  visitCount: number;
  lastVisited: number;
}

export interface TabEdge {
  from: string;
  to: string;
  weight: number; // 0-1 (strength of relationship)
  reason: 'semantic' | 'temporal' | 'domain' | 'project' | 'workflow';
  confidence: number;
  metadata?: {
    coOccurrenceCount?: number;
    avgTimeGap?: number;
    sequenceOrder?: number;
  };
}

export interface TemporalPattern {
  sequence: string[]; // [tab1_id, tab2_id, tab3_id]
  frequency: number; // How often this sequence occurs
  avgTimeGap: number; // Average milliseconds between opens
  confidence: number; // 0-1
  context?: string; // Inferred context (e.g., "morning routine", "research session")
}

export interface TabGroup {
  label: string;
  tabs: TabLike[];
  confidence: number;
  reason: string; // Why these tabs are grouped
}

export interface TabEvent {
  type: 'open' | 'close' | 'switch' | 'group';
  tabId: string;
  timestamp: number;
  metadata?: {
    fromTabId?: string;
    groupId?: string;
  };
}

export class TabKnowledgeGraph {
  private nodes = new Map<string, TabNode>();
  private edges = new Map<string, TabEdge[]>(); // key: from node id, value: edges
  private temporalPatterns: TemporalPattern[] = [];
  private eventHistory: TabEvent[] = [];
  private readonly MAX_HISTORY = 1000; // Keep last 1000 events

  // TF-IDF cache for semantic similarity (lightweight alternative to embeddings)
  private documentFrequencies = new Map<string, number>();
  private totalDocuments = 0;

  /**
   * Build graph from current tabs and historical events
   */
  async buildGraph(tabs: TabLike[], history: TabEvent[] = []): Promise<void> {
    this.eventHistory = history.slice(-this.MAX_HISTORY);
    this.totalDocuments = tabs.length;

    // Step 1: Create nodes with features
    await this.createNodes(tabs);

    // Step 2: Build semantic edges
    await this.computeSemanticEdges();

    // Step 3: Build temporal edges from history
    this.computeTemporalEdges();

    // Step 4: Extract temporal patterns
    this.extractTemporalPatterns();
  }

  /**
   * Create graph nodes from tabs
   */
  private async createNodes(tabs: TabLike[]): Promise<void> {
    this.nodes.clear();
    this.documentFrequencies.clear();

    // First pass: extract keywords and build document frequency map
    for (const tab of tabs) {
      const keywords = this.extractKeywords(tab);
      keywords.forEach(keyword => {
        this.documentFrequencies.set(
          keyword,
          (this.documentFrequencies.get(keyword) || 0) + 1
        );
      });
    }

    // Second pass: create nodes with TF-IDF vectors
    for (const tab of tabs) {
      const keywords = this.extractKeywords(tab);
      const embedding = this.computeTFIDFVector(keywords, tabs.length);
      const context = this.classifyContext(tab);
      
      // Get visit statistics from history
      const visitCount = this.eventHistory.filter(
        e => e.tabId === tab.id && e.type === 'open'
      ).length;
      
      const lastVisited = this.eventHistory
        .filter(e => e.tabId === tab.id)
        .map(e => e.timestamp)
        .sort((a, b) => b - a)[0] || Date.now();

      this.nodes.set(tab.id, {
        id: tab.id,
        tab,
        embedding,
        keywords,
        timestamp: Date.now(),
        context,
        visitCount,
        lastVisited
      });
    }
  }

  /**
   * Extract keywords from tab (title + URL)
   */
  private extractKeywords(tab: TabLike): string[] {
    const words: string[] = [];
    
    // Extract from title
    const titleWords = tab.title
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3) // Filter short words
      .filter(w => !this.isStopWord(w));
    words.push(...titleWords);

    // Extract from URL path
    try {
      const url = new URL(tab.url);
      const pathWords = url.pathname
        .split('/')
        .filter(p => p.length > 2)
        .map(p => p.replace(/[^a-z0-9]/gi, ' '))
        .flatMap(p => p.split(/\s+/))
        .filter(w => w.length > 3);
      words.push(...pathWords);
    } catch {
      // Invalid URL, skip
    }

    // Extract domain keywords
    const domain = tab.domain;
    if (domain) {
      const domainParts = domain.split('.');
      words.push(...domainParts.filter(p => p.length > 2 && p !== 'www'));
    }

    // Return unique keywords
    return Array.from(new Set(words));
  }

  /**
   * Compute TF-IDF vector for semantic similarity
   * Lightweight alternative to embeddings - works entirely on-device
   */
  private computeTFIDFVector(keywords: string[], totalDocs: number): number[] {
    // Create a sparse vector representation
    // For simplicity, we'll use a hash-based approach
    const vector: number[] = [];
    const keywordSet = new Set(keywords);

    // Use first 50 keywords to create vector (for performance)
    const limitedKeywords = Array.from(keywordSet).slice(0, 50);

    for (const keyword of limitedKeywords) {
      // Term frequency in this document
      const tf = keywords.filter(k => k === keyword).length / keywords.length;
      
      // Inverse document frequency
      const df = this.documentFrequencies.get(keyword) || 1;
      const idf = Math.log(totalDocs / df);
      
      // TF-IDF score
      vector.push(tf * idf);
    }

    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return magnitude > 0 ? vector.map(v => v / magnitude) : vector;
  }

  /**
   * Classify tab context based on domain and title
   */
  private classifyContext(tab: TabLike): TabNode['context'] {
    const domain = tab.domain.toLowerCase();
    const title = tab.title.toLowerCase();

    // Work contexts
    if (
      domain.includes('linkedin') ||
      domain.includes('github') ||
      domain.includes('stackoverflow') ||
      domain.includes('jira') ||
      domain.includes('slack') ||
      title.includes('work') ||
      title.includes('project')
    ) {
      return 'work';
    }

    // Research contexts
    if (
      domain.includes('wikipedia') ||
      domain.includes('arxiv') ||
      domain.includes('scholar') ||
      domain.includes('research') ||
      title.includes('research') ||
      title.includes('paper') ||
      title.includes('study')
    ) {
      return 'research';
    }

    // Shopping contexts
    if (
      domain.includes('amazon') ||
      domain.includes('ebay') ||
      domain.includes('shop') ||
      domain.includes('cart') ||
      title.includes('buy') ||
      title.includes('cart')
    ) {
      return 'shopping';
    }

    // Social contexts
    if (
      domain.includes('facebook') ||
      domain.includes('twitter') ||
      domain.includes('instagram') ||
      domain.includes('reddit')
    ) {
      return 'social';
    }

    // Entertainment contexts
    if (
      domain.includes('youtube') ||
      domain.includes('netflix') ||
      domain.includes('spotify') ||
      domain.includes('twitch')
    ) {
      return 'entertainment';
    }

    return 'other';
  }

  /**
   * Compute semantic edges between tabs
   */
  private async computeSemanticEdges(): Promise<void> {
    this.edges.clear();
    const nodes = Array.from(this.nodes.values());

    // Compare all pairs (optimized with early termination)
    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i];
      const edgesFromA: TabEdge[] = [];

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j];

        // Calculate semantic similarity
        const semanticSimilarity = this.cosineSimilarity(
          nodeA.embedding,
          nodeB.embedding
        );

        // Calculate keyword overlap
        const keywordOverlap = this.calculateKeywordOverlap(
          nodeA.keywords,
          nodeB.keywords
        );

        // Combined similarity score
        const combinedSimilarity = (semanticSimilarity * 0.6) + (keywordOverlap * 0.4);

        if (combinedSimilarity > 0.3) { // Threshold for edge creation
          edgesFromA.push({
            from: nodeA.id,
            to: nodeB.id,
            weight: combinedSimilarity,
            reason: 'semantic',
            confidence: Math.min(1, combinedSimilarity * 1.2)
          });
        }

        // Domain similarity (stronger signal)
        if (nodeA.tab.domain === nodeB.tab.domain) {
          edgesFromA.push({
            from: nodeA.id,
            to: nodeB.id,
            weight: 0.8,
            reason: 'domain',
            confidence: 0.95
          });
        }
      }

      if (edgesFromA.length > 0) {
        this.edges.set(nodeA.id, edgesFromA);
      }
    }
  }

  /**
   * Compute temporal edges from event history
   */
  private computeTemporalEdges(): void {
    // Group events by session (events within 30 minutes)
    const sessions = this.groupEventsIntoSessions(this.eventHistory, 30 * 60 * 1000);

    for (const session of sessions) {
      const tabIds = Array.from(new Set(session.map(e => e.tabId)));
      
      // Create edges between tabs opened in same session
      for (let i = 0; i < tabIds.length; i++) {
        for (let j = i + 1; j < tabIds.length; j++) {
          const tabA = tabIds[i];
          const tabB = tabIds[j];

          // Check if edge already exists
          const existingEdges = this.edges.get(tabA) || [];
          const existingEdge = existingEdges.find(e => e.to === tabB);

          if (existingEdge) {
            // Strengthen existing edge
            existingEdge.weight = Math.min(1, existingEdge.weight + 0.1);
            existingEdge.reason = 'temporal';
            if (!existingEdge.metadata) {
              existingEdge.metadata = {};
            }
            existingEdge.metadata.coOccurrenceCount = 
              (existingEdge.metadata.coOccurrenceCount || 0) + 1;
          } else {
            // Create new temporal edge
            if (!this.edges.has(tabA)) {
              this.edges.set(tabA, []);
            }
            this.edges.get(tabA)!.push({
              from: tabA,
              to: tabB,
              weight: 0.5,
              reason: 'temporal',
              confidence: 0.7,
              metadata: {
                coOccurrenceCount: 1
              }
            });
          }
        }
      }
    }
  }

  /**
   * Add a single node to the graph (incremental update)
   */
  addNode(tab: TabLike): void {
    // Extract keywords and update document frequencies
    const keywords = this.extractKeywords(tab);
    keywords.forEach(keyword => {
      this.documentFrequencies.set(
        keyword,
        (this.documentFrequencies.get(keyword) || 0) + 1
      );
    });
    this.totalDocuments++;

    // Create node with TF-IDF vector
    const embedding = this.computeTFIDFVector(keywords, this.totalDocuments);
    const context = this.classifyContext(tab);
    
    // Get visit statistics from history
    const visitCount = this.eventHistory.filter(
      e => e.tabId === tab.id && e.type === 'open'
    ).length;
    
    const lastVisited = this.eventHistory
      .filter(e => e.tabId === tab.id)
      .map(e => e.timestamp)
      .sort((a, b) => b - a)[0] || Date.now();

    this.nodes.set(tab.id, {
      id: tab.id,
      tab,
      embedding,
      keywords,
      timestamp: Date.now(),
      context,
      visitCount,
      lastVisited
    });

    // Compute edges only for this new node (much faster than full rebuild)
    this.computeEdgesForNode(tab.id);
  }

  /**
   * Remove a node from the graph (incremental update)
   */
  removeNode(tabId: string): void {
    const node = this.nodes.get(tabId);
    if (!node) return;

    // Update document frequencies
    node.keywords.forEach(keyword => {
      const count = this.documentFrequencies.get(keyword) || 0;
      if (count > 1) {
        this.documentFrequencies.set(keyword, count - 1);
      } else {
        this.documentFrequencies.delete(keyword);
      }
    });
    this.totalDocuments--;

    // Remove node
    this.nodes.delete(tabId);

    // Remove all edges connected to this node
    // Remove outgoing edges
    this.edges.delete(tabId);
    
    // Remove incoming edges
    for (const [fromId, edgeList] of this.edges.entries()) {
      const filtered = edgeList.filter(e => e.to !== tabId);
      if (filtered.length === 0) {
        this.edges.delete(fromId);
      } else {
        this.edges.set(fromId, filtered);
      }
    }
  }

  /**
   * Compute edges for a single node (incremental update)
   * Only computes edges from this node to all other nodes
   */
  private computeEdgesForNode(nodeId: string): void {
    const nodeA = this.nodes.get(nodeId);
    if (!nodeA) return;

    const edgesFromA: TabEdge[] = [];

    // Compare with all other nodes
    for (const [otherId, nodeB] of this.nodes.entries()) {
      if (otherId === nodeId) continue;

      // Calculate semantic similarity
      const semanticSimilarity = this.cosineSimilarity(
        nodeA.embedding,
        nodeB.embedding
      );

      // Calculate keyword overlap
      const keywordOverlap = this.calculateKeywordOverlap(
        nodeA.keywords,
        nodeB.keywords
      );

      // Combined similarity score
      const combinedSimilarity = (semanticSimilarity * 0.6) + (keywordOverlap * 0.4);

      if (combinedSimilarity > 0.3) { // Threshold for edge creation
        edgesFromA.push({
          from: nodeA.id,
          to: nodeB.id,
          weight: combinedSimilarity,
          reason: 'semantic',
          confidence: Math.min(1, combinedSimilarity * 1.2)
        });
      }

      // Domain similarity (stronger signal)
      if (nodeA.tab.domain === nodeB.tab.domain) {
        edgesFromA.push({
          from: nodeA.id,
          to: nodeB.id,
          weight: 0.8,
          reason: 'domain',
          confidence: 0.95
        });
      }
    }

    if (edgesFromA.length > 0) {
      this.edges.set(nodeA.id, edgesFromA);
    }
  }

  /**
   * Update graph incrementally when a tab changes
   * This is much faster than full rebuild
   */
  updateGraphOnTabChange(tab: TabLike, action: 'open' | 'close' | 'update'): void {
    if (action === 'open') {
      this.addNode(tab);
    } else if (action === 'close') {
      this.removeNode(tab.id);
    } else if (action === 'update') {
      // Update existing node
      this.removeNode(tab.id);
      this.addNode(tab);
    }
    
    // Note: Temporal edges are updated separately via addEvent()
  }

  /**
   * Add a single event to history and update temporal patterns incrementally
   */
  addEvent(event: TabEvent): void {
    this.eventHistory.push(event);
    
    // Keep only last 1000 events
    if (this.eventHistory.length > this.MAX_HISTORY) {
      this.eventHistory = this.eventHistory.slice(-this.MAX_HISTORY);
    }

    // Incrementally update temporal edges (only if event is recent)
    // For efficiency, we only update if the event is within the last session
    const recentEvents = this.eventHistory.filter(
      e => Date.now() - e.timestamp < 30 * 60 * 1000 // Last 30 minutes
    );
    
    if (recentEvents.length > 0) {
      // Update temporal edges for recent session only
      this.updateTemporalEdgesForSession(recentEvents);
    }
  }

  /**
   * Update temporal edges for a specific session (incremental)
   */
  private updateTemporalEdgesForSession(sessionEvents: TabEvent[]): void {
    const tabIds = Array.from(new Set(sessionEvents.map(e => e.tabId)));
    
    // Create edges between tabs opened in same session
    for (let i = 0; i < tabIds.length; i++) {
      for (let j = i + 1; j < tabIds.length; j++) {
        const tabA = tabIds[i];
        const tabB = tabIds[j];

        // Check if edge already exists
        const existingEdges = this.edges.get(tabA) || [];
        const existingEdge = existingEdges.find(e => e.to === tabB);

        if (existingEdge) {
          // Strengthen existing edge
          existingEdge.weight = Math.min(1, existingEdge.weight + 0.1);
          existingEdge.reason = 'temporal';
          if (!existingEdge.metadata) {
            existingEdge.metadata = {};
          }
          existingEdge.metadata.coOccurrenceCount = 
            (existingEdge.metadata.coOccurrenceCount || 0) + 1;
        } else {
          // Create new temporal edge
          if (!this.edges.has(tabA)) {
            this.edges.set(tabA, []);
          }
          this.edges.get(tabA)!.push({
            from: tabA,
            to: tabB,
            weight: 0.5,
            reason: 'temporal',
            confidence: 0.7,
            metadata: {
              coOccurrenceCount: 1
            }
          });
        }
      }
    }
  }

  /**
   * Extract temporal patterns (frequent sequences)
   */
  private extractTemporalPatterns(): void {
    this.temporalPatterns = [];

    // Group events by session
    const sessions = this.groupEventsIntoSessions(this.eventHistory, 30 * 60 * 1000);

    // Extract sequences from each session
    const sequenceMap = new Map<string, {
      count: number;
      timeGaps: number[];
    }>();

    for (const session of sessions) {
      const openEvents = session
        .filter(e => e.type === 'open' || e.type === 'switch')
        .map(e => e.tabId);

      // Extract sequences of length 2-5
      for (let len = 2; len <= Math.min(5, openEvents.length); len++) {
        for (let i = 0; i <= openEvents.length - len; i++) {
          const sequence = openEvents.slice(i, i + len);
          const sequenceKey = sequence.join('→');

          if (!sequenceMap.has(sequenceKey)) {
            sequenceMap.set(sequenceKey, { count: 0, timeGaps: [] });
          }

          const entry = sequenceMap.get(sequenceKey)!;
          entry.count++;

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
    for (const [sequenceKey, data] of sequenceMap.entries()) {
      if (data.count >= 3) { // Minimum frequency threshold
        const tabIds = sequenceKey.split('→');
        const avgTimeGap = data.timeGaps.length > 0
          ? data.timeGaps.reduce((a, b) => a + b, 0) / data.timeGaps.length
          : 0;

        this.temporalPatterns.push({
          sequence: tabIds,
          frequency: data.count,
          avgTimeGap,
          confidence: Math.min(1, data.count / 10), // Normalize to 0-1
          context: this.inferPatternContext(tabIds)
        });
      }
    }

    // Sort by frequency
    this.temporalPatterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Get suggested groups based on graph clustering
   */
  getSuggestedGroups(minClusterSize: number = 2): TabGroup[] {
    const clusters = this.detectClusters();
    
    return clusters
      .filter(cluster => cluster.length >= minClusterSize)
      .map(cluster => {
        const tabs = cluster.map(id => this.nodes.get(id)!.tab);
        const label = this.generateGroupLabel(tabs, cluster);
        const confidence = this.calculateClusterConfidence(cluster);
        const reason = this.explainGroupReason(cluster);

        return {
          label,
          tabs,
          confidence,
          reason
        };
      });
  }

  /**
   * Detect clusters using connected components (simple but effective)
   */
  private detectClusters(): string[][] {
    const visited = new Set<string>();
    const clusters: string[][] = [];

    for (const nodeId of this.nodes.keys()) {
      if (visited.has(nodeId)) continue;

      // BFS to find connected component
      const cluster: string[] = [];
      const queue = [nodeId];
      visited.add(nodeId);

      while (queue.length > 0) {
        const current = queue.shift()!;
        cluster.push(current);

        // Check outgoing edges
        const outgoing = this.edges.get(current) || [];
        for (const edge of outgoing) {
          if (!visited.has(edge.to) && edge.weight > 0.4) {
            visited.add(edge.to);
            queue.push(edge.to);
          }
        }

        // Check incoming edges (bidirectional)
        for (const [fromId, edges] of this.edges.entries()) {
          const incoming = edges.find(e => e.to === current);
          if (incoming && !visited.has(fromId) && incoming.weight > 0.4) {
            visited.add(fromId);
            queue.push(fromId);
          }
        }
      }

      if (cluster.length >= 2) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Generate label for group using distinctive keywords
   */
  private generateGroupLabel(tabs: TabLike[], cluster: string[]): string {
    // Extract distinctive keywords using TF-IDF
    const allKeywords = new Map<string, number>();

    for (const tabId of cluster) {
      const node = this.nodes.get(tabId);
      if (!node) continue;

      node.keywords.forEach(keyword => {
        const df = this.documentFrequencies.get(keyword) || 1;
        const idf = Math.log(this.totalDocuments / df);
        allKeywords.set(
          keyword,
          (allKeywords.get(keyword) || 0) + idf
        );
      });
    }

    // Get top keywords
    const topKeywords = Array.from(allKeywords.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([keyword]) => keyword);

    if (topKeywords.length > 0) {
      return topKeywords
        .map(k => k.charAt(0).toUpperCase() + k.slice(1))
        .join(' ');
    }

    // Fallback: use domain
    const domains = new Set(tabs.map(t => t.domain).filter(Boolean));
    if (domains.size === 1) {
      const domain = Array.from(domains)[0];
      return domain.split('.')[0].charAt(0).toUpperCase() + 
             domain.split('.')[0].slice(1);
    }

    return 'Related Tabs';
  }

  /**
   * Calculate confidence for a cluster
   */
  private calculateClusterConfidence(cluster: string[]): number {
    if (cluster.length < 2) return 0;

    let totalWeight = 0;
    let edgeCount = 0;

    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const edges = this.edges.get(cluster[i]) || [];
        const edge = edges.find(e => e.to === cluster[j]);
        if (edge) {
          totalWeight += edge.weight;
          edgeCount++;
        }
      }
    }

    if (edgeCount === 0) return 0.5; // Default confidence

    const avgWeight = totalWeight / edgeCount;
    return Math.min(1, avgWeight * 1.2);
  }

  /**
   * Explain why tabs are grouped together
   */
  private explainGroupReason(cluster: string[]): string {
    const reasons: string[] = [];
    const nodes = cluster.map(id => this.nodes.get(id)!).filter(Boolean);

    // Check for domain similarity
    const domains = new Set(nodes.map(n => n.tab.domain));
    if (domains.size === 1) {
      reasons.push('same domain');
    }

    // Check for context similarity
    const contexts = new Set(nodes.map(n => n.context));
    if (contexts.size === 1) {
      reasons.push(`all ${contexts.values().next().value}`);
    }

    // Check for temporal patterns
    const hasTemporalPattern = this.temporalPatterns.some(pattern =>
      cluster.every(id => pattern.sequence.includes(id))
    );
    if (hasTemporalPattern) {
      reasons.push('frequently opened together');
    }

    return reasons.length > 0 
      ? `Grouped because: ${reasons.join(', ')}`
      : 'Grouped by semantic similarity';
  }

  /**
   * Get temporal patterns matching current tab state
   */
  getMatchingTemporalPatterns(currentTabIds: string[]): TemporalPattern[] {
    return this.temporalPatterns.filter(pattern => {
      // Check if pattern sequence starts with current tabs
      if (pattern.sequence.length < currentTabIds.length) return false;
      
      return currentTabIds.every((id, index) => 
        pattern.sequence[index] === id
      );
    });
  }

  /**
   * Suggest next tabs based on temporal patterns
   */
  suggestNextTabs(currentTabIds: string[]): string[] {
    const matchingPatterns = this.getMatchingTemporalPatterns(currentTabIds);
    
    if (matchingPatterns.length === 0) return [];

    // Get most frequent pattern
    const bestPattern = matchingPatterns[0];
    const nextIndex = currentTabIds.length;
    
    if (nextIndex < bestPattern.sequence.length) {
      return [bestPattern.sequence[nextIndex]];
    }

    return [];
  }

  // Helper methods

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  private calculateKeywordOverlap(keywordsA: string[], keywordsB: string[]): number {
    const setA = new Set(keywordsA);
    const setB = new Set(keywordsB);
    
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private groupEventsIntoSessions(events: TabEvent[], maxGap: number): TabEvent[][] {
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

  private inferPatternContext(tabIds: string[]): string | undefined {
    const nodes = tabIds.map(id => this.nodes.get(id)).filter(Boolean) as TabNode[];
    if (nodes.length === 0) return undefined;

    const contexts = nodes.map(n => n.context);
    const contextCounts = new Map<string, number>();
    
    contexts.forEach(ctx => {
      contextCounts.set(ctx, (contextCounts.get(ctx) || 0) + 1);
    });

    const dominantContext = Array.from(contextCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    return dominantContext;
  }

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
   * Get graph statistics for telemetry
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    patternCount: number;
    avgDegree: number;
    temporalPatterns: number;
  } {
    let totalEdges = 0;
    this.edges.forEach(edges => {
      totalEdges += edges.length;
    });

    return {
      nodeCount: this.nodes.size,
      edgeCount: totalEdges,
      patternCount: this.temporalPatterns.length,
      temporalPatterns: this.temporalPatterns.length,
      avgDegree: this.nodes.size > 0 ? totalEdges / this.nodes.size : 0
    };
  }

  /**
   * Get internal state for persistence
   */
  getState(): {
    nodes: Map<string, TabNode>;
    edges: Map<string, TabEdge[]>;
    temporalPatterns: TemporalPattern[];
    eventHistory: TabEvent[];
  } {
    return {
      nodes: new Map(this.nodes),
      edges: new Map(this.edges),
      temporalPatterns: [...this.temporalPatterns],
      eventHistory: [...this.eventHistory]
    };
  }

  /**
   * Restore state from persistence
   */
  restoreState(state: {
    nodes: Map<string, TabNode>;
    edges: Map<string, TabEdge[]>;
    temporalPatterns: TemporalPattern[];
    eventHistory: TabEvent[];
  }): void {
    this.nodes = new Map(state.nodes);
    this.edges = new Map(state.edges);
    this.temporalPatterns = [...state.temporalPatterns];
    this.eventHistory = [...state.eventHistory].slice(-this.MAX_HISTORY);
  }
}

