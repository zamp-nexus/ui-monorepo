import { useState } from 'react';

import { Alert, Button, Modal, Select, Textarea } from '@open-zentra/foundation-design-system';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import type { TokenSource } from '../../api';
import { latestCatalog } from '../datasets/api';
import { useActiveGroup } from '../chat/use-active-group';
import { listSources } from '../connections/api';

import { createSequence } from './api';

interface NewSequenceModalProps {
  readonly open: boolean;
  readonly getToken: TokenSource;
  readonly onClose: () => void;
}

/**
 * Picks a Raw Table and starts a Sequence from it.
 *
 * Two selects rather than one combined picker: a source's catalog is only
 * fetched once a source is chosen, so the table list never asks for more
 * than the tenant is about to use.
 */
export const NewSequenceModal = ({ open, getToken, onClose }: NewSequenceModalProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const group = useActiveGroup(getToken);
  // Empty string, not `null`, means "nothing picked yet" — Select is
  // controlled from its first render either way, and Base UI warns if a
  // component switches from uncontrolled (`value={undefined}`) to
  // controlled partway through its life.
  const [dataSourceId, setDataSourceId] = useState('');
  const [tableName, setTableName] = useState('');
  const [message, setMessage] = useState('');

  const reset = () => {
    setDataSourceId('');
    setTableName('');
    setMessage('');
  };

  const sources = useQuery({
    queryKey: ['connector-sources'],
    queryFn: () => listSources(getToken),
    enabled: open,
  });
  const connected = (sources.data ?? []).filter((source) => source.kind === 'connected');

  const catalog = useQuery({
    queryKey: ['catalog', dataSourceId],
    queryFn: () => latestCatalog(getToken, dataSourceId),
    enabled: open && dataSourceId !== '',
  });
  const tables = catalog.data?.tables ?? [];

  const create = useMutation({
    mutationFn: async () => {
      if (!group.data || !catalog.data || !tableName) {
        throw new Error('A source table and message are required.');
      }
      return createSequence(getToken, {
        // `project_id` names the field on the wire (the Sequence API's own
        // rename is deferred, matching ThreadService.create()'s own
        // parameter) -- the value it carries is a Group id (ADR-0028).
        project_id: group.data,
        raw_table: {
          kind: 'connector_source_table',
          catalog_version_id: catalog.data.catalog_version_id,
          source_table_name: tableName,
        },
        message,
      });
    },
    onSuccess: (sequence) => {
      void queryClient.invalidateQueries({ queryKey: ['sequences'] });
      reset();
      onClose();
      navigate(`/sequences/${sequence.sequence_id}`);
    },
  });

  const canSubmit = Boolean(tableName) && message.trim().length > 0 && !create.isPending;

  return (
    <Modal
      size="480"
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>New Sequence</Modal.Title>
          <Modal.Description>
            Pick the Raw Table this Sequence starts from, then tell Data
            Steward what to do with it.
          </Modal.Description>
          <Modal.Close />
        </Modal.Header>
        <Modal.Body className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="sequence-source">
              Source
            </label>
            <Select
              value={dataSourceId}
              onValueChange={(value) => {
                setDataSourceId(value);
                setTableName('');
              }}
            >
              <Select.Trigger id="sequence-source" placeholder="Choose a connected source" />
              <Select.Content>
                {connected.map((source) => (
                  <Select.Item key={source.data_source_id} value={source.data_source_id}>
                    {source.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="sequence-table">
              Table
            </label>
            <Select
              value={tableName}
              onValueChange={setTableName}
              disabled={dataSourceId === '' || catalog.isPending}
            >
              <Select.Trigger id="sequence-table" placeholder="Choose a table" />
              <Select.Content>
                {tables.map((table) => (
                  <Select.Item
                    key={`${table.database}.${table.name}`}
                    value={`${table.database}.${table.name}`}
                  >
                    {table.database}.{table.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="sequence-message">
              First instruction
            </label>
            <Textarea
              id="sequence-message"
              placeholder="e.g. Drop rows with a missing email, then dedupe."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>

          {create.error ? (
            <Alert intent="error" role="alert" title="Could not create this Sequence">
              {create.error.message}
            </Alert>
          ) : null}
          {group.error ? (
            <Alert intent="error" role="alert" title="Could not resolve a workspace">
              {group.error.message}
            </Alert>
          ) : null}

          <Button
            disabled={!canSubmit}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Create Sequence
          </Button>
        </Modal.Body>
      </Modal.Content>
    </Modal>
  );
};
