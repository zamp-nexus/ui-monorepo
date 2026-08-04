/// <reference types="vitest/globals" />
import { parseComposerCommands } from './composer-commands';

describe('parseComposerCommands', () => {
  it('round-trips a plain message with no commands', () => {
    const parsed = parseComposerCommands('Why did EU refunds increase from June to July?');
    expect(parsed).toEqual({
      text: 'Why did EU refunds increase from June to July?',
      datasetHint: null,
      mentions: [],
      skillHint: null,
    });
  });

  it('extracts and strips a #dataset hint', () => {
    const parsed = parseComposerCommands('How is #commerce doing this month?');
    expect(parsed.datasetHint).toBe('commerce');
    expect(parsed.text).toBe('How is doing this month?');
  });

  it('extracts and strips one or more @user mentions', () => {
    const parsed = parseComposerCommands('@alice @bob take a look at this');
    expect(parsed.mentions).toEqual(['alice', 'bob']);
    expect(parsed.text).toBe('take a look at this');
  });

  it('extracts a /skill hint only at the very start of the message', () => {
    const leading = parseComposerCommands('/forecast next quarter revenue');
    expect(leading.skillHint).toBe('forecast');
    expect(leading.text).toBe('next quarter revenue');

    const midSentence = parseComposerCommands('the file is at /forecast/latest.csv');
    expect(midSentence.skillHint).toBeNull();
    expect(midSentence.text).toBe('the file is at /forecast/latest.csv');
  });

  it('extracts all three commands together, leaving clean text', () => {
    const parsed = parseComposerCommands('/forecast #commerce @alice what is next quarter?');
    expect(parsed).toEqual({
      text: 'what is next quarter?',
      datasetHint: 'commerce',
      mentions: ['alice'],
      skillHint: 'forecast',
    });
  });

  it('only ever takes the first #dataset hint when more than one is present', () => {
    const parsed = parseComposerCommands('compare #commerce and #finance');
    expect(parsed.datasetHint).toBe('commerce');
    expect(parsed.text).toBe('compare and');
  });
});
