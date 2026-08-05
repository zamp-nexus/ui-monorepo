import { useEffect, useState } from 'react';

import { motion, useReducedMotion } from 'motion/react';

import { Icon } from '@open-zentra/foundation-icons';

const PROGRESS_STEPS = [
  'Understanding your request',
  'Checking the available context',
  'Working through the details',
  'Preparing a response',
] as const;

const STEP_INTERVAL_MS = 2_400;

/**
 * A brief, truthful indication that Nexus is still processing the message.
 * It intentionally describes the request lifecycle rather than inventing
 * hidden model reasoning or tool calls. Real streamed text replaces it.
 */
export const ChatThinkingIndicator = () => {
  const prefersReducedMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion) return undefined;
    const timer = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % PROGRESS_STEPS.length);
    }, STEP_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [prefersReducedMotion]);

  const step = PROGRESS_STEPS[stepIndex];
  return (
    <motion.div
      className="flex items-center gap-2.5 py-1 text-sm text-foreground-muted"
      role="status"
      aria-live="polite"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      data-testid="chat-thinking-indicator"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon
          name="loader_2"
          size="xs"
          className="animate-spin motion-reduce:animate-none"
          aria-hidden={true}
        />
      </span>
      <motion.span
        key={step}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >
        {step}
        <span className="inline-flex w-4 justify-start" aria-hidden="true">
          <span className="animate-pulse motion-reduce:animate-none">…</span>
        </span>
      </motion.span>
    </motion.div>
  );
};
