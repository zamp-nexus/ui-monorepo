import { describeComponent } from '../../test/describe-component';
import { Checkbox, CheckboxModifiers, CheckboxVariants } from './index';

describeComponent(
  <Checkbox />,
  {
    name: 'Checkbox',
    rootInstanceOf: window.HTMLButtonElement,
    variants: CheckboxVariants,
    modifiers: CheckboxModifiers,
    shouldSupportPolymorphism: false,
    shouldSupportForwardRef: true,
  },
);
