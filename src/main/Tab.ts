import { NativeImage, WebContentsView } from "electron";

export class Tab {
  private webContentsView: WebContentsView;
  private _id: string;
  private _title: string;
  private _url: string;
  private _isVisible: boolean = false;
  private _pinned: boolean = false;
  private _containerId: string | null = null;
  private onUpdateCallback?: () => void;
  
  // Performance optimization: Cached domain for O(1) lookups
  private _cachedDomain: string | null = null;

  constructor(
    id: string,
    url: string = "https://www.google.com",
    onUpdate?: () => void,
    containerPartition?: string
  ) {
    this._id = id;
    this._url = url;
    this._title = "New Tab";
    this.onUpdateCallback = onUpdate;

    // Create the WebContentsView with optional session partition for container isolation
    const webPreferences: Electron.WebPreferences = {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    };

    // Add session partition for container isolation if provided
    if (containerPartition) {
      webPreferences.partition = containerPartition;
    }

    this.webContentsView = new WebContentsView({
      webPreferences,
    });

    // Set up event listeners
    this.setupEventListeners();

    // Performance optimization: Defer URL loading to avoid blocking tab creation
    // This allows multiple tabs to be created faster before they start loading
    if (url && url !== "https://www.google.com") {
      // Use setImmediate to defer loading until after the current execution stack
      // This allows the tab object to be fully created and added to the window first
      setImmediate(() => {
        this.loadURL(url).catch((error) => {
          console.error(`[Tab ${this._id}] Failed to load URL: ${url}`, error);
        });
      });
    } else {
      // For default new tab page, load immediately (it's fast)
      this.loadURL(url);
    }
  }

  private setupEventListeners(): void {
    // Update title when page title changes
    this.webContentsView.webContents.on("page-title-updated", (_, title) => {
      if (title && title.trim() && title !== "New Tab") {
        this._title = title;
        this.notifyUpdate();
      } else if (this._title === "New Tab") {
        // If title is empty or "New Tab", try to extract from URL
        this.updateTitleFromUrl();
        this.notifyUpdate();
      }
    });

    // Update title and URL when page finishes loading
    this.webContentsView.webContents.on("did-finish-load", () => {
      // Get the current title from the page
      this.webContentsView.webContents.executeJavaScript("document.title")
        .then((title: string) => {
          if (title && title.trim() && title !== "New Tab") {
            this._title = title;
            this.notifyUpdate();
          } else if (this._title === "New Tab") {
            // If title is still "New Tab", extract from URL
            this.updateTitleFromUrl();
            this.notifyUpdate();
          }
        })
        .catch(() => {
          // If we can't get the title, try to extract from URL
          if (this._title === "New Tab") {
            this.updateTitleFromUrl();
            this.notifyUpdate();
          }
        });
      
      // Update URL from current location
      const currentUrl = this.webContentsView.webContents.getURL();
      if (currentUrl && currentUrl !== this._url) {
        this._url = currentUrl;
        this.invalidateDomainCache(); // Invalidate cache when URL changes
        // If title is still "New Tab", update it from the new URL
        if (this._title === "New Tab") {
          this.updateTitleFromUrl();
        }
        this.notifyUpdate();
      }
    });

    // Update URL when navigation occurs
    this.webContentsView.webContents.on("did-navigate", (_, url) => {
      this._url = url;
      this.invalidateDomainCache(); // Invalidate cache when URL changes
      // Extract a title from URL if title hasn't been set yet
      if (this._title === "New Tab") {
        this.updateTitleFromUrl();
      }
      this.notifyUpdate();
    });

    this.webContentsView.webContents.on("did-navigate-in-page", (_, url) => {
      this._url = url;
      this.invalidateDomainCache(); // Invalidate cache when URL changes
      this.notifyUpdate();
    });

    // Handle page load failures
    this.webContentsView.webContents.on("did-fail-load", () => {
      // Keep the URL but don't change title if load failed
      this.notifyUpdate();
    });
  }

  private updateTitleFromUrl(): void {
    try {
      const url = new URL(this._url);
      // Use the hostname as a fallback title (e.g., "facebook.com")
      const hostname = url.hostname.replace(/^www\./, "");
      this._title = hostname.charAt(0).toUpperCase() + hostname.slice(1);
    } catch {
      // If URL parsing fails, keep "New Tab" or current title
      if (this._title === "New Tab" && this._url) {
        // Try to extract domain from URL string
        const match = this._url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
        if (match && match[1]) {
          this._title = match[1].charAt(0).toUpperCase() + match[1].slice(1);
        }
      }
    }
  }

  private notifyUpdate(): void {
    if (this.onUpdateCallback) {
      this.onUpdateCallback();
    }
  }

  // Getters
  get id(): string {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get url(): string {
    return this._url;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get pinned(): boolean {
    return this._pinned;
  }

  get containerId(): string | null {
    return this._containerId;
  }

  setContainerId(containerId: string | null): void {
    this._containerId = containerId;
    this.notifyUpdate();
  }

  get webContents() {
    return this.webContentsView.webContents;
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }

  // Public methods
  show(): void {
    this._isVisible = true;
    this.webContentsView.setVisible(true);
  }

  hide(): void {
    this._isVisible = false;
    this.webContentsView.setVisible(false);
  }

  async screenshot(): Promise<NativeImage> {
    return await this.webContentsView.webContents.capturePage();
  }

  async runJs(code: string): Promise<any> {
    return await this.webContentsView.webContents.executeJavaScript(code);
  }

  async getTabHtml(): Promise<string> {
    return await this.runJs("return document.documentElement.outerHTML");
  }

  async getTabText(): Promise<string> {
    return await this.runJs("return document.documentElement.innerText");
  }

  loadURL(url: string): Promise<void> {
    this._url = url;
    this.invalidateDomainCache(); // Invalidate cached domain when URL changes
    return this.webContentsView.webContents.loadURL(url);
  }

  goBack(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoBack()) {
      this.webContentsView.webContents.navigationHistory.goBack();
    }
  }

  goForward(): void {
    if (this.webContentsView.webContents.navigationHistory.canGoForward()) {
      this.webContentsView.webContents.navigationHistory.goForward();
    }
  }

  reload(): void {
    this.webContentsView.webContents.reload();
  }

  stop(): void {
    this.webContentsView.webContents.stop();
  }

  setPinned(pinned: boolean): void {
    this._pinned = pinned;
    this.notifyUpdate();
  }

  /**
   * Get cached domain for O(1) lookups (performance optimization)
   */
  get domain(): string {
    if (this._cachedDomain === null) {
      try {
        this._cachedDomain = new URL(this._url).hostname.replace(/^www\./, '');
      } catch {
        this._cachedDomain = '';
      }
    }
    return this._cachedDomain;
  }

  /**
   * Invalidate cached domain when URL changes
   */
  private invalidateDomainCache(): void {
    this._cachedDomain = null;
  }

  isPlayingAudio(): boolean {
    return this.webContentsView.webContents.isCurrentlyAudible();
  }

  destroy(): void {
    this.webContentsView.webContents.close();
  }
}
