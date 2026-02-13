/**
 * Focusable behavior tests
 * @module test/describe-focusable
 */

import React from 'react';
import { render } from '@testing-library/react';
import { act } from 'react';

import { randomString } from './random';

interface DescribeFocusableOptions {
  /**
   * Whether the component should support polymorphism
   * @default true
   */
  shouldSupportPolymorphism?: boolean;
  /**
   * Whether the component should be focusable when disabled
   * @default false
   */
  shouldBeFocusableWhenDisabled?: boolean;
}

function testFocusable(element: React.ReactElement) {
  it('is focusable', () => {
    const oiid = randomString();
    const { getByTestId } = render(React.cloneElement(element, { oiid }));
    const component = getByTestId(oiid);
    act(() => {
      component.focus();
    });
    expect(document.activeElement).toBe(component);
  });
}

function testFocusableWhenDisabled(
  element: React.ReactElement,
  shouldBeFocusableWhenDisabled: boolean,
) {
  it(
    shouldBeFocusableWhenDisabled ? 'is focusable when disabled' : 'is not focusable when disabled',
    () => {
      const oiid = randomString();
      const { getByTestId } = render(React.cloneElement(element, { disabled: true, oiid }));
      const component = getByTestId(oiid);
      act(() => {
        component.focus();
      });
      if (shouldBeFocusableWhenDisabled) {
        expect(document.activeElement).toBe(component);
      } else {
        expect(document.activeElement).not.toBe(component);
      }
    },
  );
}

function testIsFocusableWithCustomComponent(element: React.ReactElement) {
  it('is focusable with custom component', () => {
    const oiid = randomString();
    const { getByTestId } = render(React.cloneElement(element, { component: 'span', oiid }));
    const component = getByTestId(oiid);
    act(() => {
      component.focus();
    });
    expect(document.activeElement).toBe(component);
  });
}

/**
 * Tests the focusable behavior of a component
 *
 * @example
 * describeComponent(
 *   <Button>Click</Button>,
 *   { ... },
 *   () => {
 *     describeFocusable(<Button>Test</Button>, {
 *       shouldSupportPolymorphism: true,
 *       shouldBeFocusableWhenDisabled: false,
 *     });
 *   }
 * );
 */
export function describeFocusable(
  minimumElement: React.ReactElement,
  {
    shouldBeFocusableWhenDisabled = false,
    shouldSupportPolymorphism = true,
  }: DescribeFocusableOptions = {},
  fn?: () => void,
) {
  describe('behavior:focusable', () => {
    testFocusable(minimumElement);
    testFocusableWhenDisabled(minimumElement, shouldBeFocusableWhenDisabled);
    if (shouldSupportPolymorphism) {
      testIsFocusableWithCustomComponent(minimumElement);
    }
    fn?.();
  });
}

