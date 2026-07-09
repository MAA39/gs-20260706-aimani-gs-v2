# D1 + Drizzle + Port&Adapter 実装パターン

調査日: 2026-07-07
調査方法: 手動調査 + amidala-refactoring 実装知見 + Linear ADR-V2-006
出典: amidala-refactoring HANDOFF.md / ADR-V2-006 (slug: a51a0c811b47)

---

## 設計方針

D1（SQLite）でスタートし、DI（Port & Adapter）で将来のPostgres移行パスを確保する。

```
packages/domain/   → Port interface（DB非依存）
packages/db/       → D1Adapter implements Port（今）
                   → PgAdapter implements Port（将来）
```

DI切替ポイントはアプリ起動時の1箇所のみ。

## Port & Adapter パターン（ADR-V2-006準拠）

### Result型

```ts
type Result<T, E extends { _tag: string }> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

### Port interface（packages/domain）

```ts
// packages/domain/src/ports/chat-repository.ts
import type { ChatId, UserId } from '@gs-v2/shared';
import type { Result } from '../result';

export type ChatNotFoundError = { _tag: 'ChatNotFoundError'; chatId: ChatId };
export type ChatCreateError = { _tag: 'ChatCreateError'; reason: string };

export interface ChatRepository {
  findById(chatId: ChatId): Promise<Result<Chat, ChatNotFoundError>>;
  create(userId: UserId): Promise<Result<Chat, ChatCreateError>>;
  appendMessage(chatId: ChatId, message: NewMessage): Promise<Result<Message, ChatNotFoundError>>;
}
```

### DI引数注入

```ts
// packages/domain/src/use-cases/start-chat.ts
type Deps = {
  chatRepo: ChatRepository;
  clock: { now(): Date };
  idGen: { chatId(): ChatId };
};

export async function startChat(
  userId: UserId,
  deps: Deps,
): Promise<Result<Chat, ChatCreateError>> {
  const chatId = deps.idGen.chatId();
  return deps.chatRepo.create(userId);
}
```

### D1 Adapter（packages/db）

```ts
// packages/db/src/d1/chat-repository-d1.ts
import { drizzle } from 'drizzle-orm/d1';
import type { ChatRepository } from '@gs-v2/domain';
import * as schema from '../schema';

export function createChatRepositoryD1(db: D1Database): ChatRepository {
  const d = drizzle(db, { schema });

  return {
    async findById(chatId) {
      const row = await d.query.chats.findFirst({
        where: eq(schema.chats.id, chatId),
      });
      if (!row) return { ok: false, error: { _tag: 'ChatNotFoundError', chatId } };
      return { ok: true, value: mapToChat(row) };
    },
    async create(userId) {
      // ...
    },
    async appendMessage(chatId, message) {
      // ...
    },
  };
}
```

## D1の制約とPostgres移行時の地雷

| 項目 | D1 (SQLite) | Postgres | 対策 |
|---|---|---|---|
| BOOLEAN | 0/1 (INTEGER) | native boolean | スキーマ定義でinteger使用、アプリ層で変換 |
| DATETIME | TEXT (ISO 8601) | timestamptz | 文字列統一（amidala知見: Date変換を切る） |
| AUTO INCREMENT | AUTOINCREMENT | SERIAL / IDENTITY | UUIDを主キーにして回避 |
| JSON | text + JSON functions | JSONB | text保存、アプリ層でparse |
| トランザクション | batch() のみ（暗黙的） | BEGIN/COMMIT | Port層でbatch相当の抽象 |
| FTS | なし | pg_textsearch | 初期はLIKE検索、Postgres移行時にFTS |
| RLS | なし | Row Level Security | アプリ層MWでガード（Hono） |
| Extensions | なし | pgvector等 | Postgres移行後に追加 |

## D1スキーマ設計原則

1. **UUIDを主キー** — AUTOINCREMENT/SERIAL問題を根本回避
2. **created_at/updated_at はTEXT (ISO 8601)** — SQLite/Postgres共通
3. **BOOLEANはinteger** — D1では0/1、Postgres移行時にboolean化
4. **CHECK制約は使える** — D1(SQLite)でもCHECK制約はサポート
5. **NULLを避ける** — そーだいさん正規化4原則に従う
6. **INDEX 4つ以上 = 正規化不足を疑う**

## Drizzle注意点（amidala-refactoring知見）

1. **Drizzleはdialect切替不可** — `drizzle-orm/d1` と `drizzle-orm/postgres-js` は別物。adapter層内に閉じ込める
2. **エラーラッピング** — Drizzleは `DrizzleQueryError.cause` にDB駆動エラーをラップ。制約違反判定はcauseチェーン走査
3. **timestamptz文字列統一** — postgres.jsのtypes / PGLiteのparsersでDate変換を切る
4. **Workers per-request** — `client.end()` を `finally` / `waitUntil` で確実に実行
5. **型はスキーマから推論** — `typeof schema.chats.$inferSelect` でDB行型を導出

## DB 2層構造

- **D1** = ビジネスデータ（users / roles / question_cards / card_replies 等）→ Port&Adapter → 将来Postgres
- **DO SQLite** = Flue会話履歴（Flueが自動管理、アプリコードは触らない）

この2層は完全に独立。D1のPort&Adapterは壁打ち以外のビジネスデータ用。
Flueの会話履歴はDurable Object内のSQLiteに自動永続化される。
