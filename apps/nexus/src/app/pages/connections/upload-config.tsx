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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connector-sources'] });
      navigate('/connections');
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
    <section className="mx-auto max-w-4xl px-8 py-10">
      <Button component={Link} to="/connections/new" intent="ghost" size="sm" className="-ml-2">
        <Icon name="arrow_left" size="sm" /> Pick a different source
      </Button>

      <h1 className="mt-4 font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] font-normal tracking-[-0.035em]">
        Upload a file
      </h1>
      <p className="mt-3 text-sm text-foreground-muted">
        Upload a CSV, Parquet, or Excel file. The data will be stored securely in Nexus.
      </p>

      {!preview ? (
        <div className="mt-10">
          <div className="flex max-w-md flex-col gap-4">
            <Label htmlFor="file-upload">Select file</Label>
            <input
              id="file-upload"
              type="file"
              accept=".csv,.parquet,.xlsx,.xls"
              onChange={handleFileChange}
              disabled={previewMutation.isPending || !canWrite}
              className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
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
            >
              Preview
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-8">
          <Alert intent="success" title="File inspected successfully">
            Found {preview.columns.length} columns and previewing {preview.rows.length} rows.
          </Alert>

          <div className="overflow-x-auto rounded-lg border border-border">
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

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="connection-name">Connection Name</Label>
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

            <div className="mt-4 flex justify-end gap-3">
              <Button type="button" intent="secondary" onClick={() => setPreview(null)}>
                Change File
              </Button>
              <Button
                type="submit"
                disabled={commitMutation.isPending || !canWrite || !connectionName.trim()}
                loading={commitMutation.isPending}
              >
                Commit Upload
              </Button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
