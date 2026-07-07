import type { MemberId, Role } from '@gs-v2/shared';

export interface Member {
  readonly id: MemberId;
  readonly displayName: string;
  readonly role: Role;
  readonly bio: string;
  readonly skills: readonly string[];
  readonly canHelpWith: readonly string[];
  readonly wantsHelpWith: readonly string[];
  readonly githubUrl: string | null;
  readonly xUrl: string | null;
  readonly facebookUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateMemberInput {
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
