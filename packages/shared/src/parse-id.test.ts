import { describe, expect, it } from 'vitest';
import { parseChatId, parseMemberId } from './index.js';

// X-012 (MIH-003): URLパラメータのIDは境界でparseし、as castで持ち込まない

describe('parseChatId / parseMemberId', () => {
  it('UUID形式のIDは受理する', () => {
    const result = parseChatId('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result.ok).toBe(true);
  });

  it('better-auth形式の英数字IDは受理する', () => {
    expect(parseMemberId('Xy9AbC123_-z').ok).toBe(true);
  });

  it('空文字は拒否する', () => {
    const result = parseChatId('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty');
  });

  it('128文字を超えるIDは拒否する', () => {
    const result = parseChatId('a'.repeat(129));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too_long');
  });

  it('パストラバーサルやSQL断片を含むIDは拒否する', () => {
    expect(parseChatId('../etc/passwd').ok).toBe(false);
    expect(parseChatId("1' OR '1'='1").ok).toBe(false);
    expect(parseChatId('id with space').ok).toBe(false);
  });
});
