import { describe, expect, it } from 'vitest';
import {
  parseStartChatRequest,
  parseSendMessageRequest,
  parseCreateMemberRequest,
  MAX_MESSAGE_LENGTH,
} from './parse.js';

// X-006 / X-012 (MIH-003, MIH-005): 外部入力は境界でparseし、型アサーションで持ち込まない

describe('parseStartChatRequest / parseSendMessageRequest', () => {
  it('messageが正常な文字列ならそのまま受理する', () => {
    const result = parseStartChatRequest({ message: '相談があります' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.message).toBe('相談があります');
  });

  it('bodyがオブジェクトでなければ拒否する', () => {
    expect(parseStartChatRequest('文字列').ok).toBe(false);
    expect(parseStartChatRequest(null).ok).toBe(false);
    expect(parseStartChatRequest([]).ok).toBe(false);
  });

  it('messageが文字列以外なら拒否する', () => {
    expect(parseStartChatRequest({ message: 123 }).ok).toBe(false);
    expect(parseStartChatRequest({ message: { nested: true } }).ok).toBe(false);
    expect(parseStartChatRequest({}).ok).toBe(false);
  });

  it('空白のみのmessageは拒否する', () => {
    expect(parseSendMessageRequest({ message: '   ' }).ok).toBe(false);
  });

  // D-002 / D-008 / D-009 (TSU-006, ADV-011)
  it(`上限${MAX_MESSAGE_LENGTH}文字を超えるmessageは拒否する`, () => {
    const tooLong = 'x'.repeat(MAX_MESSAGE_LENGTH + 1);
    expect(parseSendMessageRequest({ message: tooLong }).ok).toBe(false);
  });

  it(`ちょうど上限${MAX_MESSAGE_LENGTH}文字のmessageは受理する`, () => {
    const atLimit = 'x'.repeat(MAX_MESSAGE_LENGTH);
    expect(parseSendMessageRequest({ message: atLimit }).ok).toBe(true);
  });
});

describe('parseCreateMemberRequest', () => {
  it('displayNameがあれば受理し、任意項目は未指定のままでよい', () => {
    const result = parseCreateMemberRequest({ displayName: '田中花子' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.displayName).toBe('田中花子');
  });

  it('displayNameが空または欠落なら拒否する', () => {
    expect(parseCreateMemberRequest({}).ok).toBe(false);
    expect(parseCreateMemberRequest({ displayName: '  ' }).ok).toBe(false);
  });

  // X-002 / X-017 (TSU-002): roleは契約に存在せず、クライアントが指定しても受け取らない
  it('roleを指定してもparse結果にroleは含まれない', () => {
    const result = parseCreateMemberRequest({ displayName: '攻撃者', role: 'admin' });
    expect(result.ok).toBe(true);
    if (result.ok) expect('role' in result.value).toBe(false);
  });

  it('skillsに文字列以外が混ざっていたら拒否する', () => {
    expect(parseCreateMemberRequest({ displayName: '田中', skills: ['ts', 42] }).ok).toBe(false);
  });

  it('bioが文字列以外なら拒否する', () => {
    expect(parseCreateMemberRequest({ displayName: '田中', bio: 123 }).ok).toBe(false);
  });
});
