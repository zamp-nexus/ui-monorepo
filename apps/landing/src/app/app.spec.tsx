import { render, screen } from '@testing-library/react';

import App from './app';
import { PLATFORM_URL, PRODUCT_URL } from './constants';

describe('Nexus landing page', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('communicates the governed analytical runtime', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /governed runtime for analytical agents/i }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: /trust is architecture/i })).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: /operate agents like infrastructure/i }),
    ).toBeTruthy();
  });

  it('sends every primary conversion to the existing Nexus product', () => {
    render(<App />);

    const productLinks = screen.getAllByRole('link', { name: /open nexus/i });
    expect(productLinks).toHaveLength(3);
    for (const link of productLinks) {
      expect(link.getAttribute('href')).toBe(PRODUCT_URL);
    }
  });

  it('uses same-page navigation for the product story', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: 'Trust loop' }).getAttribute('href')).toBe(
      '#trust-loop',
    );
    expect(screen.getByRole('link', { name: 'Architecture' }).getAttribute('href')).toBe(
      '#architecture',
    );
    expect(screen.getByRole('link', { name: 'Operations' }).getAttribute('href')).toBe(
      '#operations',
    );
    expect(screen.getByRole('link', { name: 'Security' }).getAttribute('href')).toBe('#security');
    expect(screen.getByRole('link', { name: 'Platform' }).getAttribute('href')).toBe(
      PLATFORM_URL,
    );
  });

  it('renders the public platform narrative at its direct URL', () => {
    window.history.pushState({}, '', PLATFORM_URL);
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /agentic work needs a control plane/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: /make the work inspectable before making it autonomous/i }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /explore nexus/i }).getAttribute('href')).toBe(
      PRODUCT_URL,
    );
  });
});
