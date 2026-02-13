import { describeComponent } from '../../test/describe-component';
import { Drawer, DrawerModifiers, DrawerVariants } from './index';

describeComponent(
  <Drawer open>
    <div>Drawer content</div>
  </Drawer>,
  {
    name: 'Drawer',
    rootInstanceOf: window.HTMLDivElement,
    variants: DrawerVariants,
    modifiers: DrawerModifiers,
    shouldSupportPolymorphism: false,
    shouldSupportForwardRef: false,
  },
);
