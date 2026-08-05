/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react';

import { Markdown } from './markdown';

describe('Markdown', () => {
  it('renders supported Markdown links without accepting unsafe HTML or URLs', async () => {
    const { container } = render(
      <Markdown>{'# Finding\n\n[Read evidence](https://example.com/evidence)\n\n<img src=x onerror=alert(1)>\n\n[Unsafe](javascript:alert(1))'}</Markdown>,
    );

    const link = await screen.findByRole('link', { name: 'Read evidence' });
    expect(link.getAttribute('href')).toBe('https://example.com/evidence');
    expect(screen.queryByRole('link', { name: 'Unsafe' })).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeTruthy();
  });
});
