import type { MemberId } from '@gs-v2/shared';
import type { Result } from '../result.js';
import type { Member, CreateMemberInput } from '../models/member.js';

export type MemberError =
  | { _tag: 'MemberNotFound'; memberId: string }
  | { _tag: 'MemberAlreadyExists'; memberId: string }
  | { _tag: 'MemberDbFailure'; operation: string };

export interface MemberRepository {
  findById(id: MemberId): Promise<Result<Member, MemberError>>;
  findByRole(role: string): Promise<Result<readonly Member[], MemberError>>;
  findBySkills(skills: readonly string[]): Promise<Result<readonly Member[], MemberError>>;
  create(id: MemberId, input: CreateMemberInput): Promise<Result<Member, MemberError>>;
}
