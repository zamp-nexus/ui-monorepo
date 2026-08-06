const Node = ({
  x,
  y,
  width,
  title,
  detail,
  emphasis = false,
}: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly title: string;
  readonly detail: string;
  readonly emphasis?: boolean;
}) => (
  <g className={emphasis ? 'architecture-node architecture-node--emphasis' : 'architecture-node'}>
    <rect x={x} y={y} width={width} height="68" rx="8" />
    <text x={x + 16} y={y + 27} className="architecture-node__title">
      {title}
    </text>
    <text x={x + 16} y={y + 47} className="architecture-node__detail">
      {detail}
    </text>
  </g>
);

export const ArchitectureMap = () => (
  <figure className="architecture-map" aria-labelledby="architecture-caption">
    <svg viewBox="0 0 1120 590" role="img" aria-labelledby="architecture-title architecture-desc">
      <title id="architecture-title">Nexus governed analytical architecture</title>
      <desc id="architecture-desc">
        Sources flow through preparation and governed semantics into an agent runtime. Evidence,
        approvals, model routing, and the audit ledger surround every execution.
      </desc>
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="architecture-arrow" />
        </marker>
        <filter id="soft-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g className="architecture-connections">
        <path d="M188 136H250" />
        <path d="M188 236H250" />
        <path d="M188 336H250" />
        <path d="M422 236H488" />
        <path d="M660 236H730" />
        <path d="M902 236H964" />
        <path d="M574 270V388" />
        <path d="M816 270V388" />
        <path d="M574 456H816" />
      </g>
      <Node x={16} y={102} width={172} title="Warehouses" detail="Read in place" />
      <Node x={16} y={202} width={172} title="Uploaded data" detail="Private by default" />
      <Node x={16} y={302} width={172} title="Live systems" detail="Scoped connectors" />
      <Node x={250} y={202} width={172} title="Sequences" detail="Typed preparation" />
      <Node
        x={488}
        y={202}
        width={172}
        title="Semantic model"
        detail="Governed measures"
        emphasis
      />
      <Node x={730} y={202} width={172} title="Agent runtime" detail="Bounded execution" emphasis />
      <Node x={964} y={202} width={140} title="Finding" detail="Evidence backed" />
      <Node x={488} y={388} width={172} title="Model routing" detail="Cost + attribution" />
      <Node x={730} y={388} width={172} title="Human approval" detail="Policy controlled" />
      <Node x={608} y={498} width={176} title="Audit ledger" detail="Immutable replay" />
      <path className="architecture-audit-line" d="M574 456V532H608" />
      <path className="architecture-audit-line" d="M816 456V532H784" />
      <circle className="architecture-pulse" cx="574" cy="236" r="5" filter="url(#soft-glow)" />
    </svg>
    <figcaption id="architecture-caption">
      One trust boundary around data, reasoning, judgment, and replay.
    </figcaption>
  </figure>
);
