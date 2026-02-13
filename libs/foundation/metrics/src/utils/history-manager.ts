/**
 * Centralized History API Manager (Singleton)
 *
 * Patches History API once, all subscribers notified.
 * Prevents conflicts from multiple modules patching the same methods.
 *
 * @module utils/history-manager
 */

/**
 * Callback type for history change events
 */
export type HistoryCallback = (url: string, state: unknown) => void;

/**
 * Centralized History API manager as a singleton class.
 */
export class HistoryManager {
  private static instance: HistoryManager | null = null;

  private isInstalled = false;
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;
  private listeners = new Set<HistoryCallback>();

  private constructor() {
    this.install();
  }

  static getInstance = (): HistoryManager => {
    if (!HistoryManager.instance) {
      HistoryManager.instance = new HistoryManager();
    }
    return HistoryManager.instance;
  };

  static reset = (): void => {
    if (HistoryManager.instance) {
      HistoryManager.instance.uninstall();
      HistoryManager.instance = null;
    }
  };

  /**
   * Subscribe to history changes. Returns an unsubscribe function.
   */
  subscribe = (callback: HistoryCallback): (() => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };

  /**
   * Get the current number of listeners
   */
  getListenerCount = (): number => this.listeners.size;

  private install = (): void => {
    if (typeof window === 'undefined' || typeof history === 'undefined') return;
    if (this.isInstalled) return;

    this.originalPushState = history.pushState.bind(history);
    this.originalReplaceState = history.replaceState.bind(history);

    const notifyListeners = (url: string, historyState: unknown): void => {
      for (const listener of this.listeners) {
        try {
          listener(url, historyState);
        } catch (e) {
          console.error('[HistoryManager] Listener error:', e);
        }
      }
    };

    history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      this.originalPushState!(data, unused, url);
      if (url) {
        notifyListeners(url.toString(), data);
      }
    };

    history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
      this.originalReplaceState!(data, unused, url);
      if (url) {
        notifyListeners(url.toString(), data);
      }
    };

    this.isInstalled = true;
  };

  private uninstall = (): void => {
    if (!this.isInstalled) return;

    if (this.originalPushState) {
      history.pushState = this.originalPushState;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
    }

    this.listeners.clear();
    this.isInstalled = false;
  };
}
