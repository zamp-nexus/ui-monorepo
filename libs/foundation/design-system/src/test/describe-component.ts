/**
 * Component test harness
 * @module test/describe-component
 */

import React from 'react';
import { render } from '@testing-library/react';
import camelCase from 'lodash/camelCase';

import { slotOiid } from '../utils/oiid';
import { ThemeProvider } from '../theme';
import type { OIComponentModifiers, OIComponentVariants } from '../types';
import { randomString } from './random';
import { resetTestingComponentState, setTestingComponentState } from './test-state';

export interface DescribeComponentOptions {
  /** The modifiers component does support */
  modifiers?: OIComponentModifiers;
  /** The component name */
  name: string;
  /** The default HTMLElement the element is rendered by default */
  rootInstanceOf: unknown;
  /** The root slot supports aria attributes, default: true */
  rootSupportsAriaAttributes?: boolean;
  /** The variants component does support */
  variants?: OIComponentVariants;
  /**
   * If true, component should support polymorphism
   * @default true
   */
  shouldSupportPolymorphism?: boolean;
  /**
   * If true, component will be tested if it supports forwarding ref to the root element.
   * @default true
   */
  shouldSupportForwardRef?: boolean;
}

/**
 * Tests className property support
 */
function testSupportsClassName(element: React.ReactElement) {
  it('supports className property', () => {
    const oiid = randomString();
    const className = randomString('test-class-name');
    const { getByTestId } = render(React.cloneElement(element, { className, oiid }));
    expect(getByTestId(oiid)).toHaveClass(className);
  });
}

/**
 * Tests oiid property support
 */
function testSupportsOiid(element: React.ReactElement) {
  it('supports oiid property', () => {
    const oiid = randomString();
    const { getByTestId } = render(React.cloneElement(element, { oiid }));
    expect(getByTestId(oiid)).toHaveAttribute('data-oiid', oiid);
    expect(getByTestId(oiid)).toBeInTheDocument();
  });
}

/**
 * Tests ref forwarding support
 */
function testSupportsForwardRef(
  element: React.ReactElement,
  rootInstanceOf: DescribeComponentOptions['rootInstanceOf'],
) {
  it('supports forwarding ref to root element', () => {
    const ref = React.createRef();
    const oiid = randomString();
    const { getByTestId } = render(React.cloneElement(element, { oiid, ref }));
    expect(ref.current).toBeInstanceOf(rootInstanceOf);
    expect(getByTestId(oiid)).toEqual(ref.current);
  });
}

/**
 * Tests common HTML attributes support
 */
function testSupportsCommonHTMLAttributes(
  element: React.ReactElement,
  { rootSupportsAriaAttributes }: Pick<DescribeComponentOptions, 'rootSupportsAriaAttributes'>,
) {
  it('should support passing lang attribute to root element', () => {
    const oiid = randomString();
    const lang = 'en';
    const { getByTestId } = render(React.cloneElement(element, { oiid, lang }));
    expect(getByTestId(oiid)).toHaveAttribute('lang', lang);
  });

  if (rootSupportsAriaAttributes) {
    it('should support passing aria attribute to root element', () => {
      const oiid = randomString();
      const ariaAttrName = 'aria-labelledby';
      const ariaAttrValue = randomString('aria-labelledby');
      const { getByTestId } = render(
        React.cloneElement(element, { [ariaAttrName]: ariaAttrValue, oiid }),
      );
      expect(getByTestId(oiid)).toHaveAttribute(ariaAttrName, ariaAttrValue);
    });
  }

  it('should support passing data-* attributes to root element', () => {
    const oiid = randomString();
    const dataAttrName = randomString('data');
    const dataAttrValue = randomString();
    const { getByTestId } = render(
      React.cloneElement(element, { [dataAttrName]: dataAttrValue, oiid }),
    );
    expect(getByTestId(oiid)).toHaveAttribute(dataAttrName, dataAttrValue);
  });
}

/**
 * Tests polymorphism support
 */
function testSupportsComponentProp(element: React.ReactElement) {
  it('should render the root element with provided component', () => {
    const oiid = randomString();
    const { getByTestId } = render(React.cloneElement(element, { component: 'i', oiid }));
    expect(getByTestId(oiid).nodeName).toBe('I');
  });

  it('should render the root element with provided React component', () => {
    const oiid = randomString();
    const testContent = randomString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Component = React.forwardRef<HTMLDivElement, any>((props, ref) => (
      <div ref={ref} {...props}>
        {testContent}
      </div>
    ));
    Component.displayName = 'TestComponent';
    const { getByTestId } = render(React.cloneElement(element, { component: Component, oiid }));
    expect(getByTestId(oiid)).toHaveTextContent(testContent);
  });
}

/**
 * Tests modifiers support
 */
export function testModifiers(
  themeKey: string,
  element: React.ReactElement,
  modifiers: readonly string[],
  slot = 'root',
  { allowMultiple = false }: { allowMultiple?: boolean } = {},
) {
  describe('modifiers', () => {
    for (const modifier of modifiers) {
      const trueClassName = randomString('modifier-true');
      const falseClassName = randomString('modifier-false');
      const themeConfig = {
        components: {
          [themeKey]: {
            [slot]: {
              modifiers: {
                [modifier]: { true: trueClassName, false: falseClassName },
              },
            },
          },
        },
      };
      const oiid = randomString(modifier);

      it(`should support modifier: ${modifier}=true`, () => {
        const { getByTestId, getAllByTestId } = render(
          <ThemeProvider theme={themeConfig}>
            {React.cloneElement(element, { oiid, [modifier]: true })}
          </ThemeProvider>,
        );
        if (allowMultiple) {
          const renderedElements = getAllByTestId(
            slot === 'root' ? oiid : (slotOiid(oiid, slot) ?? ''),
          );
          for (const renderedElement of renderedElements) {
            expect(renderedElement).toHaveClass(trueClassName);
            expect(renderedElement).not.toHaveClass(falseClassName);
          }
        } else {
          const renderedElement = getByTestId(
            slot === 'root' ? oiid : (slotOiid(oiid, slot) ?? ''),
          );
          expect(renderedElement).toHaveClass(trueClassName);
          expect(renderedElement).not.toHaveClass(falseClassName);
        }
      });

      it(`should support modifier: ${modifier}=false`, () => {
        const { getByTestId, getAllByTestId } = render(
          <ThemeProvider theme={themeConfig}>
            {React.cloneElement(element, { oiid, [modifier]: false })}
          </ThemeProvider>,
        );
        if (allowMultiple) {
          const renderedElements = getAllByTestId(
            slot === 'root' ? oiid : (slotOiid(oiid, slot) ?? ''),
          );
          for (const renderedElement of renderedElements) {
            expect(renderedElement).toHaveClass(falseClassName);
            expect(renderedElement).not.toHaveClass(trueClassName);
          }
        } else {
          const renderedElement = getByTestId(
            slot === 'root' ? oiid : (slotOiid(oiid, slot) ?? ''),
          );
          expect(renderedElement).toHaveClass(falseClassName);
          expect(renderedElement).not.toHaveClass(trueClassName);
        }
      });
    }
  });
}

/**
 * Ensures variants structure is valid
 */
export function ensureVariantsStructure(variants: { [variant: string]: readonly string[] }) {
  if (variants == null && typeof variants !== 'object') {
    throw new Error('variants is not an object');
  }
  for (const [key, value] of Object.entries(variants)) {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw new Error(`variants.${key} is not an array of strings`);
    }
  }
}

/**
 * Tests variants support
 */
export function testVariants(
  themeKey: string,
  element: React.ReactElement,
  variants: NonNullable<DescribeComponentOptions['variants']>,
  slot = 'root',
  { allowMultiple = false }: { allowMultiple?: boolean } = {},
) {
  for (const [variant, values] of Object.entries(variants)) {
    describe(`variant: ${variant}`, () => {
      const valuesClassNames = values.reduce(
        (obj, value) => {
          obj[value] = randomString(`variant-cn-${variant}-${value}`);
          return obj;
        },
        {} as Record<string, string>,
      );
      const themeConfig = {
        components: {
          [themeKey]: {
            [slot]: {
              variants: { [variant]: valuesClassNames },
            },
          },
        },
      };

      for (const value of values) {
        const oiid = randomString(`test-variant-${variant}`);
        it(`should support value: ${value}`, () => {
          const { getByTestId, getAllByTestId } = render(
            <ThemeProvider theme={themeConfig}>
              {React.cloneElement(element, { oiid, [variant]: value })}
            </ThemeProvider>,
          );
          if (allowMultiple) {
            const renderedElements = getAllByTestId(
              slot === 'root' ? oiid : (slotOiid(oiid, slot) ?? ''),
            );
            for (const renderedElement of renderedElements) {
              for (const otherValue of values) {
                if (otherValue === value) {
                  expect(renderedElement).toHaveClass(valuesClassNames[otherValue]);
                } else {
                  expect(renderedElement).not.toHaveClass(valuesClassNames[otherValue]);
                }
              }
            }
          } else {
            const renderedElement = getByTestId(
              slot === 'root' ? oiid : (slotOiid(oiid, slot) ?? ''),
            );
            for (const otherValue of values) {
              if (otherValue === value) {
                expect(renderedElement).toHaveClass(valuesClassNames[otherValue]);
              } else {
                expect(renderedElement).not.toHaveClass(valuesClassNames[otherValue]);
              }
            }
          }
        });
      }
    });
  }
}

/**
 * Main test harness for OpenInsights Design System components
 *
 * @example
 * describeComponent(
 *   <Button>Click me</Button>,
 *   {
 *     name: 'Button',
 *     rootInstanceOf: window.HTMLButtonElement,
 *     variants: ButtonVariants,
 *     modifiers: ButtonModifiers,
 *   },
 *   () => {
 *     // Custom tests
 *   }
 * );
 */
export function describeComponent(
  minimumElement: React.ReactElement,
  {
    name,
    variants,
    modifiers,
    rootInstanceOf,
    rootSupportsAriaAttributes = true,
    shouldSupportPolymorphism = true,
    shouldSupportForwardRef = true,
  }: DescribeComponentOptions,
  customTests?: () => void,
): void {
  const componentThemeKey = camelCase(name);
  setTestingComponentState({ name, themeKey: componentThemeKey });

  if (!name) {
    throw new Error('You need to provide the "name"');
  }

  describe(`OI component: <${name} />`, () => {
    describe('common:', () => {
      testSupportsClassName(minimumElement);
      testSupportsOiid(minimumElement);
      if (shouldSupportForwardRef) {
        testSupportsForwardRef(minimumElement, rootInstanceOf);
      }
      testSupportsCommonHTMLAttributes(minimumElement, { rootSupportsAriaAttributes });
      if (shouldSupportPolymorphism) {
        testSupportsComponentProp(minimumElement);
      }
    });

    if (modifiers) {
      if (!Array.isArray(modifiers) || modifiers.some((v) => typeof v !== 'string')) {
        throw new Error('modifiers is not an array of strings');
      }
      testModifiers(componentThemeKey, minimumElement, modifiers);
    }

    if (variants) {
      ensureVariantsStructure(variants);
      testVariants(componentThemeKey, minimumElement, variants);
    }

    customTests?.();
    resetTestingComponentState();
  });
}

