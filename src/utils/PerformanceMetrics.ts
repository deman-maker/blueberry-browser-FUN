/**
 * PerformanceMetrics - Tracks execution metrics for telemetry
 * Enhanced with query logging for full traceability
 */

interface ExecutionMetric {
  query: string;
  route: string;
  latency: number;
  success: boolean;
  timestamp: number;
  confidence?: number;
  model?: string;
}

export interface RouteStats {
  count: number;
  avgLatency: number;
  successRate: number;
  p95Latency: number;
}

export class PerformanceMetrics {
  private metrics: ExecutionMetric[] = [];
  private readonly MAX_METRICS = 1000;

  /**
   * Record a metric with full details
   */
  record(
    route: string, 
    latency: number, 
    success: boolean,
    query?: string,
    confidence?: number,
    model?: string
  ): void {
    const metric = {
      query: query || '',
      route,
      latency,
      success,
      timestamp: Date.now(),
      confidence,
      model
    };
    
    this.metrics.push(metric);

    // Debug logging (can be removed in production)
    console.log(`[PerformanceMetrics] Recorded: ${route} (${latency.toFixed(0)}ms) - ${query?.substring(0, 50) || 'no query'}`);

    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
  }

  /**
   * Log query execution (simplified interface matching user's example)
   */
  log(query: string, route: string, latency: number): void {
    this.record(route, latency, true, query);
  }

  getStats(): {
    total: number;
    avgLatency: number;
    routeBreakdown: Record<string, RouteStats>;
    routePercentages: {
      pattern?: number;
      t5?: number;
      slm?: number;
      gemini?: number;
      direct_llm?: number;
      fallback?: number;
    };
  } {
    // Debug logging
    console.log(`[PerformanceMetrics] getStats() called - ${this.metrics.length} metrics in memory`);
    const routeGroups = new Map<string, ExecutionMetric[]>();
    
    this.metrics.forEach(m => {
      // Normalize route names for consistent grouping
      const normalizedRoute = this.normalizeRoute(m.route);
      const existing = routeGroups.get(normalizedRoute) || [];
      existing.push(m);
      routeGroups.set(normalizedRoute, existing);
    });

    const routeBreakdown: Record<string, RouteStats> = {};
    routeGroups.forEach((metrics, route) => {
      const latencies = metrics.map(m => m.latency).sort((a, b) => a - b);
      const successful = metrics.filter(m => m.success);

      routeBreakdown[route] = {
        count: metrics.length,
        avgLatency: this.average(latencies),
        successRate: (successful.length / metrics.length) * 100,
        p95Latency: this.percentile(latencies, 95)
      };
    });

    const allLatencies = this.metrics.map(m => m.latency);

    // Calculate route percentages - match exact route names from IntelligentRouter
    const routePercentages = {
      pattern: this.percent(m => this.normalizeRoute(m.route) === 'pattern'),
      t5: this.percent(m => this.normalizeRoute(m.route) === 't5'),
      slm: this.percent(m => this.normalizeRoute(m.route) === 'slm'),
      gemini: this.percent(m => this.normalizeRoute(m.route) === 'gemini'),
      direct_llm: this.percent(m => this.normalizeRoute(m.route) === 'direct_llm'),
      fallback: this.percent(m => this.normalizeRoute(m.route) === 'fallback')
    };

    return {
      total: this.metrics.length,
      avgLatency: this.average(allLatencies),
      routeBreakdown,
      routePercentages
    };
  }

  /**
   * Normalize route names to match IntelligentRouter output
   */
  private normalizeRoute(route: string): string {
    const lower = route.toLowerCase();
    // Map various route name formats to standard names
    if (lower === 'pattern' || lower === 'direct') return 'pattern';
    if (lower === 't5' || lower === 't5-distilled') return 't5';
    if (lower === 'slm') return 'slm';
    if (lower === 'gemini' || lower.includes('gemini')) return 'gemini';
    if (lower === 'direct_llm' || lower === 'direct llm') return 'direct_llm';
    if (lower === 'fallback') return 'fallback';
    return route.toLowerCase();
  }

  /**
   * Calculate percentage of metrics matching predicate
   */
  private percent(predicate: (m: ExecutionMetric) => boolean): number {
    if (this.metrics.length === 0) return 0;
    const count = this.metrics.filter(predicate).length;
    return (count / this.metrics.length) * 100;
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

