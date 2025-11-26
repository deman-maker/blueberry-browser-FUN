import { ElectronAPI } from "@electron-toolkit/preload";

interface ChatRequest {
  message: string;
  context?: {
    url: string | null;
    content: string | null;
    text: string | null;
  };
  messageId: string;
}

interface RoutingInfo {
  route: 'pattern' | 't5' | 'slm' | 'gemini' | 'fallback' | 'direct_llm';
  latency: number;
  confidence: number;
  model?: string;
  reasoning?: string;
}

interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
  routingInfo?: RoutingInfo;
}

interface TabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

interface AgentThought {
  timestamp: number;
  thought: string;
  action?: string;
}

interface AgentStatus {
  isActive: boolean;
  currentTask?: string;
  thoughts: AgentThought[];
  progress?: number;
}

interface SidebarAPI {
  // Chat functionality
  sendChatMessage: (request: ChatRequest) => Promise<void>;
  clearChat: () => Promise<void>;
  getMessages: () => Promise<any[]>;
  onChatResponse: (callback: (data: ChatResponse) => void) => void;
  removeChatResponseListener: () => void;
  onMessagesUpdated: (callback: (messages: any[]) => void) => void;
  removeMessagesUpdatedListener: () => void;

  // Computer Use Agent APIs
  agentExecuteTask: (task: string) => Promise<{ success: boolean; error?: string }>;
  agentStop: () => Promise<{ success: boolean }>;
  agentGetStatus: () => Promise<AgentStatus>;
  agentSubscribeStatus: () => Promise<{ success: boolean }>;
  onAgentStatusUpdated: (callback: (status: AgentStatus) => void) => void;
  removeAgentStatusListener: () => void;

  // Page content access
  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;

  // Tab access
  getAllTabs: () => Promise<Array<{
    id: string;
    title: string;
    url: string;
    domain: string;
    groupId?: string;
  }>>;

  // Tab information
  getActiveTabInfo: () => Promise<TabInfo | null>;

  // Telemetry and routing metrics
  getRoutingMetrics: () => Promise<{
    total: number;
    avgLatency: number;
    routeBreakdown: Record<string, {
      count: number;
      avgLatency: number;
      successRate: number;
      p95Latency: number;
    }>;
    routePercentages: {
      pattern?: number;
      t5?: number;
      slm?: number;
      gemini?: number;
      direct_llm?: number;
      fallback?: number;
    };
  }>;
  getDeviceCapabilities: () => Promise<{
    hasWebGPU: boolean;
    systemRAM: number;
    gpuMemory: number;
    tier: 'budget' | 'power' | 'enterprise';
    platform: string;
  }>;
  processIntelligentQuery: (query: string) => Promise<{
    action: any;
    route: 'pattern' | 't5' | 'slm' | 'gemini' | 'fallback';
    latency: number;
    confidence: number;
    model?: string;
    reasoning?: string;
  }>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    sidebarAPI: SidebarAPI;
  }
}

