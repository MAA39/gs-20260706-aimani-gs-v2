**指摘**

P0 は検出なし。

- **WEB-01 / P1** QueryClient が module singleton で、SSR/Cloudflare Worker ではリクエスト間キャッシュ共有リスクがあります。queryKey もユーザー境界を含まないため、ログインユーザー切替時に前ユーザーの `chats/messages` キャッシュが見える余地があります。  
  根拠: [__root.tsx:4](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/__root.tsx:4), [chat.tsx:82](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:82), [chat.tsx:91](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:91)

- **WEB-02 / P1** `useQuery` の `queryFn` が `ApiResult` を成功データとして返すため、TanStack Query の `retry`, `isError`, backoff が HTTP 401/429/NetworkError に効きません。`retry: 1` は実質的に JSON parse 例外など以外では期待通り動かない設計です。  
  根拠: [api-client.ts:75](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/lib/api-client.ts:75), [__root.tsx:8](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/__root.tsx:8), [chat.tsx:81](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:81)

- **WEB-03 / P1** AI run polling の失敗が UI/認証導線に反映されません。`aiRunQuery.data?.ok` が false の場合は無視され、401 でもログイン誘導されず、ネットワーク/429 でも 60 秒 timeout まで「待ち」になります。  
  根拠: [chat.tsx:97](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:97), [chat.tsx:104](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:104), [chat.tsx:147](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:147)

- **WEB-04 / P1** `/chat` の認証保護が `useEffect + navigate` で、TanStack Router の `beforeLoad`/loader が未活用です。未認証時に route render 後の遷移になり、returnTo 保存や loader 時点のデータ取得にも乗りません。  
  根拠: [chat.tsx:17](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:17), [chat.tsx:63](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:63), [router.tsx:5](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/router.tsx:5)

- **WEB-05 / P1** 既存チャットでメッセージ読み込み前に送信でき、`lastHumanSeq` が stale/空の `messages` から推定されます。過去の AI/system メッセージを「今回の返信」と誤判定して `waitingForAi` が即解除される可能性があります。  
  根拠: [chat.tsx:191](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:191), [chat.tsx:124](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:124), [chat.tsx:304](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:304), [chat.tsx:364](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:364)

- **WEB-06 / P1** 二重送信ガードが `submitMessage` に集約されていません。form submit、starter button、急連打が別経路で入り、React の再描画前に複数 mutation が走る余地があります。  
  根拠: [chat.tsx:199](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:199), [chat.tsx:213](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:213), [chat.tsx:272](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:272)

- **WEB-07 / P2** mutation 後の cache invalidation が不足しています。新規 chat 作成や送信後に `['chats']` が無効化されないため、一覧へ戻った直後に title/updatedAt/新規 chat が stale 表示になる可能性があります。  
  根拠: [chat.tsx:168](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:168), [chat.tsx:195](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:195), [chat.tsx:248](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:248)

- **WEB-08 / P2** `chatsQuery` の 401/network/429 が空一覧として握りつぶされます。履歴取得失敗時に空状態と区別できず、ログイン切れ誘導もありません。  
  根拠: [chat.tsx:90](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:90), [chat.tsx:95](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:95), [chat.tsx:280](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:280)

- **WEB-09 / P2** optimistic 表示の照合が本文一致だけです。同じ本文の過去メッセージがあると、今回の pending bubble がサーバー反映前に消えます。  
  根拠: [chat.tsx:135](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:135), [chat.tsx:314](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:314)

- **WEB-10 / P2** アクセシビリティ上、chat log/status/error のライブ領域と textarea のラベルが不足しています。スクリーンリーダーでは AI 応答待ち、エラー、メッセージ追加が通知されにくいです。  
  根拠: [chat.tsx:261](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:261), [chat.tsx:321](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:321), [chat.tsx:327](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:327), [chat.tsx:357](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:357)

- **WEB-11 / P2** Query の `AbortSignal` が API client に渡らないため、route 遷移・chat 切替・unmount 時の不要 request を中断できません。race の直接原因にはなりにくいですが、polling と相性が悪いです。  
  根拠: [api-client.ts:75](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/lib/api-client.ts:75), [api-client.ts:78](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/lib/api-client.ts:78), [chat.tsx:83](/Users/maa/Projects/gs/gs-20260706-aimani-gs-v2/apps/web/src/routes/chat.tsx:83)

**リファクタリング提案トップ5**

1. Query key factory と Result-aware query wrapper を作り、`401/429/network/polling failure` の扱いを一元化する。
2. `QueryClient` を SSR request scoped / browser singleton に分け、Router context に注入して `loader.ensureQueryData` を使う。
3. `/chat` を `beforeLoad` 付き protected route にし、認証 redirect と returnTo を Router 側へ移す。
4. chat 送信状態を `idle/submitting/waiting/failed` の state machine に寄せ、二重送信・sequence 推定・timeout を集中管理する。
5. `ChatLog`, `MessageComposer`, `ErrorBanner` に分割し、`role="log"`, `aria-live`, `role="alert"`, textarea label/focus style を標準化する。

確認範囲は `apps/web/src` の9ファイルです。変更は禁止条件のため実施していません。