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

export interface CreateMemberRequest {
  readonly displayName: string;
  readonly role: Role;
  readonly bio?: string;
  readonly skills?: readonly string[];
  readonly canHelpWith?: readonly string[];
  readonly wantsHelpWith?: readonly string[];
  readonly githubUrl?: string;
  readonly xUrl?: string;
  readonly facebookUrl?: string;
}
