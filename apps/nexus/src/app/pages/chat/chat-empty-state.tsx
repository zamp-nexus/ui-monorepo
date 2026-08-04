import { Icon } from '@open-zentra/foundation-icons';
import { motion, type Variants } from 'framer-motion';

import type { ChatSuggestion } from '../../types';

interface ChatEmptyStateProps {
  readonly greetingName: string;
  readonly suggestions: readonly ChatSuggestion[];
  readonly onChoose: (prompt: string) => void;
}

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

/**
 * What an empty thread offers: a greeting, and four questions this tenant is
 * actually allowed to ask.
 */
export const ChatEmptyState = ({ greetingName, suggestions, onChoose }: ChatEmptyStateProps) => (
  <motion.div
    variants={container}
    initial="hidden"
    animate="show"
    className="flex h-full flex-col items-center justify-center px-6 py-10"
  >
    <motion.span
      variants={item}
      className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-glass backdrop-blur-md text-primary shadow-[0_0_24px_rgba(var(--color-primary),0.3)]"
      aria-hidden="true"
    >
      <motion.div
        animate={{ rotate: [0, 15, -15, 0] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
      >
        <Icon name="sparkles" size="lg" />
      </motion.div>
    </motion.span>

    <motion.h2 variants={item} className="text-center font-serif text-[clamp(1.6rem,3vw,2.4rem)] font-normal tracking-[-0.03em]">
      How can I help, {greetingName}?
    </motion.h2>
    <motion.p variants={item} className="mt-3 max-w-lg text-center text-sm leading-relaxed text-foreground-muted">
      Ask about a governed metric, an Analysis Run, or what is waiting on your judgment. Every
      answer is traceable to the evidence behind it.
    </motion.p>

    <motion.div variants={item} className="mt-10 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
      {suggestions.map((suggestion) => (
        <motion.button
          key={suggestion.suggestion_id}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={() => onChoose(suggestion.prompt)}
          className="group flex flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-5 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-primary transition-colors group-hover:text-primary">
            <Icon name={suggestion.icon} size="sm" />
            {suggestion.label}
          </span>
          <span className="text-sm text-foreground-muted transition-colors group-hover:text-foreground">{suggestion.prompt}</span>
        </motion.button>
      ))}
    </motion.div>
  </motion.div>
);
