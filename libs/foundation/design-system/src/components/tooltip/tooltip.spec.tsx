import { describeComponent } from '../../test/describe-component';
import { Tooltip, TooltipModifiers, TooltipVariants } from './index';

describeComponent(
  <Tooltip content="Tooltip text">
    <button>Hover me</button>
  </Tooltip>,
  {
    name: 'Tooltip',
    rootInstanceOf: window.HTMLDivElement,
    variants: TooltipVariants,
    modifiers: TooltipModifiers,
    shouldSupportPolymorphism: false,
    shouldSupportForwardRef: false,
  },
);
