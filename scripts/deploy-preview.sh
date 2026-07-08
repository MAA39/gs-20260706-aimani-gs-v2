#!/usr/bin/env bash
# aimani G's V2 プレビューデプロイ一発スクリプト
# 前提: wrangler がOAuthログイン済み（npx wrangler whoami で確認済み）
#       apps/worker/.dev.vars に SAKURA_API_TOKEN / INTERNAL_ROUTE_SECRET /
#       BETTER_AUTH_SECRET / DEV_AUTH_BYPASS_USER_ID が入っていること
#
# ⚠️ DEV_AUTH_BYPASS_USER_ID を本番に入れる = 認証なしで誰でも使える状態。
#    GitHub OAuth App作成後は必ず `npx wrangler secret delete DEV_AUTH_BYPASS_USER_ID --name aimani-gs-v2`
set -euo pipefail
cd "$(dirname "$0")/.."

WORKER_NAME="aimani-gs-v2"
WORKER_URL="https://aimani-gs-v2.masa-nekoshinshi39.workers.dev"
WEB_URL="https://aimani-gs-v2-web.masa-nekoshinshi39.workers.dev"

echo "== 1/5 D1本番migration =="
(cd apps/worker && npx wrangler d1 migrations apply aimani-gs-v2-db --remote)

echo "== 2/5 secrets投入（.dev.varsから読む。値は画面に出さない） =="
for key in SAKURA_API_TOKEN INTERNAL_ROUTE_SECRET BETTER_AUTH_SECRET DEV_AUTH_BYPASS_USER_ID; do
  value=$(grep "^${key}=" apps/worker/.dev.vars | cut -d= -f2- || true)
  if [ -z "$value" ]; then echo "  SKIP: $key（.dev.varsに無し）"; continue; fi
  printf '%s' "$value" | npx wrangler secret put "$key" --name "$WORKER_NAME"
  echo "  OK: $key"
done

echo "== 3/5 API workerデプロイ =="
pnpm --filter @gs-v2/worker deploy

echo "== 4/5 web workerデプロイ =="
pnpm --filter @gs-v2/web deploy

echo "== 5/5 スモークテスト =="
echo "- health:"
curl -s "$WORKER_URL/api/health"; echo
echo "- チャット作成（AI応答は数秒後にwebで確認）:"
curl -s -X POST "$WORKER_URL/api/chats" -H 'Content-Type: application/json' -d '{"message":"デプロイ後の疎通テストです"}'; echo
echo ""
echo "✅ 完了。ブラウザで開く: $WEB_URL/chat"
echo "⚠️ OAuth App作成後にやること:"
echo "   npx wrangler secret put GITHUB_CLIENT_ID --name $WORKER_NAME"
echo "   npx wrangler secret put GITHUB_CLIENT_SECRET --name $WORKER_NAME"
echo "   npx wrangler secret delete DEV_AUTH_BYPASS_USER_ID --name $WORKER_NAME"
echo "   pnpm --filter @gs-v2/worker deploy"
