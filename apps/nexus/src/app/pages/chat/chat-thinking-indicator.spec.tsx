/// <reference types="vitest/globals" />
import { act, render, screen } from '@testing-library/react';

import { ChatThinkingIndicator } from './chat-thinking-indicator';

describe('ChatThinkingIndicator', () => {
  it('cycles through concise request-progress states', () => {
    vi.useFakeTimers();
    render(<ChatThinkingIndicator />);

    expect(screen.getByRole('status')).toHaveTextContent('Understanding your request');

    act(() => vi.advanceTimersByTime(2_400));
    expect(screen.getByRole('status')).toHaveTextContent('Checking the available context');

    vi.useRealTimers();
  });
});
