import { Badge, Modal, Switch } from '@open-zentra/foundation-design-system';

import { formatBytes, formatFraction, formatRows } from './format';
import type { CatalogField, CatalogTable } from './types';

interface TableDetailModalProps {
  readonly table: CatalogTable | null;
  readonly canWrite: boolean;
  readonly onClose: () => void;
  readonly onToggleField: (fieldName: string, visible: boolean) => void;
}

const Stat = ({ label, value }: { readonly label: string; readonly value: string }) => (
  <div className="min-w-0 border-l border-border-subtle pl-3 first:border-l-0 first:pl-0">
    <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
      {label}
    </dt>
    <dd className="mt-1 truncate text-base font-medium tabular-nums" title={value}>
      {value}
    </dd>
  </div>
);

/**
 * A field's observed statistics, or nothing at all.
 *
 * Absent rather than zeroed when the field was not profiled: a null fraction of
 * "0%" claims the column was measured and had no nulls, which is a different
 * statement from never having looked.
 */
const Profile = ({ field }: { readonly field: CatalogField }) => {
  const profile = field.profile;
  if (!profile) return <span className="text-foreground-muted">not profiled</span>;

  return (
    <span className="flex items-center gap-3 whitespace-nowrap tabular-nums text-foreground-muted">
      <span title="Fraction of sampled rows that were null">
        {formatFraction(profile.null_fraction)} null
      </span>
      {profile.distinct_count != null ? (
        <span className="border-l border-border pl-3" title="Distinct values within the sample">
          {formatRows(profile.distinct_count)} distinct
        </span>
      ) : null}
      <span className="border-l border-border pl-3" title="Rows the statistics are based on">
        of {formatRows(profile.sampled_rows)} sampled
      </span>
    </span>
  );
};

/**
 * Everything a harvest learned about one table.
 *
 * The column list is the point of the page, so it is a table rather than cards:
 * comparing types down a column is the thing a reader is here to do.
 */
export const TableDetailModal = ({
  table,
  canWrite,
  onClose,
  onToggleField,
}: TableDetailModalProps) => {
  const fields = [...(table?.fields ?? [])].sort((a, b) => a.position - b.position);

  return (
    <Modal
      size="960"
      open={table !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            <span className="font-mono">{table?.name}</span>
          </Modal.Title>
          <Modal.Description>
            {table?.database} · {fields.length} columns
            {table?.engine ? ` · ${table.engine}` : ''}
          </Modal.Description>
          <Modal.Close />
          {/* The summary lives in the header, not the body. `Modal.Header` is
              `shrink-0` and sits outside the scroll container, so this table
              context stays visible while fields scroll beneath it. */}
          <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 rounded-lg border border-border-subtle bg-background/40 px-4 py-3 sm:grid-cols-4">
            <Stat label="Rows" value={formatRows(table?.estimated_rows)} />
            <Stat label="Size" value={formatBytes(table?.size_bytes)} />
            <Stat label="Columns" value={String(fields.length)} />
            <Stat label="Engine" value={table?.engine ?? '—'} />
          </dl>
        </Modal.Header>

        <Modal.Body>
          <div>
            {/* `border-separate`, not `border-collapse`. With collapsed borders
                a cell's background is not painted by the cell itself, so a
                sticky `th` shows the rows passing beneath it; separated borders
                keep each cell opaque.

                The background is the layer token directly rather than
                `bg-background`, and the box-shadow paints that same colour
                upward over the body's `pt-4` — sticky `top-0` pins the row to
                the scrollport's padding edge, so without it rows show through
                that 1rem strip above the headings. */}
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
              <colgroup>
                <col className="w-12" />
                <col className="w-[28%]" />
                <col className="w-[20%]" />
                <col />
                <col className="w-36" />
              </colgroup>
              <thead>
                <tr className="text-left">
                  {['#', 'Column', 'Data type', 'Profile', 'Agent access'].map((heading) => (
                    <th
                      className="sticky top-0 z-20 border-b border-border bg-[var(--bg-layer-00)] px-2 pb-3 pt-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-foreground-muted shadow-[0_-1.25rem_0_0_var(--bg-layer-00)] first:pl-0 last:pr-0"
                      key={heading}
                      scope="col"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr
                    key={field.field_id}
                    className="group transition-colors hover:bg-secondary/30"
                  >
                    <td className="border-b border-border/50 py-3.5 pl-0 pr-2 tabular-nums text-foreground-muted">
                      {field.position}
                    </td>
                    <td className="border-b border-border/50 px-2 py-3.5 font-mono font-medium first:pl-0">
                      {field.name}
                    </td>
                    <td className="border-b border-border/50 px-2 py-3.5">
                      <div className="font-mono text-xs text-foreground-muted">
                        {field.declared_type}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge intent="default" size="sm" className="font-mono">
                          {field.family}
                        </Badge>
                        <span className="text-xs text-foreground-muted">
                          {field.nullable ? 'Nullable' : 'Required'}
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-border/50 px-2 py-3.5 text-xs">
                      <Profile field={field} />
                    </td>
                    <td className="border-b border-border/50 py-3.5 pl-2 pr-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={
                            field.agent_visible
                              ? 'text-xs font-medium'
                              : 'text-xs text-foreground-muted'
                          }
                        >
                          {field.agent_visible ? 'Available' : 'Hidden'}
                        </span>
                        <Switch
                          size="sm"
                          checked={field.agent_visible}
                          disabled={!canWrite}
                          aria-label={`Allow agents to access ${field.name}`}
                          onCheckedChange={(visible) => onToggleField(field.name, visible)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {fields.length === 0 ? (
            <p className="mt-5 text-sm text-foreground-muted">
              This table was listed but its columns were not described — the harvest may have run
              out of its query budget before reaching it.
            </p>
          ) : null}
        </Modal.Body>
      </Modal.Content>
    </Modal>
  );
};
