import { describeComponent } from '../../test/describe-component';
import { Menu, MenuModifiers, MenuVariants } from './index';

describeComponent(
  <Menu>
    <div>Menu content</div>
  </Menu>,
  {
    name: 'Menu',
    rootInstanceOf: window.HTMLDivElement,
    variants: MenuVariants,
    modifiers: MenuModifiers,
    shouldSupportPolymorphism: false,
    shouldSupportForwardRef: false,
  },
);
