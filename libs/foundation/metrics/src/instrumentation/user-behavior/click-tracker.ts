/**
 * Click Tracking
 * @module instrumentation/user-behavior/click-tracker
 */

import type { UserBehaviorSignalConfig, InteractionEvent } from '../../types';
import { getMeter } from '../../core/otel-provider';
import { getSpanAttributes } from '../../core/context-manager';
import { getCurrentRoute } from '@open-insights-web/foundation-utils';

/**
 * Click tracker state
 */
interface ClickTrackerState {
  config: UserBehaviorSignalConfig;
  isInstalled: boolean;
  callback?: (event: InteractionEvent) => void;
}

let state: ClickTrackerState | null = null;

/**
 * Install click tracking
 */
export function installClickTracking(
  config: UserBehaviorSignalConfig,
  callback?: (event: InteractionEvent) => void
): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (state?.isInstalled) {
    console.warn('[FoundationMetrics] Click tracking already installed');
    return;
  }

  state = {
    config,
    isInstalled: false,
    callback,
  };

  if (!config.trackClicks) {
    return;
  }

  // Add click listener
  document.addEventListener('click', handleClick, { capture: true, passive: true });

  state.isInstalled = true;
}

/**
 * Uninstall click tracking
 */
export function uninstallClickTracking(): void {
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', handleClick, { capture: true });
  }
  state = null;
}

/**
 * Handle click events
 */
function handleClick(event: MouseEvent): void {
  if (!state?.config.enabled) {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  // Find the meaningful element (button, link, etc.)
  const meaningfulTarget = findMeaningfulTarget(target);

  const interactionEvent: InteractionEvent = {
    type: 'click',
    targetTag: meaningfulTarget.tagName.toLowerCase(),
    targetId: meaningfulTarget.id || undefined,
    targetClasses: meaningfulTarget.className
      ? meaningfulTarget.className.split(' ').filter(Boolean)
      : undefined,
    targetOiid: meaningfulTarget.getAttribute('data-oiid') || undefined,
    timestamp: Date.now(),
    route: getCurrentRoute(),
    metadata: getElementMetadata(meaningfulTarget),
  };

  recordClickEvent(interactionEvent);
  state.callback?.(interactionEvent);
}

/**
 * Find the meaningful target element (traverse up to find interactive element)
 */
function findMeaningfulTarget(element: HTMLElement): HTMLElement {
  const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
  const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem'];

  let current: HTMLElement | null = element;
  let maxDepth = 5;

  while (current && maxDepth > 0) {
    // Check if it's an interactive element
    if (interactiveTags.includes(current.tagName)) {
      return current;
    }

    // Check for interactive role
    const role = current.getAttribute('role');
    if (role && interactiveRoles.includes(role)) {
      return current;
    }

    // Check for data-oiid (our tracking attribute)
    if (current.hasAttribute('data-oiid')) {
      return current;
    }

    // Check for click handler
    if (current.onclick || current.hasAttribute('onclick')) {
      return current;
    }

    current = current.parentElement;
    maxDepth--;
  }

  return element;
}

/**
 * Get metadata from element
 */
function getElementMetadata(element: HTMLElement): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  // Get text content (truncated)
  const textContent = element.textContent?.trim();
  if (textContent && textContent.length <= 100) {
    metadata.text = textContent;
  }

  // Get href for links
  if (element instanceof HTMLAnchorElement) {
    metadata.href = element.href;
  }

  // Get type for inputs
  if (element instanceof HTMLInputElement) {
    metadata.inputType = element.type;
  }

  // Get aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    metadata.ariaLabel = ariaLabel;
  }

  // Get data attributes (non-sensitive)
  const safeDataAttributes = ['testid', 'oiid', 'action', 'component', 'section'];
  for (const attr of safeDataAttributes) {
    const value = element.getAttribute(`data-${attr}`);
    if (value) {
      metadata[`data_${attr}`] = value;
    }
  }

  return metadata;
}

/**
 * Record click event to OpenTelemetry
 */
function recordClickEvent(event: InteractionEvent): void {
  try {
    const meter = getMeter();
    const spanAttributes = getSpanAttributes();

    // Click counter
    const clickCounter = meter.createCounter('user_clicks_total', {
      description: 'Total number of user clicks',
    });

    clickCounter.add(1, {
      ...spanAttributes,
      'interaction.type': event.type,
      'interaction.target_tag': event.targetTag,
      'interaction.target_oiid': event.targetOiid || 'unknown',
      'page.route': event.route,
    });
  } catch (e) {
    console.error('[FoundationMetrics] Error recording click event:', e);
  }
}

/**
 * Manually track a click
 */
export function trackClick(
  targetTag: string,
  options?: {
    targetId?: string;
    targetOiid?: string;
    metadata?: Record<string, unknown>;
  }
): void {
  if (!state?.config.enabled) {
    return;
  }

  const event: InteractionEvent = {
    type: 'click',
    targetTag,
    targetId: options?.targetId,
    targetOiid: options?.targetOiid,
    timestamp: Date.now(),
    route: getCurrentRoute(),
    metadata: options?.metadata,
  };

  recordClickEvent(event);
  state.callback?.(event);
}

/**
 * Check if click tracking is installed
 */
export function isClickTrackingInstalled(): boolean {
  return state?.isInstalled ?? false;
}
