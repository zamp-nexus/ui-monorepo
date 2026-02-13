import { describeComponent } from '../../test/describe-component';
import { Modal, ModalModifiers, ModalVariants } from './index';

describeComponent(
  <Modal open>
    <div>Modal content</div>
  </Modal>,
  {
    name: 'Modal',
    rootInstanceOf: window.HTMLDivElement,
    variants: ModalVariants,
    modifiers: ModalModifiers,
    shouldSupportPolymorphism: false,
    shouldSupportForwardRef: false,
  },
);
