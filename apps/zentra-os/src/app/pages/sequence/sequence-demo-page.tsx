import { useState } from 'react';

import { Icon, type IconName } from '@open-zentra/foundation-icons';

/**
 * A hardcoded Sequence, staged for a demo. Nothing here calls the API —
 * every row count, step, and chat turn is fixture data chosen to tell one
 * coherent story: raw file in, two typed cleanup steps, a branch into two
 * Final Tables, narrated entirely through the Data Steward conversation
 * that (in the real feature) would have produced it turn by turn.
 */

type NodeKind = 'raw' | 'step' | 'final';

interface SequenceNodeData {
  readonly id: string;
  readonly kind: NodeKind;
  readonly icon: IconName;
  readonly eyebrow: string;
  readonly title: string;
  readonly rows: number;
  readonly delta?: string;
  readonly left: number;
  readonly top: number;
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 104;

const NODES: readonly SequenceNodeData[] = [
  {
    id: 'raw',
    kind: 'raw',
    icon: 'database',
    eyebrow: 'Raw table',
    title: 'customer_orders_raw.csv',
    rows: 1248,
    left: 0,
    top: 178,
  },
  {
    id: 'drop_nulls',
    kind: 'step',
    icon: 'filter',
    eyebrow: 'drop_nulls',
    title: 'columns: [customer_email]',
    rows: 1190,
    delta: '−58',
    left: 236,
    top: 178,
  },
  {
    id: 'dedupe',
    kind: 'step',
    icon: 'copy',
    eyebrow: 'dedupe',
    title: 'all columns',
    rows: 1062,
    delta: '−128',
    left: 472,
    top: 178,
  },
  {
    id: 'cast_type',
    kind: 'step',
    icon: 'refresh_cw',
    eyebrow: 'cast_type',
    title: 'order_total → float',
    rows: 1062,
    left: 708,
    top: 178,
  },
  {
    id: 'orders_na',
    kind: 'final',
    icon: 'check_circle',
    eyebrow: 'Final table',
    title: 'orders_na',
    rows: 418,
    left: 944,
    top: 24,
  },
  {
    id: 'orders_clean',
    kind: 'final',
    icon: 'check_circle',
    eyebrow: 'Final table',
    title: 'orders_clean',
    rows: 1062,
    left: 944,
    top: 332,
  },
] as const;

const EDGES: ReadonlyArray<readonly [string, string]> = [
  ['raw', 'drop_nulls'],
  ['drop_nulls', 'dedupe'],
  ['dedupe', 'cast_type'],
  ['cast_type', 'orders_na'],
  ['cast_type', 'orders_clean'],
] as const;

const CANVAS_WIDTH = 944 + NODE_WIDTH + 24;
const CANVAS_HEIGHT = 332 + NODE_HEIGHT + 24;

const nodeById = new Map(NODES.map((node) => [node.id, node]));

const requireNode = (id: string): SequenceNodeData => {
  const node = nodeById.get(id);
  if (!node) {
    throw new Error(`Unknown Sequence node id in demo fixture: ${id}`);
  }
  return node;
};

const rightAnchor = (node: SequenceNodeData) => ({
  x: node.left + NODE_WIDTH,
  y: node.top + NODE_HEIGHT / 2,
});
const leftAnchor = (node: SequenceNodeData) => ({
  x: node.left,
  y: node.top + NODE_HEIGHT / 2,
});

const flowPath = (fromId: string, toId: string): string => {
  const from = rightAnchor(requireNode(fromId));
  const to = leftAnchor(requireNode(toId));
  const midX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${midX} ${from.y} ${midX} ${to.y} ${to.x} ${to.y}`;
};

interface Turn {
  readonly role: 'user' | 'agent';
  readonly content: string;
  readonly step?: string;
}

const TRANSCRIPT: readonly Turn[] = [
  {
    role: 'user',
    content: 'Here’s our raw orders export, customer_orders_raw.csv — can you clean it up?',
  },
  {
    role: 'agent',
    content:
      'Loaded **customer_orders\\_raw.csv** — 1,248 rows. `customer_email` has nulls in some rows. Want me to drop those?',
  },
  { role: 'user', content: 'Yes, drop them.' },
  {
    role: 'agent',
    content: 'Done — dropped 58 rows with a null `customer_email`. **1,190 rows** remain.',
    step: 'drop_nulls',
  },
  { role: 'user', content: 'There are some duplicate orders in there too.' },
  {
    role: 'agent',
    content: 'Removed 128 exact duplicate rows. **1,062 rows** left.',
    step: 'dedupe',
  },
  { role: 'user', content: '`order_total` is coming through as text — can you fix that?' },
  {
    role: 'agent',
    content: 'Cast `order_total` to `float` across all 1,062 rows.',
    step: 'cast_type',
  },
  {
    role: 'user',
    content: 'Give me one table of just North America orders, and one clean table of everything.',
  },
  {
    role: 'agent',
    content:
      'Built two Final Tables: **orders\\_na** (418 rows, `region = NA`) and **orders\\_clean** (1,062 rows, `order_total` renamed to `total_amount`).',
    step: 'orders_na',
  },
];

const KIND_STYLES: Record<NodeKind, { border: string; iconWrap: string; eyebrow: string }> = {
  raw: {
    border: 'border-border',
    iconWrap: 'bg-background-muted text-foreground-muted',
    eyebrow: 'text-foreground-muted',
  },
  step: {
    border: 'border-border',
    iconWrap: 'bg-accent text-accent-foreground',
    eyebrow: 'text-accent',
  },
  final: {
    border: 'border-success',
    iconWrap: 'bg-success text-success-foreground',
    eyebrow: 'text-success',
  },
};

const SequenceNode = ({
  node,
  active,
  onSelect,
}: {
  readonly node: SequenceNodeData;
  readonly active: boolean;
  readonly onSelect: (id: string) => void;
}) => {
  const style = KIND_STYLES[node.kind];
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      style={{ left: node.left, top: node.top, width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={`absolute flex flex-col justify-center gap-1.5 rounded-sm border ${style.border} bg-card px-4 py-3 text-left transition-shadow ${
        active ? 'shadow-[0_0_0_2px_var(--border-focus)]' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm ${style.iconWrap}`}
          aria-hidden="true"
        >
          <Icon name={node.icon} size="sm" />
        </span>
        <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${style.eyebrow}`}>
          {node.eyebrow}
        </span>
      </div>
      <p className="truncate font-mono text-xs text-foreground" title={node.title}>
        {node.title}
      </p>
      <p className="flex items-baseline gap-2 font-mono text-xs text-foreground-muted [font-variant-numeric:tabular-nums]">
        {node.rows.toLocaleString()} rows
        {node.delta ? <span className="text-foreground-muted">{node.delta}</span> : null}
      </p>
    </button>
  );
};

const SequenceGraph = ({
  activeStep,
  onSelect,
}: {
  readonly activeStep: string | null;
  readonly onSelect: (id: string) => void;
}) => (
  <div className="overflow-x-auto">
    <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
      <svg
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <style>
          {`
            .sequence-demo-flow-edge {
              stroke-dasharray: 5 6;
              animation: sequence-demo-flow 1.6s linear infinite;
            }
            @keyframes sequence-demo-flow {
              to { stroke-dashoffset: -22; }
            }
            @media (prefers-reduced-motion: reduce) {
              .sequence-demo-flow-edge { animation: none; }
            }
          `}
        </style>
        {EDGES.map(([from, to]) => (
          <path
            key={`${from}-${to}`}
            d={flowPath(from, to)}
            fill="none"
            stroke="var(--border-emphasis)"
            strokeWidth={1.5}
            className="sequence-demo-flow-edge"
          />
        ))}
      </svg>
      {NODES.map((node) => (
        <SequenceNode
          key={node.id}
          node={node}
          active={activeStep === node.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  </div>
);

const ChatTurn = ({
  turn,
  active,
  onSelect,
}: {
  readonly turn: Turn;
  readonly active: boolean;
  readonly onSelect: (id: string) => void;
}) => {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-sm border border-border bg-background-muted px-4 py-3 text-sm text-foreground">
          {turn.content}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!turn.step}
      onClick={() => turn.step && onSelect(turn.step)}
      className={`flex w-full gap-3 rounded-sm border border-transparent px-1 py-1 text-left transition-colors ${
        turn.step ? 'cursor-pointer hover:border-border' : 'cursor-default'
      } ${active ? 'border-border bg-background-muted' : ''}`}
    >
      <span
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-accent text-accent-foreground"
        aria-hidden="true"
      >
        <Icon name="sparkles" size="sm" />
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-foreground [&_strong]:font-semibold [&_code]:rounded-sm [&_code]:bg-background-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs">
        {renderInline(turn.content)}
      </span>
    </button>
  );
};

/** Just enough of markdown to render **bold** and `code` in fixture copy. */
const renderInline = (content: string) => {
  const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return <span key={index}>{part}</span>;
  });
};

export const SequenceDemoPage = () => {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const finalTables = NODES.filter((node) => node.kind === 'final');

  return (
    <section className="flex h-full flex-col px-8 py-10">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
        Sequence
      </p>
      <h1 className="mt-3 font-serif text-[clamp(2rem,4vw,3rem)] font-normal tracking-[-0.035em]">
        customer_orders_raw
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-foreground-muted">
        Raw file in, three typed steps, two Final Tables out — built entirely through
        conversation with Data Steward. Select a step to see the turn that produced it.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[11px] text-foreground-muted [font-variant-numeric:tabular-nums]">
        <span className="rounded-sm border border-border bg-card px-2 py-1">
          {NODES.filter((node) => node.kind === 'step').length} steps
        </span>
        <span className="rounded-sm border border-success bg-card px-2 py-1 text-success">
          {finalTables.length} Final Tables
        </span>
        <span className="rounded-sm border border-border bg-card px-2 py-1">
          1,248 → {finalTables.reduce((sum, node) => sum + node.rows, 0).toLocaleString()} rows
        </span>
      </div>

      <div className="mt-8 flex min-h-0 flex-1 gap-6">
        <div className="flex-[2] rounded-sm border border-border bg-card p-6">
          <SequenceGraph activeStep={activeStep} onSelect={setActiveStep} />
        </div>

        <div className="flex flex-1 flex-col rounded-sm border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
              Data Steward
            </p>
            <p className="mt-1 text-xs text-foreground-muted">Scoped to this Sequence</p>
          </div>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            {TRANSCRIPT.map((turn, index) => (
              <ChatTurn
                key={index}
                turn={turn}
                active={Boolean(turn.step) && turn.step === activeStep}
                onSelect={setActiveStep}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
