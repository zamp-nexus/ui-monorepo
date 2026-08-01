import { Link } from 'react-router-dom';

import { PRODUCT_NAME, PRODUCT_RELEASE_LABEL } from '../constants/product';

interface ProductMarkProps {
  /** Show the release line under the wordmark, as the navigation rail does. */
  readonly showRelease?: boolean;
}

/**
 * The wordmark, and the only link back to the launcher.
 */
export const ProductMark = ({ showRelease = false }: ProductMarkProps) => (
  <Link
    className="inline-flex flex-col gap-0.5 no-underline"
    to="/"
    aria-label={`${PRODUCT_NAME} home`}
  >
    <span className="font-serif text-2xl font-bold uppercase leading-none tracking-[0.02em] text-primary">
      {PRODUCT_NAME}
    </span>
    {showRelease ? (
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
        {PRODUCT_RELEASE_LABEL}
      </span>
    ) : null}
  </Link>
);
