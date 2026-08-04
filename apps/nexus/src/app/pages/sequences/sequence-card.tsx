import { Link } from 'react-router-dom';

import { Badge, Card } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import type { SequenceListItem } from './types';

const ORIGIN_LABEL: Record<SequenceListItem['origin'], string> = {
  manual: 'Started here',
  chat: 'Started from chat',
};

const formatUpdated = (value: string): string => {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return 'unknown';
  return `updated ${at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
};

interface SequenceCardProps {
  readonly sequence: SequenceListItem;
}

export const SequenceCard = ({ sequence }: SequenceCardProps) => (
  <Card
    padding="md"
    component={Link}
    to={`/sequences/${sequence.sequence_id}`}
    className="flex flex-row flex-wrap items-center gap-x-5 gap-y-3 transition-colors hover:border-primary"
  >
    <Icon name="columns" size="lg" className="shrink-0 text-primary" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{sequence.raw_table.label}</p>
      <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted">
        {sequence.step_count} step{sequence.step_count === 1 ? '' : 's'}
        {' · '}
        {sequence.final_table_count} final table
        {sequence.final_table_count === 1 ? '' : 's'}
        {sequence.failed_run_count > 0 ? ` · ${sequence.failed_run_count} failed` : ''}
        {' · '}
        {formatUpdated(sequence.updated_at)}
      </p>
    </div>
    <Badge intent={sequence.origin === 'manual' ? 'default' : 'secondary'} size="sm">
      {ORIGIN_LABEL[sequence.origin]}
    </Badge>
  </Card>
);
