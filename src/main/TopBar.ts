import { is } from "@electron-toolkit/utils";
import { BaseWindow, WebContentsView } from "electron";
import { join } from "path";

export class TopBar {
  private webContentsView: WebContentsView;
  private baseWindow: BaseWindow;

  constructor(baseWindow: BaseWindow) {
    this.baseWindow = baseWindow;
    this.webContentsView = this.createWebContentsView();
    baseWindow.contentView.addChildView(this.webContentsView);
    this.setupBounds();
  }

  private createWebContentsView(): WebContentsView {
    const webContentsView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, "../preload/topbar.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Need to disable sandbox for preload to work
      },
    });

    // Ensure background is transparent so it doesn't block the page when expanded
    webContentsView.setBackgroundColor("#00000000");

    // Load the TopBar React app
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      // In development, load through Vite dev server
      const topbarUrl = new URL(
        "/topbar/",
        process.env["ELECTRON_RENDERER_URL"]
      );
      webContentsView.webContents.loadURL(topbarUrl.toString());
    } else {
      webContentsView.webContents.loadFile(
        join(__dirname, "../renderer/topbar.html")
      );
    }

    return webContentsView;
  }

  private setupBounds(): void {
    // Guard against destroyed window
    if (!this.baseWindow || this.baseWindow.isDestroyed()) {
      return;
    }

    const bounds = this.baseWindow.getBounds();
    this.webContentsView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: 88, // Fixed height for topbar (40px tabs + 48px address bar)
    });
  }

  updateBounds(): void {
    this.setupBounds();
  }

  expand(): void {
    // Guard against destroyed window
    if (!this.baseWindow || this.baseWindow.isDestroyed()) {
      return;
    }

    const bounds = this.baseWindow.getBounds();
    // Bring to front by re-adding (or ensure it's on top)
    // In Electron, the last added view is on top.
    // We can try to remove and re-add, or just rely on it being a separate layer if possible.
    // But simpler: just ensure it's the last child.
    // However, removing and re-adding might cause a flicker.
    // Let's try to just set bounds first. If z-order is an issue, we might need a different approach.
    // Actually, the user's issue confirms z-order IS the issue.

    // Move to top
    this.baseWindow.contentView.removeChildView(this.webContentsView);
    this.baseWindow.contentView.addChildView(this.webContentsView);

    this.webContentsView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
    });
  }

  collapse(): void {
    // Guard against destroyed window
    if (!this.baseWindow || this.baseWindow.isDestroyed()) {
      return;
    }

    this.setupBounds();
    // We don't necessarily need to move it back in z-order, 
    // but if we want tabs to be "on top" for some reason (e.g. drag regions?), 
    // we might leave it. But usually TopBar should be on top.
    // If we leave it on top, it's fine as long as it's small (88px).
  }

  get view(): WebContentsView {
    return this.webContentsView;
  }
}
