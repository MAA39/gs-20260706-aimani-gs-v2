# bs-job-board CI/CD・アーキテクチャガード調査

調査対象: `https://github.com/MAA39/gs-20260620-bs-job-board` の `main` ブランチ。

## 1. .github/workflows/

確認できた workflow YAML は `.github/workflows/ci.yml`。GitHub App のファイル取得で `.github/workflows` はディレクトリとして存在確認でき、`.github/workflows/ci.yml` は取得成功した。`.github/workflows/deploy.yml`、`.github/workflows/cd.yml`、`.github/workflows/ci.yaml`、`.github/workflows/test.yml`、`.github/workflows/build.yml` は 404 で見つからなかった。CD 用の GitHub Actions workflow は確認できない。

`.github/workflows/ci.yml` の全文:

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
        with:
          persist-credentials: false
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        with:
          node-version: 22.19.0
      - run: corepack enable
      - run: corepack prepare pnpm@9.15.0 --activate
      - run: pnpm install --frozen-lockfile
      - name: Typecheck
        run: |
          set +e
          pnpm exec turbo typecheck --output-logs=errors-only > typecheck.log 2>&1
          status=$?
          cat typecheck.log
          exit "$status"
      - name: Upload typecheck failure log
        if: failure()
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
        with:
          name: typecheck-log
          path: typecheck.log
      - run: pnpm exec turbo build --output-logs=errors-only
      - name: Test
        run: pnpm exec turbo test --output-logs=errors-only
      - name: Integration test
        run: pnpm exec turbo test:integration --output-logs=errors-only
      - run: node --check scripts/probe-flue-stream.mjs
      - name: AI route guards
        run: |
          grep_args=(--include='*.ts' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.flue-vite --exclude-dir=.wrangler)
          source_paths=(apps/api apps/agent/src/workflows)
          test -z "$(grep -RE "${grep_args[@]}" '(^|[^[:alnum:]_.])fetch[[:space:]]*\(' "${source_paths[@]}" || true)"
          test -z "$(grep -R "${grep_args[@]}" 'chat/completions' "${source_paths[@]}" || true)"
          test -z "$(grep -R "${grep_args[@]}" 'reasoning_content' "${source_paths[@]}" || true)"
      - name: Agent D1 isolation guard
        run: |
          test -z "$(grep -RE 'env\.DB|D1Database' apps/agent/src/workflows || true)"
          test -z "$(grep -R '"d1_databases"' apps/agent/wrangler.jsonc apps/agent/.flue-vite.wrangler.jsonc || true)"
          grep -Eq '"workers_dev"[[:space:]]*:[[:space:]]*false' apps/agent/wrangler.jsonc
      - name: Public route authority guard
        run: |
          # Public thread routes must not use legacy addPost (ADR-004: AI posts via callback only)
          test -z "$(grep -R 'addPost' apps/api/src/routes/threads.ts || true)"
      - name: Web legacy guard
        run: |
          # Removed in #24: ai-stream and reasoning_content must not re-appear
          test -z "$(grep -R 'ai-stream' apps/web/src/ || true)"
          test -z "$(grep -R 'reasoning_content' apps/web/src/ || true)"
      - name: Terminal display guard
        run: |
          # PR A hotfix: setAiRunId(null) on terminal causes idle overwrite
          test -z "$(grep -E 'setAiRunId\(null\)' apps/web/src/routes/threads.\$id.tsx || true)"
```

workflow の trigger:

```yaml
on:
  pull_request:
  push:
    branches: [main]
```

job は `verify` 1 件のみ。`runs-on: ubuntu-latest`、`timeout-minutes: 20`。この job は checkout、Node/pnpm セットアップ、依存インストール、typecheck、build、unit test、integration test、Flue probe 構文チェック、AI 経路・D1 隔離・公開ルート・Web legacy・terminal 表示の grep guard を順に実行する。

step 一覧:

1. `actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5`。`persist-credentials: false`
2. `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020`。`node-version: 22.19.0`
3. `corepack enable`
4. `corepack prepare pnpm@9.15.0 --activate`
5. `pnpm install --frozen-lockfile`
6. `Typecheck`: `pnpm exec turbo typecheck --output-logs=errors-only` を `typecheck.log` に保存し、ログを標準出力して同じ exit status で終了
7. `Upload typecheck failure log`: failure 時に `typecheck-log` artifact として `typecheck.log` を upload
8. `pnpm exec turbo build --output-logs=errors-only`
9. `Test`: `pnpm exec turbo test --output-logs=errors-only`
10. `Integration test`: `pnpm exec turbo test:integration --output-logs=errors-only`
11. `node --check scripts/probe-flue-stream.mjs`
12. `AI route guards`
13. `Agent D1 isolation guard`
14. `Public route authority guard`
15. `Web legacy guard`
16. `Terminal display guard`

## 2. Architecture guard grep commands

grep ベースの architecture guard は `.github/workflows/ci.yml` 内にある。repository-wide 検索で `addPost reasoning_content ai-stream setAiRunId D1Database workers_dev` にヒットする guard 定義は `.github/workflows/ci.yml` のみ。`throw new Error` / `throw禁止` の grep guard は見つからなかった。Service Binding を直接検査する grep guard も見つからなかったが、`fetch(` 禁止 guard が `apps/api` と `apps/agent/src/workflows` の直接 HTTP 経路を抑止している。

`AI route guards` の exact shell commands:

```bash
grep_args=(--include='*.ts' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.flue-vite --exclude-dir=.wrangler)
source_paths=(apps/api apps/agent/src/workflows)
test -z "$(grep -RE "${grep_args[@]}" '(^|[^[:alnum:]_.])fetch[[:space:]]*\(' "${source_paths[@]}" || true)"
test -z "$(grep -R "${grep_args[@]}" 'chat/completions' "${source_paths[@]}" || true)"
test -z "$(grep -R "${grep_args[@]}" 'reasoning_content' "${source_paths[@]}" || true)"
```

検査対象:

- `apps/api`
- `apps/agent/src/workflows`

禁止しているもの:

- `fetch(`
- `chat/completions`
- `reasoning_content`

`Agent D1 isolation guard` の exact shell commands:

```bash
test -z "$(grep -RE 'env\.DB|D1Database' apps/agent/src/workflows || true)"
test -z "$(grep -R '"d1_databases"' apps/agent/wrangler.jsonc apps/agent/.flue-vite.wrangler.jsonc || true)"
grep -Eq '"workers_dev"[[:space:]]*:[[:space:]]*false' apps/agent/wrangler.jsonc
```

検査対象:

- `apps/agent/src/workflows`
- `apps/agent/wrangler.jsonc`
- `apps/agent/.flue-vite.wrangler.jsonc`

禁止または強制しているもの:

- Agent workflow 内の `env.DB`
- Agent workflow 内の `D1Database`
- Agent wrangler 設定内の `"d1_databases"`
- `apps/agent/wrangler.jsonc` の `"workers_dev": false`

`Public route authority guard` の exact shell command:

```bash
test -z "$(grep -R 'addPost' apps/api/src/routes/threads.ts || true)"
```

検査対象:

- `apps/api/src/routes/threads.ts`

禁止しているもの:

- public thread route での legacy `addPost`

`Web legacy guard` の exact shell commands:

```bash
test -z "$(grep -R 'ai-stream' apps/web/src/ || true)"
test -z "$(grep -R 'reasoning_content' apps/web/src/ || true)"
```

検査対象:

- `apps/web/src/`

禁止しているもの:

- `ai-stream`
- `reasoning_content`

`Terminal display guard` の exact shell command:

```bash
test -z "$(grep -E 'setAiRunId\(null\)' apps/web/src/routes/threads.\$id.tsx || true)"
```

検査対象:

- `apps/web/src/routes/threads.$id.tsx`

禁止しているもの:

- `setAiRunId(null)`

見つからなかった grep guard:

- `throw new Error` / `throw禁止`
- Service Binding 設定そのものの存在確認
- D1 migration 番号衝突確認

## 3. Test configuration

ルート `vitest.config.ts` は 404 で見つからなかった。Vitest 設定は `apps/api`、`apps/web`、`packages/db` に存在する。integration 専用設定は `apps/api/vitest.integration.config.ts` と `packages/db/vitest.integration.config.ts` に存在する。`apps/agent/vitest.config.ts`、`apps/agent/vitest.integration.config.ts`、`apps/web/vitest.integration.config.ts`、`packages/contracts/vitest.config.ts`、`packages/config/vitest.config.ts`、`packages/agent/vitest.config.ts` は見つからなかった。

`apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.unit.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
  },
});
```

`apps/api/vitest.integration.config.ts`:

```ts
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('migrations');

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            INTERNAL_CALLBACK_KEY: 'test-callback-key-for-integration',
            BETTER_AUTH_SECRET: 'test-secret',
          },
          workers: [
            {
              name: 'bs-job-board-agent',
              modules: true,
              script:
                "export default { fetch: () => new Response(null, { status: 501 }) };",
            },
          ],
        },
        wrangler: {
          configPath: './wrangler.jsonc',
        },
      }),
    ],
    test: {
      include: ['src/**/*.integration.test.ts'],
      name: 'api-integration',
      setupFiles: ['src/apply-d1-migrations.integration.ts'],
    },
  };
});
```

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // TanStack Start / Cloudflare プラグインは読み込まない
  plugins: [],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

`packages/db/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
  },
});
```

`packages/db/vitest.integration.config.ts`:

```ts
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('migrations');

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
          },
          workers: [
            {
              name: 'bs-job-board-agent',
              modules: true,
              script:
                "export default { fetch: () => new Response(null, { status: 501 }) };",
            },
          ],
        },
        wrangler: {
          configPath: '../../apps/api/wrangler.jsonc',
        },
      }),
    ],
    test: {
      include: ['src/**/*.integration.test.ts'],
      name: 'db-integration',
      setupFiles: ['src/apply-d1-migrations.integration.ts'],
    },
  };
});
```

unit / integration の分離:

- `apps/api` の unit 側: `include: ['src/**/*.test.ts', 'src/**/*.unit.test.ts']`、`exclude: ['src/**/*.integration.test.ts']`
- `apps/api` の integration 側: `include: ['src/**/*.integration.test.ts']`
- `packages/db` の unit 側: `include: ['src/**/*.test.ts']`、`exclude: ['src/**/*.integration.test.ts']`
- `packages/db` の integration 側: `include: ['src/**/*.integration.test.ts']`
- `apps/web` は `jsdom` で `include: ['src/**/*.test.ts', 'src/**/*.test.tsx']`

検索で確認できた実在テストファイル:

- `apps/api/src/__tests__/ai-run-events.unit.test.ts`
- `apps/api/src/__tests__/threads.integration.test.ts`
- `apps/api/src/__tests__/api-boundary.integration.test.ts`
- `apps/api/src/__tests__/ai-run-events.integration.test.ts`
- `apps/api/src/__tests__/internal-callbacks.integration.test.ts`
- `apps/web/src/lib/__tests__/api-proxy.test.ts`
- `apps/web/src/lib/__tests__/use-ai-run-progress.test.ts`
- `packages/db/src/ai-pipeline.integration.test.ts`

test scripts 側の分離:

```json
"test": "vitest run --config vitest.config.ts --passWithNoTests",
"test:integration": "vitest run --config vitest.integration.config.ts"
```

上記は `apps/api/package.json` と `packages/db/package.json` に存在する。`apps/web/package.json` は integration script を持たず、`"test": "vitest run --passWithNoTests"` のみ。

## 4. turbo.json

`turbo.json` の全文:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".output/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:integration": {
      "dependsOn": ["^build"]
    }
  }
}
```

task dependency graph:

- `build`
  - `dependsOn: ["^build"]`
  - 依存 workspace の `build` を先に実行する
  - outputs は `dist/**` と `.output/**`
- `dev`
  - `cache: false`
  - `persistent: true`
  - dependency は定義なし
- `typecheck`
  - `dependsOn: ["^build"]`
  - 依存 workspace の `build` 後に typecheck
- `test`
  - `dependsOn: ["^build"]`
  - 依存 workspace の `build` 後に unit test
- `test:integration`
  - `dependsOn: ["^build"]`
  - 依存 workspace の `build` 後に integration test

`pipeline` キーは存在しない。Turborepo v2 形式の `tasks` キーで定義されている。

CI から呼ばれている turbo command:

```bash
pnpm exec turbo typecheck --output-logs=errors-only
pnpm exec turbo build --output-logs=errors-only
pnpm exec turbo test --output-logs=errors-only
pnpm exec turbo test:integration --output-logs=errors-only
```

## 5. package.json scripts

workspace 定義:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

確認した app/package:

- `apps/agent`
- `apps/api`
- `apps/web`
- `packages/agent`
- `packages/config`
- `packages/contracts`
- `packages/db`

root `package.json` の scripts:

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "typecheck": "turbo typecheck",
    "probe:flue-stream": "node scripts/probe-flue-stream.mjs"
  }
}
```

root `package.json` の全文:

```json
{
  "name": "bs-job-board",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "typecheck": "turbo typecheck",
    "probe:flue-stream": "node scripts/probe-flue-stream.mjs"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.8.0"
  }
}
```

`apps/api/package.json` の scripts:

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts --passWithNoTests",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  }
}
```

`apps/web/package.json` の scripts:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  }
}
```

`apps/agent/package.json` の scripts:

```json
{
  "scripts": {
    "dev": "flue dev",
    "build": "flue build --target cloudflare",
    "typecheck": "tsc --noEmit",
    "deploy": "flue deploy"
  }
}
```

`packages/db/package.json` の scripts:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts --passWithNoTests",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  }
}
```

`packages/contracts/package.json` の scripts:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/config/package.json` は scripts キーなし。全文:

```json
{
  "name": "@bs-job-board/config",
  "private": true,
  "version": "0.0.0"
}
```

`packages/agent/package.json` は scripts キーなし。全文:

```json
{
  "name": "@bs-job-board/agent",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@bs-job-board/contracts": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}
```

## 6. V2 repoへの具体的アクション提案

V2 repo `aimani-gs-v2` では現時点で `.github/workflows/*.yml` / `.github/workflows/*.yaml` は見つからなかった。root scripts は `build`、`dev`、`typecheck`、`test` のみで、`turbo.json` に `test:integration` task はない。AGENTS.md には `throwしない`、`packages/domain はI/O禁止`、`D1マイグレーションはpackages/db/migrations/`、`wrangler.jsoncのmigrations_dirは必ず設定する` が明記されている。

1. `.github/workflows/ci.yml` を追加する。
   - 内容: bs-job-board と同じ構造で `pull_request` と `push branches: [main]` を trigger にし、`permissions: contents: read`、`concurrency.cancel-in-progress: true`、`checkout`、`setup-node`、`corepack prepare pnpm@11.2.2 --activate`、`pnpm install --frozen-lockfile`、`pnpm exec turbo typecheck --output-logs=errors-only`、`pnpm exec turbo build --output-logs=errors-only`、`pnpm exec turbo test --output-logs=errors-only` を実行する。
   - 根拠: bs-job-board は pinned action、pnpm frozen lockfile、turbo typecheck/build/test を CI の主軸にしている。V2 root `package.json` の `packageManager` は `pnpm@11.2.2` なので、pnpm version は V2 に合わせる。

2. architecture guard を root script として切り出す。
   - 追加案: `scripts/architecture-guards.sh` と root `package.json` の `"guard:architecture": "bash scripts/architecture-guards.sh"`。
   - CI step: `pnpm guard:architecture`
   - 根拠: bs-job-board は workflow inline の grep guard で境界を守っている。V2 では AGENTS.md のルールが増えているため、workflow 直書きより script 化した方がローカル実行と CI 実行を同一にできる。

3. `throw` 禁止 guard を追加する。
   - 追加する command 案:
     ```bash
     test -z "$(grep -RE --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.wrangler '(^|[^[:alnum:]_.])throw[[:space:]]+' apps packages || true)"
     test -z "$(grep -RE --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.wrangler 'throw[[:space:]]+new[[:space:]]+Error' apps packages || true)"
     ```
   - 根拠: bs-job-board には `throw new Error` guard は存在しないが、V2 の L0 ルールは「throwしない」。これは CI で失敗させるべきルール。

4. `packages/domain` の I/O 禁止 guard を追加する。
   - 追加する command 案:
     ```bash
     test -z "$(grep -RE --include='*.ts' --include='*.tsx' '(^|[^[:alnum:]_.])fetch[[:space:]]*\(|D1Database|env\.|wrangler|KVNamespace|R2Bucket|Queue<|DurableObject' packages/domain || true)"
     ```
   - 根拠: V2 の AGENTS.md は `packages/domain はI/O禁止（純粋TS）` としている。bs-job-board の `Agent D1 isolation guard` と同じ発想で、責務境界を grep で固定する。

5. D1 所有境界と migration 配置 guard を追加する。
   - 追加する command 案:
     ```bash
     test -d packages/db/migrations
     test -z "$(find apps packages -path 'packages/db/migrations' -prune -o -path '*/migrations/*.sql' -print | grep -v '^packages/db/migrations/' || true)"
     grep -Eq '"migrations_dir"[[:space:]]*:[[:space:]]*"../../packages/db/migrations"' apps/worker/wrangler.jsonc
     ```
   - 根拠: V2 の AGENTS.md は D1 migration を `packages/db/migrations/` に置くこと、`wrangler.jsonc` の `migrations_dir` 設定を必須にしている。bs-job-board では D1 isolation を grep で守っているが、V2 では migration 配置も guard 対象にする。

6. D1 binding の配置 guard を追加する。
   - 追加する command 案:
     ```bash
     test -z "$(grep -R '"d1_databases"' apps/web packages/domain packages/shared packages/config || true)"
     ```
   - 根拠: V2 では外界依存を apps 側に寄せ、domain は port injection にする。D1 binding が web や domain/shared/config に混入すると境界が崩れる。

7. Web から Worker への直接 URL 呼び出しを禁止し、Service Binding 経路を強制する guard を追加する。
   - 追加する command 案:
     ```bash
     test -z "$(grep -RE --include='*.ts' --include='*.tsx' 'https?://|localhost:[0-9]+|127\.0\.0\.1' apps/web/src || true)"
     ```
   - 根拠: bs-job-board は `fetch(`、`chat/completions`、`reasoning_content` を grep で禁止し、Worker 間の責務境界を守っている。V2 でも public URL 直指定を禁止し、binding/proxy 経路に限定する。

8. integration test 用 task を追加する。
   - 追加案: root `package.json` に `"test:integration": "turbo test:integration"`、`turbo.json` に `"test:integration": { "dependsOn": ["^build"] }` を追加する。
   - 根拠: bs-job-board は `test` と `test:integration` を分け、CI で両方を実行している。V2 の現行 `turbo.json` には `test:integration` がないため、D1/Worker integration test を追加する場所がない。

9. typecheck failure log を artifact 化する。
   - 追加案: bs-job-board と同じく typecheck step を `typecheck.log` に出し、failure 時に `actions/upload-artifact` でアップロードする。
   - 根拠: monorepo の `turbo typecheck` は失敗ログが長くなりやすい。bs-job-board は失敗時にログを artifact 化して調査可能にしている。

10. deploy は CI と別 workflow にせず、まず manual script と DoD に寄せる。
    - 追加案: CI は verify のみに限定し、deploy は `pnpm --filter <target> deploy` または D1 migration apply と組み合わせた手順を docs/runbooks に置く。自動 CD は D1 適用順と URL 確認手順が固まってから追加する。
    - 根拠: bs-job-board で確認できた GitHub Actions workflow は CI のみで、CD workflow は見つからなかった。V2 の AGENTS.md は「デプロイはDoDの一部」「D1適用→deploy→URL確認まで」としているため、最初に自動 deploy だけを入れるより、migration と URL 確認を含む手順を guard/DoD として固定する方が安全。
