import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ProductMark } from './product-mark';

describe('ProductMark', () => {
  it('renders the standalone Nexus mark as the home link', () => {
    const { container } = render(
      <MemoryRouter>
        <ProductMark />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Nexus home' })).toHaveAttribute('href', '/');
    expect(container.querySelector('image')).toHaveAttribute('href', '/nexus-mark-source.png');
  });
});
