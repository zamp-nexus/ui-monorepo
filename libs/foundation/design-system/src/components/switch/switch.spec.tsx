import { describeComponent } from '../../test/describe-component';
import { Switch, SwitchModifiers, SwitchVariants } from './index';

describeComponent(<Switch />, {
  name: 'Switch',
  rootInstanceOf: window.HTMLButtonElement,
  variants: SwitchVariants,
  modifiers: SwitchModifiers,
  shouldSupportPolymorphism: false,
  shouldSupportForwardRef: true,
});
