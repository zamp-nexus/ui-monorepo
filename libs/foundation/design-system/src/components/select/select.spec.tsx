import { describeComponent } from '../../test/describe-component';
import { Select, SelectModifiers, SelectVariants } from './index';

describeComponent(
  <Select>
    <div>Select content</div>
  </Select>,
  {
    name: 'Select',
    rootInstanceOf: window.HTMLDivElement,
    variants: SelectVariants,
    modifiers: SelectModifiers,
    shouldSupportPolymorphism: false,
    shouldSupportForwardRef: false,
  },
);
