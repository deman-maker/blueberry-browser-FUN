/**
 * DeviceCapabilities - Detects device capabilities for adaptive performance
 * 
 * Detects:
 * - WebGPU availability (for GPU acceleration)
 * - System RAM
 * - GPU memory (if available)
 * - Device tier (budget/power/enterprise)
 */

// Type declaration for WebGPU API (not in standard TypeScript lib yet)
declare global {
  interface Navigator {
    gpu?: {
      requestAdapter(): Promise<any>;
    };
  }
}

export type DeviceTier = 'budget' | 'power' | 'enterprise';

export interface DeviceCapabilities {
  hasWebGPU: boolean;
  systemRAM: number; // MB
  gpuMemory: number; // GB (estimated)
  tier: DeviceTier;
  platform: string;
}

export class DeviceCapabilityDetector {
  private capabilities: DeviceCapabilities | null = null;
  private detectionPromise: Promise<DeviceCapabilities> | null = null;

  /**
   * Detect device capabilities (cached after first call)
   */
  async detect(): Promise<DeviceCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

    if (this.detectionPromise) {
      return this.detectionPromise;
    }

    this.detectionPromise = this.performDetection();
    this.capabilities = await this.detectionPromise;
    return this.capabilities;
  }

  private async performDetection(): Promise<DeviceCapabilities> {
    const [hasWebGPU, systemRAM, gpuMemory, platform] = await Promise.all([
      this.detectWebGPU(),
      this.getSystemRAM(),
      this.getGPUMemory(),
      this.getPlatform()
    ]);

    const tier = this.determineTier(hasWebGPU, systemRAM, gpuMemory);

    return {
      hasWebGPU,
      systemRAM,
      gpuMemory,
      tier,
      platform
    };
  }

  /**
   * Detect WebGPU availability
   */
  private async detectWebGPU(): Promise<boolean> {
    try {
      // Check if WebGPU API is available
      if (typeof navigator !== 'undefined' && navigator.gpu) {
        const adapter = await navigator.gpu.requestAdapter();
        return adapter !== null;
      }
      return false;
    } catch (error) {
      console.warn('[DeviceCapability] WebGPU detection failed:', error);
      return false;
    }
  }

  /**
   * Get system RAM (in MB)
   */
  private async getSystemRAM(): Promise<number> {
    // Browser: DeviceMemory API (approximate)
    if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
      return (navigator as any).deviceMemory * 1024; // Convert GB to MB
    }

    // Electron: use os.totalmem()
    try {
      const os = await import('os');
      return os.totalmem() / (1024 * 1024); // Convert bytes to MB
    } catch {
      return 8192; // Default fallback (8GB)
    }
  }

  /**
   * Get GPU memory (estimated, in GB)
   */
  private async getGPUMemory(): Promise<number> {
    if (!await this.detectWebGPU()) {
      return 0;
    }

    try {
      const adapter = await navigator.gpu?.requestAdapter?.();
      if (!adapter) return 0;

      const device = await adapter.requestDevice();
      const limits = device?.limits;

      // WGPU doesn't expose direct VRAM, estimate from maxStorageBufferBindingSize
      if (limits?.maxStorageBufferBindingSize) {
        // Estimate: maxStorageBufferBindingSize is usually a fraction of total VRAM
        // Conservative estimate: assume it's ~10% of total VRAM
        const estimatedVRAM = limits.maxStorageBufferBindingSize / (1024 * 1024 * 1024) * 10;
        return Math.min(estimatedVRAM, 24); // Cap at 24GB (reasonable max)
      }

      // Fallback: estimate based on adapter info
      const info = await adapter.requestAdapterInfo?.();
      if (info) {
        // Rough estimates based on adapter type
        if (info.device?.includes('NVIDIA') || info.device?.includes('AMD')) {
          return 8; // Desktop GPU estimate
        }
        if (info.device?.includes('Intel')) {
          return 2; // Integrated GPU estimate
        }
      }

      return 6; // Conservative default estimate
    } catch (error) {
      console.warn('[DeviceCapability] GPU memory detection failed:', error);
      return 0;
    }
  }

  /**
   * Get platform information
   */
  private async getPlatform(): Promise<string> {
    if (typeof process !== 'undefined' && process.platform) {
      return process.platform; // 'darwin', 'win32', 'linux'
    }
    if (typeof navigator !== 'undefined') {
      return navigator.platform.toLowerCase();
    }
    return 'unknown';
  }

  /**
   * Determine device tier based on capabilities
   */
  private determineTier(
    hasWebGPU: boolean,
    systemRAM: number,
    gpuMemory: number
  ): DeviceTier {
    // Budget: No GPU or <16GB RAM
    if (!hasWebGPU || systemRAM < 16000) {
      return 'budget';
    }

    // Power: 16GB+ RAM, 6-12GB VRAM
    if (systemRAM >= 16000 && gpuMemory >= 6 && gpuMemory < 12) {
      return 'power';
    }

    // Enterprise: 32GB+ RAM, 12GB+ VRAM
    if (systemRAM >= 32000 && gpuMemory >= 12) {
      return 'enterprise';
    }

    // Default to power if GPU available
    return hasWebGPU ? 'power' : 'budget';
  }

  /**
   * Get cached capabilities (synchronous, returns last detection)
   */
  getCached(): DeviceCapabilities | null {
    return this.capabilities;
  }

  /**
   * Check if WebGPU is available (quick check)
   */
  async hasWebGPU(): Promise<boolean> {
    const caps = await this.detect();
    return caps.hasWebGPU;
  }

  /**
   * Get device tier (quick check)
   */
  async getTier(): Promise<DeviceTier> {
    const caps = await this.detect();
    return caps.tier;
  }
}

// Singleton instance
export const deviceCapabilities = new DeviceCapabilityDetector();

