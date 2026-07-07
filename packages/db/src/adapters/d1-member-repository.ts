import type { MemberId } from '@gs-v2/shared';
import type { Member, CreateMemberInput } from '@gs-v2/domain';
import type { MemberRepository, MemberError } from '@gs-v2/domain';
import type { Result } from '@gs-v2/domain';
import { ok, err } from '@gs-v2/domain';

interface D1Row {
  id: string;
  display_name: string;
  role: string;
  bio: string;
  skills_json: string;
  can_help_with_json: string;
  wants_help_with_json: string;
  github_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  created_at: string;
  updated_at: string;
}

function rowToMember(row: D1Row): Member {
  return {
    id: row.id as MemberId,
    displayName: row.display_name,
    role: row.role as Member['role'],
    bio: row.bio,
    skills: JSON.parse(row.skills_json),
    canHelpWith: JSON.parse(row.can_help_with_json),
    wantsHelpWith: JSON.parse(row.wants_help_with_json),
    githubUrl: row.github_url,
    xUrl: row.x_url,
    facebookUrl: row.facebook_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class D1MemberRepository implements MemberRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: MemberId): Promise<Result<Member, MemberError>> {
    const row = await this.db
      .prepare('SELECT * FROM members WHERE id = ?')
      .bind(id)
      .first<D1Row>();
    if (!row) return err({ _tag: 'MemberNotFound', memberId: id });
    return ok(rowToMember(row));
  }

  async findByRole(role: string): Promise<Result<readonly Member[], MemberError>> {
    const { results } = await this.db
      .prepare('SELECT * FROM members WHERE role = ? ORDER BY display_name')
      .bind(role)
      .all<D1Row>();
    return ok(results.map(rowToMember));
  }

  async findBySkills(skills: readonly string[]): Promise<Result<readonly Member[], MemberError>> {
    if (skills.length === 0) return ok([]);
    const placeholders = skills.map(() => '?').join(',');
    const query = `
      SELECT DISTINCT m.* FROM members m
      WHERE EXISTS (
        SELECT 1 FROM json_each(m.skills_json)
        WHERE json_each.value IN (${placeholders})
      )
      ORDER BY m.display_name
    `;
    const { results } = await this.db
      .prepare(query)
      .bind(...skills)
      .all<D1Row>();
    return ok(results.map(rowToMember));
  }

  async create(id: MemberId, input: CreateMemberInput): Promise<Result<Member, MemberError>> {
    const now = new Date().toISOString();
    await this.db
      .prepare(`
        INSERT INTO members (id, display_name, role, bio, skills_json, can_help_with_json, wants_help_with_json, github_url, x_url, facebook_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        input.displayName,
        input.role,
        input.bio ?? '',
        JSON.stringify(input.skills ?? []),
        JSON.stringify(input.canHelpWith ?? []),
        JSON.stringify(input.wantsHelpWith ?? []),
        input.githubUrl ?? null,
        input.xUrl ?? null,
        input.facebookUrl ?? null,
        now,
        now,
      )
      .run();

    return this.findById(id);
  }
}
