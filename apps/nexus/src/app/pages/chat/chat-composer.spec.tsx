/// <reference types="vitest/globals" />
import { useState } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChatComposer } from './chat-composer';

const ComposerHarness = ({ onSend, initialDraft = '' }: { readonly onSend: (message: string) => void; readonly initialDraft?: string }) => {
  const [draft, setDraft] = useState(initialDraft);

  return (
    <>
      <ChatComposer draft={draft} onDraftChange={setDraft} onSend={onSend} disabled={false} />
      <output data-testid="draft">{draft}</output>
    </>
  );
};

describe('ChatComposer', () => {
  it('accepts text while rendering no unsupported controls', async () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} initialDraft="Compare refunds" />);

    expect(screen.queryByRole('button', { name: 'Attach a file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mention a dataset' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Attach an image' })).toBeNull();

    const composer = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.keyDown(composer, { key: 'Enter' });

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Compare refunds'));
    await waitFor(() => expect(screen.getByTestId('draft')).not.toHaveTextContent('Compare refunds'));
    await waitFor(() => expect(composer.textContent).toBe(''));
  });

  it('clears the visible composer after sending with the Send button', async () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} initialDraft="Compare refunds" />);

    const composer = screen.getByRole('textbox', { name: 'Message' });
    await screen.findByRole('button', { name: 'Send' });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Compare refunds'));
    await waitFor(() => expect(screen.getByTestId('draft')).toHaveTextContent(''));
    await waitFor(() => expect(composer.textContent).toBe(''));
  });
});
