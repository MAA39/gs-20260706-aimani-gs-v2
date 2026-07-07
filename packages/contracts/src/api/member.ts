import type { Role } from '@gs-v2/shared';

export interface MemberDto {
  readonly id: string;
  readonly displayName: string;
  readonly role: Role;
  readonly bio: string;
  readonly skills: readonly string[];
  readonly canHelpWith: readonly string[];
  readonly wantsHelpWith: readonly string[];
  readonly githubUrl: string | null;
  readonly xUrl: string | null;
  readonly facebookUrl: string | null;
}

// roleは意図的に受け取らない: 自己作成メンバーはサーバー側でstudent固定（TSU-002/SpecGap裁定）
export interface CreateMemberRequest {
  readonly displayName: string;
  readonly bio?: string;
  readonly skills?: readonly string[];
  readonly canHelpWith?: readonly string[];
  readonly wantsHelpWith?: readonly string[];
  readonly githubUrl?: string;
  readonly xUrl?: string;
  readonly facebookUrl?: string;
}
