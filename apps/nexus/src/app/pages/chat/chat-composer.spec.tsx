/// <reference types="vitest/globals" />
import { useState } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChatComposer } from './chat-composer';

const ComposerHarness = ({ onSend }: { readonly onSend: (message: string) => void }) => {
  const [draft, setDraft] = useState('');

  return <ChatComposer draft={draft} onDraftChange={setDraft} onSend={onSend} disabled={false} />;
};

describe('ChatComposer', () => {
  it('accepts text while rendering no unsupported controls', async () => {
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} />);

    expect(screen.queryByRole('button', { name: 'Attach a file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mention a dataset' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Attach an image' })).toBeNull();

    const composer = screen.getByRole('textbox', { name: 'Message' });
    composer.innerHTML = '<p>Compare refunds</p>';
    fireEvent.keyDown(composer, { key: 'Enter' });

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Compare refunds'));
  });
});
