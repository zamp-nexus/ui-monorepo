import { Icon } from '@open-zentra/foundation-icons';

import { ProductLogo } from '../../shell/product-mark';

import type { ChatSuggestion } from '../../types';

interface ChatEmptyStateProps {
  readonly greetingName: string;
  readonly suggestions: readonly ChatSuggestion[];
  readonly sourceName: string | null;
  readonly onChoose: (prompt: string) => void;
}

/**
 * What an empty thread offers: a greeting, and four questions this tenant is
 * actually allowed to ask.
 */
export const ChatEmptyState = ({ greetingName, sourceName, suggestions, onChoose }: ChatEmptyStateProps) => (
  <div className="flex h-full flex-col items-center justify-center px-6 py-10 sm:px-10">
    <span
      className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary"
      aria-hidden="true"
    >
      <ProductLogo className="h-6 w-6" />
    </span>

    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-primary">
      Private analysis workspace
    </p>
    <h2 className="mt-3 text-center text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-[-0.045em] text-foreground">
      What would you like to understand, {greetingName}?
    </h2>
    <p className="mt-3 max-w-xl text-center text-sm leading-relaxed text-foreground-muted">
      {sourceName
        ? `${sourceName} is ready. Ask a question about it in plain language, or start with a suggestion below.`
        : 'Ask a question about your data in plain language. Add the context or level of detail you need, and Nexus will adapt the answer.'}
    </p>

    <div className="mt-9 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.suggestion_id}
          type="button"
          onClick={() => onChoose(suggestion.prompt)}
          className="group flex min-h-28 flex-col justify-between gap-4 rounded-lg border border-border bg-card p-4 text-left shadow-[var(--shadow-depth-01)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-[var(--shadow-depth-02)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <span className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-primary">
            <Icon name={suggestion.icon} size="sm" />
            {suggestion.label}
          </span>
          <span className="text-sm leading-relaxed text-foreground-muted group-hover:text-foreground">
            {suggestion.prompt}
          </span>
        </button>
      ))}
    </div>
  </div>
);
