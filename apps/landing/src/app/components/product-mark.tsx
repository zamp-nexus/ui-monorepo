import { PRODUCT_NAME } from '../constants';

export const ProductLogo = ({ className = '' }: { readonly className?: string }) => (
  <svg className={className} viewBox="0 0 368 368" role="img" aria-label={`${PRODUCT_NAME} mark`}>
    <path d="M28 28h82c10 0 18 5 23 14l27 49c5 9 5 18 0 27l-44 66L28 28Z" />
    <path d="M257 28h85l-86 156h-38c-11 0-18 4-24 14L118 340H28l88-156h39c10 0 17-5 23-15L257 28Z" />
    <path d="m256 184 86 156h-83c-10 0-18-5-23-14l-24-44c-5-9-5-18 0-27l44-71Z" />
  </svg>
);

export const ProductWordmark = () => (
  <span className="wordmark">
    <ProductLogo className="wordmark__logo" />
    <span>{PRODUCT_NAME}</span>
  </span>
);
