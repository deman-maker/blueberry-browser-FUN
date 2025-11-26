# Blueberry Browser - Intelligent Tab Management System

Blueberry Browser is a privacy-first, AI-powered browser environment designed to intelligently organize your digital workspace. It leverages a multi-tier routing system, utilizing **Flan-T5** and local Small Language Models (SLMs), along with a semantic Knowledge Graph to manage tabs, workspaces, and containers with minimal latency and maximum privacy.

## 🚀 Key Features

### 🧠 Intelligent Tab Organization
The core of Blueberry is its ability to understand your browsing context and organize tabs automatically. This is achieved through a **4-Tier Routing System**:

1.  **Tier 1: Pattern Matching (<10ms)**
    *   **Usage**: Handles simple, direct commands
    *   **Mechanism**: Regex-based matching for direct commands (e.g., "open facebook", "close all linkedin").
    *   **Benefit**: Instant response for common actions.

2.  **Tier 2: T5-Distilled / Mozilla smart-tab-topic (40-60ms)**
    *   **Usage**: Handles simple Grouping
    *   **Mechanism**: Uses a distilled T5 model and the Knowledge Graph to group tabs by domain or simple topics.
    *   **Benefit**: Fast, semantic grouping without heavy compute.

3.  **Tier 3: SLM Router (90-150ms)** (Currently Experimental)
    *   **Usage**: Handles complex grouping, workspace Ops
    *   **Mechanism**: Runs local SLMs (**Phi-3.5-mini** or **Qwen2.5-1.5B**) accelerated by **WebGPU**.
    *   **Benefit**: Complex reasoning and context awareness entirely on-device.

4.  **Tier 4: Gemini API (800-2000ms)**
    *   **Usage**: Fallback & Complex Conversational Queries.Replaces Tier3 for now
    *   **Mechanism**: Calls Google's Gemini API for high-level reasoning or when local models are uncertain.
    *   **Benefit**: Handles edge cases and abstract queries that require world knowledge.

### 🕸️ Knowledge Graph
Blueberry builds a local **Knowledge Graph** to understand the relationships between your tabs:
*   **Semantic Similarity**: Uses TF-IDF and embeddings to link related pages.
*   **Temporal Patterns**: Tracks browsing sequences to understand workflows (e.g., "Github" -> "StackOverflow" -> "Docs").
*   **Clustering**: Automatically identifies and suggests tab groups based on connected components in the graph.

### 📦 Workspaces & Containers
*   **Workspaces**: Visual contexts for different projects (e.g., "Work", "Personal"). Each workspace has its own set of tabs and folders.
*   **Containers**: **Session-level isolation**. Tabs in different containers (e.g., "Personal" vs. "Work") have separate cookies and storage, allowing you to be logged into multiple accounts on the same site simultaneously.

### 🔒 Privacy-First Architecture
*   **Local-First Processing**: Tiers 1-3 run entirely on your device. Your tab data does not leave your machine for the vast majority of operations.
*   **Sanitized Inputs**: When the Gemini API (Tier 4) is needed, only the command text is sent. Tab data is processed locally based on the interpreted intent.
*   **WebGPU Acceleration**: Utilizes your device's GPU for efficient local inference, ensuring that AI features don't compromise privacy or performance.

## 🗣️ Command Examples

Blueberry understands a wide range of natural language commands, from simple actions to complex workflows:

| Category | Example Command | Tier |
| :--- | :--- | :--- |
| **Direct Action** | "Open LinkedIn" | Tier 1 (Pattern) |
| | "Close all Facebook tabs" | Tier 1 (Pattern) |
| **Simple Grouping** | "Group my work tabs" | Tier 2 (T5+KG) |
| | "Organize social media tabs" | Tier 2 (T5+KG) |
| **Complex Logic** | "Create a workspace for Project X and move these tabs there" | Tier 3 (SLM) / Tier 4 |
| | "Pin all tabs that I use for development" | Tier 3 (SLM) |
| **AI Insights** | "Suggest my next tab" | Tier 3 (SLM+KG) |
| | "What tabs do I usually open with Github?" | Tier 3 (SLM+KG) |
| **Conversational** | "How do I optimize my workflow?" | Tier 4 (Gemini) |

## 🛠️ Code Structure & Principles

The codebase follows a modular, service-oriented architecture:

*   **`src/main/IntelligentRouter.ts`**: The brain of the operation. Orchestrates the 4-tier routing logic.
*   **`src/main/SLMRouter.ts`**: Manages the local SLM (Phi/Qwen) and WebGPU inference.
*   **`src/utils/KnowledgeGraph.ts`**: Implements the semantic and temporal graph logic.
*   **`src/main/WorkspaceManager.ts`**: Handles the hierarchy of Workspaces, Containers, and Folders.
*   **`src/main/TabCommandService.ts`**: Executes natural language commands, enforcing the privacy-first boundary.

## 🔮 Future Improvements

*   **Real-time Graph Updates**: Move from periodic rebuilds to incremental updates for the Knowledge Graph.
*   **Enhanced Persistence**: Deeper integration of IndexedDB for persisting graph states across restarts.
*   **Proactive Suggestions**: Background analysis to suggest groups or cleanups before you even ask.
*   **Custom SLM Fine-tuning**: Ability for the local model to learn from your specific vocabulary and habits over time.

## 💻 Tech Stack
*   **Electron**: Desktop application framework.
*   **TypeScript**: Type-safe development.
*   **Transformers.js**: Running local AI models in the browser/Node environment.
*   **WebGPU**: Hardware acceleration for AI inference.

## 🧩 Function API

Blueberry exposes a structured API for the LLM to interact with the browser. These functions are defined in `src/utils/FunctionRegistry.ts` and executed via `src/main/TabManagementAPI.ts`.

### Core Functions

| Function | Description | Parameters |
| :--- | :--- | :--- |
| **`closeTabsByPattern`** | Closes tabs matching a specific criteria. | `pattern` (string): Domain, title keyword, or URL pattern. |
| **`createTabGroup`** | Groups specific tabs together. | `tabIds` (string[]), `groupName` (string), `color` (optional). |
| **`findTabsByKeyword`** | Searches for tabs by title or URL. | `keywords` (string[]). |
| **`archiveTabs`** | Suspends tabs to free up memory. | `tabIds` (string[]). |
| **`pinTabs`** | Pins tabs to the tab bar. | `tabIds` (string[]). |
| **`suggestTabGroups`** | AI-driven suggestion for grouping tabs. | `minGroupSize` (number). |

### Extensibility
The **Function Registry** pattern allows for easy addition of new capabilities. New functions can be registered with a schema definition (for the LLM) and a handler (for execution), making the system highly extensible.

## 🛠️ Tab Management Tools

Beyond the core functions, Blueberry provides a comprehensive suite of **Zod-defined tools** (`src/main/TabManagementTools.ts`) for the LLM to perform complex actions. These are categorized into:

*   **Query & Info**: `getTabs`, `findTabs` (by domain/title/URL), `getTabStats`.
*   **Navigation**: `switchToTab`, `navigateTab`, `goBack`, `goForward`, `reloadTab`.
*   **Organization**: `pinTabs`, `createTabGroup`, `editTabGroup`, `moveTabToGroup`, `toggleGroupCollapse`.
*   **Workflows**: `executeWorkflow` (chaining), `organizeTabsByDomain`, `smartGroupTabs` (AI-powered), `getWorkflowSuggestions`.
*   **Hierarchy**: `createFolder`, `moveTabsToFolder` for deep organization within workspaces.

## 📦 Containers & Workspaces

Blueberry implements a robust isolation model:

### Containers (Session Isolation)
Containers allow you to log into multiple accounts on the same site simultaneously (e.g., Personal Gmail vs. Work Gmail).
*   **Tools**: `createContainer`, `assignContainerToTab`, `getContainers`.
*   **Implementation**: Uses Electron's `session` partitions (`persist:container-${id}`) to ensure complete data separation (cookies, local storage, cache).

### Workspaces (Context Isolation)
Workspaces are visual contexts for switching between different projects or modes.
*   **Tools**: `createWorkspace`, `switchWorkspace`, `moveTabsToWorkspace`.
*   **Structure**: Each workspace maintains its own list of tabs and folders, but can share Containers (e.g., use your "Work Container" inside your "Project A Workspace").

Feel free to ask any questions or reach out if you have any suggestions or feedback! 🚀