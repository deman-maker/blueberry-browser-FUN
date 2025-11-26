/**
 * KnowledgeGraphPersistence - Persists Knowledge Graph data in IndexedDB
 * 
 * Stores tab nodes, edges, temporal patterns, and event history across sessions
 */

import { TabNode, TabEdge, TemporalPattern, TabEvent } from './KnowledgeGraph';

const DB_NAME = 'BlueberryTabKnowledgeGraph';
const DB_VERSION = 1;
const STORE_NODES = 'nodes';
const STORE_EDGES = 'edges';
const STORE_PATTERNS = 'patterns';
const STORE_EVENTS = 'events';

export class KnowledgeGraphPersistence {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[KnowledgeGraphPersistence] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[KnowledgeGraphPersistence] IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains(STORE_NODES)) {
          const nodeStore = db.createObjectStore(STORE_NODES, { keyPath: 'id' });
          nodeStore.createIndex('domain', 'tab.domain', { unique: false });
          nodeStore.createIndex('context', 'context', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_EDGES)) {
          const edgeStore = db.createObjectStore(STORE_EDGES, { keyPath: 'id', autoIncrement: true });
          edgeStore.createIndex('from', 'from', { unique: false });
          edgeStore.createIndex('to', 'to', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_PATTERNS)) {
          db.createObjectStore(STORE_PATTERNS, { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains(STORE_EVENTS)) {
          const eventStore = db.createObjectStore(STORE_EVENTS, { keyPath: 'id', autoIncrement: true });
          eventStore.createIndex('timestamp', 'timestamp', { unique: false });
          eventStore.createIndex('tabId', 'tabId', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Save nodes to IndexedDB
   */
  async saveNodes(nodes: Map<string, TabNode>): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NODES], 'readwrite');
      const store = transaction.objectStore(STORE_NODES);

      // Clear existing nodes
      store.clear();

      // Add all nodes
      const nodeArray = Array.from(nodes.values());
      let completed = 0;
      const total = nodeArray.length;

      if (total === 0) {
        resolve();
        return;
      }

      nodeArray.forEach(node => {
        const request = store.add({
          id: node.id,
          tab: node.tab,
          keywords: node.keywords,
          timestamp: node.timestamp,
          context: node.context,
          visitCount: node.visitCount,
          lastVisited: node.lastVisited,
          // Don't store embedding array (too large), recalculate on load
        });

        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    });
  }

  /**
   * Load nodes from IndexedDB
   */
  async loadNodes(): Promise<Map<string, TabNode>> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NODES], 'readonly');
      const store = transaction.objectStore(STORE_NODES);
      const request = store.getAll();

      request.onsuccess = () => {
        const nodes = new Map<string, TabNode>();
        const results = request.result;

        results.forEach((data: any) => {
          nodes.set(data.id, {
            id: data.id,
            tab: data.tab,
            embedding: [], // Will be recalculated
            keywords: data.keywords || [],
            timestamp: data.timestamp || Date.now(),
            context: data.context || 'other',
            visitCount: data.visitCount || 0,
            lastVisited: data.lastVisited || Date.now(),
          });
        });

        resolve(nodes);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Save edges to IndexedDB
   */
  async saveEdges(edges: Map<string, TabEdge[]>): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_EDGES], 'readwrite');
      const store = transaction.objectStore(STORE_EDGES);

      // Clear existing edges
      store.clear();

      // Flatten edges map to array
      const edgeArray: (TabEdge & { id?: number })[] = [];
      edges.forEach(edgeList => {
        edgeList.forEach(edge => {
          edgeArray.push({ ...edge });
        });
      });

      if (edgeArray.length === 0) {
        resolve();
        return;
      }

      let completed = 0;
      const total = edgeArray.length;

      edgeArray.forEach(edge => {
        const request = store.add(edge);

        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    });
  }

  /**
   * Load edges from IndexedDB
   */
  async loadEdges(): Promise<Map<string, TabEdge[]>> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_EDGES], 'readonly');
      const store = transaction.objectStore(STORE_EDGES);
      const request = store.getAll();

      request.onsuccess = () => {
        const edges = new Map<string, TabEdge[]>();
        const results = request.result;

        results.forEach((edge: TabEdge) => {
          if (!edges.has(edge.from)) {
            edges.set(edge.from, []);
          }
          edges.get(edge.from)!.push(edge);
        });

        resolve(edges);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Save temporal patterns to IndexedDB
   */
  async savePatterns(patterns: TemporalPattern[]): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PATTERNS], 'readwrite');
      const store = transaction.objectStore(STORE_PATTERNS);

      store.clear();

      if (patterns.length === 0) {
        resolve();
        return;
      }

      let completed = 0;
      const total = patterns.length;

      patterns.forEach(pattern => {
        const request = store.add(pattern);

        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    });
  }

  /**
   * Load temporal patterns from IndexedDB
   */
  async loadPatterns(): Promise<TemporalPattern[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PATTERNS], 'readonly');
      const store = transaction.objectStore(STORE_PATTERNS);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Save event history to IndexedDB (last 1000 events)
   */
  async saveEvents(events: TabEvent[]): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_EVENTS], 'readwrite');
      const store = transaction.objectStore(STORE_EVENTS);

      // Clear old events
      store.clear();

      // Keep only last 1000 events
      const eventsToSave = events.slice(-1000);

      if (eventsToSave.length === 0) {
        resolve();
        return;
      }

      let completed = 0;
      const total = eventsToSave.length;

      eventsToSave.forEach(event => {
        const request = store.add(event);

        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    });
  }

  /**
   * Load event history from IndexedDB
   */
  async loadEvents(): Promise<TabEvent[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_EVENTS], 'readonly');
      const store = transaction.objectStore(STORE_EVENTS);
      const index = store.index('timestamp');
      const request = index.getAll();

      request.onsuccess = () => {
        const events = request.result || [];
        // Sort by timestamp
        events.sort((a: TabEvent, b: TabEvent) => a.timestamp - b.timestamp);
        resolve(events);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Clear all persisted data
   */
  async clear(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_NODES, STORE_EDGES, STORE_PATTERNS, STORE_EVENTS],
        'readwrite'
      );

      let completed = 0;
      const stores = [STORE_NODES, STORE_EDGES, STORE_PATTERNS, STORE_EVENTS];

      stores.forEach(storeName => {
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          completed++;
          if (completed === stores.length) resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    });
  }
}

