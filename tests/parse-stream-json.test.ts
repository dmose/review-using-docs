import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseStreamJson } from '../providers/claude-cli.ts';

describe('parseStreamJson', () => {
  it('extracts final text from result event when present', () => {
    const stream = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'x' }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'partial' }] },
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'final answer',
      }),
    ].join('\n');
    const parsed = parseStreamJson(stream);
    assert.equal(parsed.text, 'final answer');
    assert.equal(parsed.resultEventSeen, true);
    assert.deepEqual(parsed.toolCalls, []);
  });

  it('falls back to concatenated assistant text when no result event', () => {
    const stream = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hello ' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'world' }] },
      }),
    ].join('\n');
    const parsed = parseStreamJson(stream);
    assert.equal(parsed.text, 'hello world');
    assert.equal(parsed.resultEventSeen, false);
  });

  it('collects tool_use blocks across multiple assistant messages', () => {
    const stream = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tu_1', name: 'mcp__moz__get_phabricator_revision', input: { revision_id: 'D291014' } },
          ],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Found revision.' },
            { type: 'tool_use', id: 'tu_2', name: 'Read', input: { file_path: '/tmp/x' } },
          ],
        },
      }),
      JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done' }),
    ].join('\n');
    const parsed = parseStreamJson(stream);
    assert.equal(parsed.toolCalls.length, 2);
    assert.equal(parsed.toolCalls[0]?.name, 'mcp__moz__get_phabricator_revision');
    assert.deepEqual(parsed.toolCalls[0]?.input, { revision_id: 'D291014' });
    assert.equal(parsed.toolCalls[1]?.name, 'Read');
  });

  it('skips non-JSON noise lines without throwing', () => {
    const stream = [
      'warning: deprecated flag X',
      '',
      JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok' }),
      'trailing garbage',
    ].join('\n');
    const parsed = parseStreamJson(stream);
    assert.equal(parsed.text, 'ok');
  });

  it('returns empty result for empty input', () => {
    const parsed = parseStreamJson('');
    assert.equal(parsed.text, '');
    assert.equal(parsed.resultEventSeen, false);
    assert.deepEqual(parsed.toolCalls, []);
  });
});
