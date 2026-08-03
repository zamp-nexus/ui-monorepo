/**
 * Parses `#dataset`, `@user`, and `/skill` out of a composer draft (ADR-0032).
 *
 * None of these bypass governance: `#dataset` only supplies the same
 * `data_connection_id` a message could already carry; `/skill` is a hint
 * Intake still validates against the Analytical Scope, not a direct dispatch
 * (rejected explicitly in ADR-0032 for exactly that reason). `@user` has no
 * backend effect yet -- there is no notification system to wire it to -- so
 * it is parsed and shown, not acted on.
 */

const HASH_TAG = /#([a-zA-Z0-9_-]+)/g;
const AT_MENTION = /@([a-zA-Z0-9_-]+)/g;
const SLASH_SKILL = /^\/([a-zA-Z0-9_-]+)\s?/;

export interface ParsedComposerDraft {
  /** The draft with every recognized command token removed. */
  readonly text: string;
  readonly datasetHint: string | null;
  readonly mentions: readonly string[];
  readonly skillHint: string | null;
}

export const parseComposerCommands = (draft: string): ParsedComposerDraft => {
  const skillMatch = SLASH_SKILL.exec(draft);
  const skillHint = skillMatch ? skillMatch[1] : null;
  let text = skillHint ? draft.slice(skillMatch![0].length) : draft;

  const mentions = [...text.matchAll(AT_MENTION)].map((match) => match[1]);
  const datasetMatches = [...text.matchAll(HASH_TAG)];
  const datasetHint = datasetMatches.length > 0 ? datasetMatches[0][1] : null;

  text = text.replace(HASH_TAG, '').replace(AT_MENTION, '').replace(/\s+/g, ' ').trim();

  return { text, datasetHint, mentions, skillHint };
};
