import { NAVIGATION, PLATFORM_URL, PRODUCT_URL } from '../constants';
import { ProductWordmark } from './product-mark';

export const SiteHeader = () => (
  <header className="site-header">
    <a className="site-header__brand" href="#top" aria-label="Nexus landing page">
      <ProductWordmark />
    </a>
    <nav className="site-nav" aria-label="Primary navigation">
      <a href={PLATFORM_URL}>Platform</a>
      {NAVIGATION.map((item) => (
        <a key={item.href} href={item.href}>
          {item.label}
        </a>
      ))}
    </nav>
    <a
      className="primary-link primary-link--small"
      href={PRODUCT_URL}
      data-testid="header-product-link"
    >
      Open Nexus <span aria-hidden="true">↗</span>
    </a>
  </header>
);
