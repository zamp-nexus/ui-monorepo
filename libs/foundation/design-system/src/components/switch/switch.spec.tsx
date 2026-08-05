import { render, screen } from '@testing-library/react';

import { describeComponent } from '../../test/describe-component';
import { Switch, SwitchModifiers, SwitchVariants } from './index';

describeComponent(<Switch />, {
  name: 'Switch',
  // Base UI's Switch.Root renders a span with role="switch", not a button.
  rootInstanceOf: window.HTMLSpanElement,
  variants: SwitchVariants,
  modifiers: SwitchModifiers,
  shouldSupportPolymorphism: false,
  shouldSupportForwardRef: true,
});

it('uses Base UI checked data attributes for the track and thumb states', () => {
  render(<Switch defaultChecked />);

  const track = screen.getByRole('switch');
  expect(track).toHaveClass('data-[checked]:bg-primary');
  expect(track.firstElementChild).toHaveClass('data-[checked]:translate-x-5');
});

it('keeps a disabled switch legible instead of fading it into its surface', () => {
  render(<Switch disabled />);

  expect(screen.getByRole('switch')).toHaveClass('border-border', 'opacity-100');
});
