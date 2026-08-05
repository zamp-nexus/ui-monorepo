import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import {
  Alert,
  Button,
  Input,
  Label,
} from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import type { TokenSource } from '../../api';
import { commitUpload, previewUpload } from './api';
import type { UploadPreviewResponse } from './types';

interface UploadConfigProps {
  readonly getToken: TokenSource;
  readonly canWrite: boolean;
}

export const UploadConfig = ({ getToken, canWrite }: UploadConfigProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploadFormat, setUploadFormat] = useState<'csv' | 'parquet' | 'excel'>('csv');
  const [preview, setPreview] = useState<UploadPreviewResponse | null>(null);
  const [connectionName, setConnectionName] = useState('');

  const previewMutation = useMutation({
    mutationFn: () => previewUpload(getToken, file!, uploadFormat),
    onSuccess: (data) => {
      setPreview(data);
      setConnectionName(data.filename);
    },
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      commitUpload(getToken, preview!.upload_id, {
        name: connectionName,
        columns: preview!.columns,
      }),
    onSuccess: (source) => {
      queryClient.invalidateQueries({ queryKey: ['connector-sources'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', source.data_source_id] });
      navigate(
        `/chats?source=${encodeURIComponent(source.data_source_id)}&sourceName=${encodeURIComponent(source.name)}`,
      );
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0];
      setFile(selected);
      if (selected.name.endsWith('.parquet')) {
        setUploadFormat('parquet');
      } else if (selected.name.endsWith('.xlsx') || selected.name.endsWith('.xls')) {
        setUploadFormat('excel');
      } else {
        setUploadFormat('csv');
      }
      setPreview(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    commitMutation.mutate();
  };

  return (
    <section className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <Button component={Link} to="/datasets" intent="ghost" size="sm" className="-ml-2">
        <Icon name="arrow_left" size="sm" /> Back to data
      </Button>

      <p className="mt-7 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-primary">
        Add data
      </p>
      <h1 className="mt-3 text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold tracking-[-0.045em]">
        Upload a file to analyze
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground-muted">
        Start with a CSV, Parquet, or Excel file. Nexus profiles its structure before you begin
        asking questions. Your upload is private until you choose to share it.
      </p>

      {!preview ? (
        <div className="mt-10 max-w-2xl rounded-xl border border-dashed border-border-emphasis bg-card p-6 shadow-[var(--shadow-depth-01)] sm:p-8">
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="file-upload">Choose a file</Label>
              <p className="mt-1 text-sm text-foreground-muted">CSV, Parquet, or Excel. You can inspect it before it is added.</p>
            </div>
            <input
              id="file-upload"
              type="file"
              accept=".csv,.parquet,.xlsx,.xls"
              onChange={handleFileChange}
              disabled={previewMutation.isPending || !canWrite}
              className="flex h-12 w-full rounded-lg border border-border bg-background px-2 py-1 text-sm leading-9 text-foreground file:mr-4 file:h-9 file:align-middle file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-0 file:text-sm file:font-medium file:leading-9 file:text-foreground hover:file:bg-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
            />
            {previewMutation.error && (
              <Alert intent="error" title="Preview failed">
                {previewMutation.error.message}
              </Alert>
            )}
            <Button
              disabled={!file || !canWrite || previewMutation.isPending}
              loading={previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
              className="self-start"
            >
              Inspect file
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-7">
          <div className="flex flex-wrap items-start justify-between gap-4 border-y border-border py-5">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-primary">Data profile</p>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.025em]">{preview.filename}</h2>
              <p className="mt-1 text-sm text-foreground-muted">{preview.columns.length} columns · previewing {preview.rows.length} rows</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
              <Icon name="check" size="sm" /> Ready to analyze
            </span>
          </div>

          <Alert intent="success" title="File inspected successfully">
            Review the sample below, name the data source, then continue directly to Analyze.
          </Alert>

          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[var(--shadow-depth-01)]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary text-foreground-muted">
                <tr>
                  {preview.columns.map((col) => (
                    <th key={col.name} className="px-4 py-3 font-medium">
                      <div className="flex flex-col">
                        <span>{col.name}</span>
                        <span className="font-mono text-[10px] font-normal text-foreground-muted">
                          {col.declared_type}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.rows.map((row, idx) => (
                  <tr key={idx} className="transition-colors hover:bg-secondary/50">
                    {row.map((val, colIdx) => (
                      <td key={colIdx} className="px-4 py-3 whitespace-nowrap">
                        {val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={onSubmit} className="max-w-xl border-t border-border pt-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="connection-name">Name this data source</Label>
              <Input
                id="connection-name"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder="e.g. Q3 Financials"
                autoComplete="off"
                disabled={commitMutation.isPending || !canWrite}
              />
            </div>

            {commitMutation.error && (
              <Alert intent="error" title="Upload failed">
                {commitMutation.error.message}
              </Alert>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button type="button" intent="secondary" onClick={() => setPreview(null)}>
                Change File
              </Button>
              <Button
                type="submit"
                disabled={commitMutation.isPending || !canWrite || !connectionName.trim()}
                loading={commitMutation.isPending}
              >
                Add and start analyzing
              </Button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
