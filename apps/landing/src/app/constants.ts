export const PRODUCT_NAME = 'Nexus';
export const PRODUCT_URL = 'https://nexus.openzentra.com';
export const LANDING_URL = 'https://landing.nexus.openzentra.com';
export const PLATFORM_URL = '/platform';

export interface NavigationItem {
  readonly label: string;
  readonly href: `#${string}`;
}

export const NAVIGATION: readonly NavigationItem[] = [
  { label: 'Trust loop', href: '#trust-loop' },
  { label: 'Architecture', href: '#architecture' },
  { label: 'Operations', href: '#operations' },
  { label: 'Security', href: '#security' },
];

export interface StoryStep {
  readonly index: string;
  readonly stage: string;
  readonly title: string;
  readonly description: string;
  readonly signal: string;
}

export const STORY_STEPS: readonly StoryStep[] = [
  {
    index: '01',
    stage: 'Ingest',
    title: 'Bring the context, not the chaos.',
    description:
      'Nexus turns connected and uploaded data into a governed analytical surface before an agent touches it.',
    signal: 'Source scope verified',
  },
  {
    index: '02',
    stage: 'Reason',
    title: 'Agents operate inside the model.',
    description:
      'Orchestration, analysis, and follow-up work share approved semantics while remaining independently attributable.',
    signal: '4 bounded executions',
  },
  {
    index: '03',
    stage: 'Verify',
    title: 'Every answer earns confidence.',
    description:
      'An independent evaluator re-derives the result. Contradictions stay visible instead of being averaged away.',
    signal: 'Independent recheck converged',
  },
  {
    index: '04',
    stage: 'Decide',
    title: 'Humans own the irreversible edge.',
    description:
      'Policy can stop publication for low confidence, incomplete evidence, or explicit organizational review.',
    signal: 'Approval policy satisfied',
  },
  {
    index: '05',
    stage: 'Replay',
    title: 'The path survives the answer.',
    description:
      'Evidence references, model attribution, cost, and decisions remain available as a safe, immutable replay.',
    signal: 'Audit delivery confirmed',
  },
];

export const TRUST_PRINCIPLES = [
  [
    '01',
    'Governed semantics',
    'Agents query approved business definitions, not improvised SQL vocabulary.',
  ],
  [
    '02',
    'Independent evaluation',
    'A second execution checks the work before confidence reaches publication.',
  ],
  [
    '03',
    'Human control',
    'Policy creates an explicit gate wherever judgment belongs to your organization.',
  ],
  [
    '04',
    'Immutable replay',
    'Evidence, decisions, models, and cost remain attributable after the run completes.',
  ],
] as const;

export const TRACE_LINES = [
  ['00:00.000', 'analysis_run.created', 'Question registered'],
  ['00:00.184', 'orchestrator.plan', '4 bounded work items'],
  ['00:01.312', 'semantic_query.completed', 'artifact://query/eu-refunds'],
  ['00:02.064', 'evaluation.converged', 'confidence bounded to 0.91'],
  ['00:02.481', 'approval.policy', 'human judgment requested'],
  ['00:08.902', 'finding.published', 'audit delivery confirmed'],
] as const;
