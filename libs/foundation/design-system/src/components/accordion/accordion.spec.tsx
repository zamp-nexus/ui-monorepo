import { describeComponent } from '../../test/describe-component';
import { fireEvent, render, screen } from '@testing-library/react';
import { Accordion, AccordionModifiers, AccordionVariants } from './index';

describeComponent(
  <Accordion>
    <div>Accordion content</div>
  </Accordion>,
  {
    name: 'Accordion',
    rootInstanceOf: window.HTMLDivElement,
    variants: AccordionVariants,
    modifiers: AccordionModifiers,
    shouldSupportPolymorphism: false,
    shouldSupportForwardRef: true,
  },
);

it('forwards a trigger click handler', () => {
  const onClick = vi.fn();
  render(
    <Accordion>
      <Accordion.Item value="project">
        <Accordion.Trigger onClick={onClick}>Project</Accordion.Trigger>
      </Accordion.Item>
    </Accordion>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Project' }));
  expect(onClick).toHaveBeenCalledOnce();
});
