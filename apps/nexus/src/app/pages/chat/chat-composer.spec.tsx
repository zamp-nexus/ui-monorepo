/// <reference types="vitest/globals" />
import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatComposer } from './chat-composer';

const ComposerHarness = ({ onSend }: { readonly onSend: (message: string) => void }) => {
  const [draft, setDraft] = useState('');

  return <ChatComposer draft={draft} onDraftChange={setDraft} onSend={onSend} disabled={false} />;
};

describe('ChatComposer', () => {
  it('accepts text while rendering no unsupported controls', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ComposerHarness onSend={onSend} />);

    expect(screen.queryByRole('button', { name: 'Attach a file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mention a dataset' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Attach an image' })).toBeNull();

    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Compare refunds{Enter}');

    expect(onSend).toHaveBeenCalledWith('Compare refunds');
  });
});
