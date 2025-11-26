/**
 * SLMRouter - Tier 3: Phi-3.5-mini or Qwen2.5-1.5B for complex reasoning (10% of queries, 90-150ms)
 * 
 * Handles complex queries that need semantic understanding and reasoning
 * Uses local SLM (Small Language Model) for on-device inference
 * Enhanced with Knowledge Graph for semantic and temporal understanding
 */

import { pipeline } from '@xenova/transformers';
import { Tab } from './Tab';
import { deviceCapabilities } from '../utils/DeviceCapabilities';
import { TabKnowledgeGraph, TabEvent, TabLike } from '../utils/KnowledgeGraph';
import { tabFunctionRegistry, FunctionCall } from '../utils/FunctionRegistry';

interface SLMResult {
  action: string;
  reasoning: string;
  confidence: number;
  tabIds?: string[];
  groupName?: string;
  latency: number;
}

export class SLMRouter {
  private model: any = null; // TextGenerationPipeline from @xenova/transformers
  private isModelLoading = false;
  private modelLoadPromise: Promise<void> | null = null;
  private enableWebGPU = false; // Will be set based on GPU detection
  
  // Knowledge Graph for semantic and temporal understanding
  private knowledgeGraph: TabKnowledgeGraph;
  
  // Cache graph per tab set to avoid rebuilding
  private cachedGraph: { tabIds: string; graph: TabKnowledgeGraph; eventHistoryHash: string } | null = null;
  
  // Use Phi-3.5-mini or Qwen2.5-1.5B
  private readonly USE_QWEN = false; // Set to true to use Qwen instead of Phi
  private readonly MODEL_NAME_PHI = 'Xenova/Phi-3.5-mini-instruct';
  private readonly MODEL_NAME_QWEN = 'Xenova/Qwen2.5-1.5B-Instruct';

  constructor() {
    // Initialize Knowledge Graph
    this.knowledgeGraph = new TabKnowledgeGraph();
    
    // Detect GPU and enable WebGPU acceleration if available
    this.detectGPU();
    
    // Preload in background
    this.preloadModel();
  }

  /**
   * Detect GPU and enable WebGPU acceleration if available
   */
  private async detectGPU(): Promise<void> {
    try {
      const hasGPU = await deviceCapabilities.hasWebGPU();
      this.enableWebGPU = hasGPU;
      
      if (hasGPU) {
        console.log('[SLMRouter] GPU detected: WebGPU acceleration available (3-5x speedup)');
      } else {
        console.log('[SLMRouter] No GPU: Falling back to CPU inference');
      }
    } catch (error) {
      console.warn('[SLMRouter] GPU detection failed:', error);
      this.enableWebGPU = false;
    }
  }

  private preloadModel(): void {
    this.loadModel().catch(err => {
      console.warn('[SLMRouter] Model preload failed:', err);
    });
  }

  private async loadModel(): Promise<void> {
    if (this.model) return;
    if (this.isModelLoading && this.modelLoadPromise) {
      return this.modelLoadPromise;
    }

    this.isModelLoading = true;
    this.modelLoadPromise = (async () => {
      try {
        const modelName = this.USE_QWEN 
          ? this.MODEL_NAME_QWEN
          : this.MODEL_NAME_PHI;

        console.log(`[SLMRouter] Loading ${modelName}...`);
        
        // Configure pipeline options
        const pipelineOptions: any = {
          quantized: true,
          dtype: 'q4', // INT4 quantization for speed
        };

        // Enable WebGPU acceleration if available (3-5x speedup)
        if (this.enableWebGPU) {
          // Note: @xenova/transformers may use WebGPU automatically if available
          // Some models support explicit device selection
          pipelineOptions.device = 'webgpu'; // If supported
          console.log('[SLMRouter] Using WebGPU acceleration');
        }

        this.model = await pipeline(
          'text-generation',
          modelName,
          pipelineOptions
        );
        
        console.log(`[SLMRouter] Loaded ${modelName} successfully`);
      } catch (error) {
        console.error('[SLMRouter] Failed to load model:', error);
        this.model = null;
      } finally {
        this.isModelLoading = false;
      }
    })();

    return this.modelLoadPromise;
  }

  async analyze(query: string, tabs: Tab[], eventHistory: TabEvent[] = []): Promise<SLMResult> {
    await this.loadModel();
    
    if (!this.model) {
      throw new Error('SLM model not available');
    }

    const startTime = performance.now();
    
    // Build Knowledge Graph for semantic and temporal understanding
    let graphContext = '';
    let suggestedGroups: any[] = [];
    
    try {
      // Convert tabs to TabLike format
      const tabLikes: TabLike[] = tabs.map(t => ({
        id: t.id,
        title: t.title,
        url: t.url,
        domain: t.domain
      }));
      
      // Create cache key from tab IDs and event history
      const currentTabIds = tabs.map(t => t.id).sort().join(',');
      const eventHistoryHash = eventHistory.length > 0 
        ? `${eventHistory.length}-${eventHistory[eventHistory.length - 1].timestamp}`
        : 'empty';
      
      // Reuse cached graph if tabs and event history haven't changed
      if (this.cachedGraph?.tabIds === currentTabIds && 
          this.cachedGraph?.eventHistoryHash === eventHistoryHash) {
        // Use cached graph - no rebuild needed
        console.log('[SLMRouter] Using cached Knowledge Graph (tabs unchanged)');
      } else {
        // Build new graph and cache it
      await this.knowledgeGraph.buildGraph(tabLikes, eventHistory);
        this.cachedGraph = {
          tabIds: currentTabIds,
          graph: this.knowledgeGraph,
          eventHistoryHash
        };
        console.log('[SLMRouter] Built and cached new Knowledge Graph');
      }
      
      // Get suggested groups from graph
      const graphGroups = this.knowledgeGraph.getSuggestedGroups(2);
      suggestedGroups = graphGroups.map(g => ({
        label: g.label,
        tabIds: g.tabs.map(t => t.id),
        confidence: g.confidence,
        reason: g.reason
      }));
      
      // Get graph statistics for context
      const stats = this.knowledgeGraph.getStats();
      
      // Build graph context string
      if (suggestedGroups.length > 0) {
        graphContext = `\n\nKnowledge Graph Analysis (semantic + temporal patterns):
- Found ${suggestedGroups.length} potential tab groups:
${suggestedGroups.map((g, i) => `  ${i + 1}. "${g.label}" (${g.tabIds.length} tabs, confidence: ${(g.confidence * 100).toFixed(0)}%) - ${g.reason}`).join('\n')}
- Graph stats: ${stats.nodeCount} nodes, ${stats.edgeCount} edges, ${stats.temporalPatterns} temporal patterns`;
      } else {
        graphContext = `\n\nKnowledge Graph Analysis: No strong groupings detected (${stats.nodeCount} tabs analyzed)`;
      }
    } catch (error) {
      console.warn('[SLMRouter] Knowledge Graph build failed, continuing without it:', error);
      graphContext = '\n\nKnowledge Graph: Unavailable (using basic analysis)';
    }
    
    // Build context (limit to first 20 tabs for performance)
    const tabContext = tabs.slice(0, 20).map(t => ({
      title: t.title,
      url: t.url,
      domain: t.domain
    }));

    // Get function definitions for system prompt
    const functionDefinitions = tabFunctionRegistry.getFunctionDefinitionsPrompt();

    const prompt = `You are a browser tab management assistant with access to semantic and temporal analysis. Analyze this query and return a function call.

User query: "${query}"

Available tabs (${tabs.length} total):
${tabContext.map((t, i) => `${i + 1}. ${t.title} (${t.domain})`).join('\n')}${graphContext}

Available Functions:
${functionDefinitions}

Return JSON with either:
1. Direct action format:
{
  "action": "close" | "group" | "find" | "suggest",
  "reasoning": "brief explanation (mention if you used graph insights)",
  "confidence": 0.0-1.0,
  "tabIds": ["tab-id-1", "tab-id-2"] (if applicable),
  "groupName": "Group Name" (if grouping)
}

OR

2. Function call format (preferred):
{
  "function": "functionName",
  "args": { "param1": "value1", "param2": "value2" },
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Be concise and accurate. Only return valid JSON. If the Knowledge Graph suggests groups, consider them in your reasoning. Prefer function calls when a matching function exists.`;

    try {
      const output = await this.model(prompt, {
        max_new_tokens: 200,
        temperature: 0.3,
        do_sample: false, // Deterministic for reliability
      });

      const responseText = output[0]?.generated_text || '';
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as any;
      const latency = performance.now() - startTime;

      // Handle function call format
      if (parsed.function && tabFunctionRegistry.hasFunction(parsed.function)) {
        try {
          const functionCall: FunctionCall = {
            function: parsed.function,
            args: parsed.args || {},
            confidence: parsed.confidence || 0.8
          };
          
          // Execute function call
          const functionResult = await tabFunctionRegistry.execute(functionCall, tabs);
          
          console.log(`[SLMRouter] Function call executed: ${functionCall.function} (${latency.toFixed(0)}ms)`);
          
          return {
            action: functionResult,
            reasoning: parsed.reasoning || `Executed ${functionCall.function}`,
            confidence: functionCall.confidence,
            tabIds: functionResult.tabIds,
            groupName: functionResult.groupName,
            latency
          };
        } catch (error) {
          console.warn('[SLMRouter] Function execution failed, using direct action:', error);
        }
      }

      // Handle direct action format
      const result = parsed as Omit<SLMResult, 'latency'>;

      // If graph suggested groups and result is grouping, enhance with graph insights
      if (result.action === 'group' && suggestedGroups.length > 0 && !result.groupName) {
        // Use graph-suggested group name if available
        const matchingGroup = suggestedGroups.find(g => 
          result.tabIds && g.tabIds.some(id => result.tabIds!.includes(id))
        );
        if (matchingGroup) {
          result.groupName = matchingGroup.label;
          result.reasoning = `${result.reasoning} (Graph suggests: ${matchingGroup.reason})`;
        }
      }

      console.log(`[SLMRouter] Analysis completed in ${latency.toFixed(0)}ms (with Knowledge Graph)`);

      return {
        ...result,
        latency
      };
    } catch (error) {
      console.error('[SLMRouter] Analysis failed:', error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.model !== null;
  }

  getModelName(): string {
    return this.USE_QWEN ? 'Qwen2.5-1.5B' : 'Phi-3.5-mini';
  }
}

