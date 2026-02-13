import { describeComponent } from '../../test/describe-component';
import { Popover, PopoverModifiers, PopoverVariants } from './index';

describeComponent(
  <Popover>
    <div>Popover content</div>
  </Popover>,
  {
    name: 'Popover',
    rootInstanceOf: window.HTMLDivElement,
    variants: PopoverVariants,
    modifiers: PopoverModifiers,
    shouldSupportPolymorphism: false,
    shouldSupportForwardRef: false,
  },
);
