/**
 * The questions an empty thread offers.
 *
 * These are not marketing copy — they are the governed scenarios the router
 * will actually resolve, read from `/v1/scenarios`. Offering anything else
 * would invite a question the server can only answer with a clarification.
 */

import type { ChatSuggestion, Scenario } from '../../types';

/**
 * How many to show. The empty state is a starting point, not a catalogue, and
 * the grid is built for a small number.
 */
const SHOWN = 4;

export const suggestionsFromScenarios = (
  scenarios: readonly Scenario[],
): readonly ChatSuggestion[] =>
  scenarios.slice(0, SHOWN).map((scenario) => ({
    suggestion_id: scenario.key,
    icon: 'search',
    // The first fact is the scope — what the question is *about* — which reads
    // better on a card than the full canonical sentence.
    label: scenario.facts[0] ?? 'Ask a governed question',
    prompt: scenario.question,
  }));
