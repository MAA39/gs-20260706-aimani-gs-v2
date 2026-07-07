ファイル変更はしていません。以下は実コードで確認できた引用のみです。

**① チャットUI構造・スタイリング**

| ファイルパス:行 | 実コード/実文言の引用 | v2移植推奨度 |
|---|---|---|
| `apps/web/src/routes/chat/$id.tsx:176` | `<section className="chat-main">` / `<div className="chat-scroll" ref={scrollRef}>` / `<div className="chat-input-dock">` | 高: チャット画面の基本骨格。TanStack Router移行後もそのまま画面構成として使える。 |
| `apps/web/src/routes/__root.tsx:179` | `.chat-main { height: 100%; max-width: 900px; margin: 0 auto; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }` | 高: ヘッダー、スクロール領域、入力欄固定のレイアウト資産。 |
| `apps/web/src/components/ChatInput.tsx:39` | `<form className="chat-input" onSubmit={handleSubmit}>` / `<textarea ... rows={2} />` / `<button type="submit" disabled={disabled || !value.trim()}>{submitLabel}</button>` | 高: 入力コンポーネントが独立しており再利用しやすい。 |
| `apps/web/src/routes/__root.tsx:219` | `.chat-input { display: flex; gap: 8px; align-items: flex-end; background: var(--sheet); border: 1px solid var(--sheet-line); border-radius: 24px; padding: 8px 8px 8px 18px; }` | 高: チャット入力ドックの見た目を直接移植可能。 |
| `apps/web/src/components/ChatMessage.tsx:19` | `<article className="chat-message ai-message">` / `<span className="quote-label">あなたの言葉から</span>` / `<span className="quote-words">「{parsed.quote_span}」</span>` | 高: AI応答を「引用 + 返答」に分ける体験が明確。 |
| `apps/web/src/components/ChatMessage.tsx:30` | `<article className="chat-message human-message">` / `<div className="human-bubble">` | 高: 人間側メッセージのバブル表現として再利用しやすい。 |
| `apps/web/src/lib/use-ai-run-progress.ts:139` | `connecting: '接続中...'`, `generating: 'AIが相談の材料を整理しています...'`, `repairing: '形式を整えています...'` | 高: ローディング/進捗文言の実装資産。 |
| `apps/web/src/routes/__root.tsx:160` | `.error { border-color: #7A3B33; background: #33231F; color: #E8A99B; }` | 高: エラー表示のスタイルが共通化されている。 |
| `apps/web/src/components/Sidebar.tsx:51` | `{chats.length === 0 && <p className="empty-sidebar">まだチャットがありません。</p>}` | 中: 空状態はサイドバー用として有用。チャット本文の空状態ではない。 |

**② コピーライティング**

| ファイルパス:行 | 実コード/実文言の引用 | v2移植推奨度 |
|---|---|---|
| `apps/web/src/routes/chat/new.tsx:17` | `'課題で詰まっている'`, `'チーム開発の困りごと'`, `'進路・キャリア'`, `'メンター面談の準備'` | 高: 初回入力前の開始導線コピーとして有用。 |
| `apps/web/src/routes/chat/new.tsx:137` | `<PageHeader title="新規チャット" />` / `<h2>何に困っていますか？</h2>` | 高: 初回訪問時の主問いかけとして移植価値が高い。 |
| `apps/web/src/components/ChatInput.tsx:13` | `placeholder = '困っていることを書いてください...'` / `submitLabel = '送る'` | 高: 汎用チャット入力の初期コピー。 |
| `apps/web/src/routes/chat/$id.tsx:216` | `placeholder="自分の言葉で書いてもかまいません"` | 高: 選択肢UIと自由入力を併用する体験に合う。 |
| `apps/web/src/routes/chat/new.tsx:24` | `AIに話した内容は、<strong>あなたが出すまで誰にも見えません</strong>` | 高: プライバシー説明として重要な実文言。 |
| `apps/web/src/routes/chat/new.tsx:31` | `ただし<strong>開発者まさかず（同期でもある）はDBを見られる立場にあります</strong>` | 中: v1固有の人物名を含むため、文意は有用だが調整前提。 |
| `apps/web/src/routes/chat/$id.tsx:190` | `ここまででかなり材料が出ています。続けても大丈夫ですが、「整理する」からまとめに進めます。` | 高: 継続/終了判断を促す自然なコピー。 |
| `apps/web/src/routes/chat/$id.tsx:130` | `このチャットは上限に達しました。「整理する」から内容をまとめてください。` | 高: ターン上限時の具体的な次アクション提示。 |
| `apps/web/src/components/QuestionSheet.tsx:95` | `placeholder="この質問への回答を自分の言葉で"` / `{isLastStep ? '送る' : '次へ'}` | 高: 質問シート内の自由記述導線として再利用しやすい。 |
| `apps/web/src/routes/chat/$id/report.tsx:90` | `title={isShared ? '共有する相談内容' : '自分用の整理'}` | 高: 整理/共有フェーズの切り替えコピー。 |
| `apps/web/src/routes/chat/$id/shared.tsx:36` | `<textarea placeholder="コメント欄は次フェーズで保存対応します。" disabled />` | 低: 未実装状態を示すv1向けコピー。 |

**③ 導線設計**

| ファイルパス:行 | 実コード/実文言の引用 | v2移植推奨度 |
|---|---|---|
| `apps/web/src/routes/index.tsx:9` | `window.location.replace('/chat/new');` / `チャットを開始します...` | 高: 初回訪問を即チャット開始へ送る導線。 |
| `apps/web/src/routes/chat/new.tsx:138` | `{consent.authenticated && !consent.consented ? ( <ConsentPanel ... /> ) : ( <div className="new-chat-panel"> ... )}` | 高: 同意確認後にチャット開始へ進めるゲート構造。 |
| `apps/web/src/routes/chat/new.tsx:146` | `<button key={category} type="button" onClick={() => startChat(category)} disabled={submitting}>` | 高: カテゴリ選択だけでチャット開始できる導線。 |
| `apps/web/src/routes/chat/new.tsx:119` | `const result = await createChat({ data: { body } });` / `navigate({ to: '/chat/$id', params: { id: result.id }, search: { run: result.ai_run.id } })` | 高: 作成直後に進捗run付きで会話画面へ遷移する流れ。 |
| `apps/web/src/routes/chat/$id.tsx:181` | `actions={<button type="button" className="status-btn" onClick={() => setFinishOpen(true)}>整理する</button>}` | 高: チャット継続から整理フェーズへの主要導線。 |
| `apps/web/src/components/FinishModal.tsx:17` | `自分だけで保持する` / `チューターに相談する` / `メンターに相談する` | 高: 終了時の共有範囲選択UIとして再利用価値が高い。 |
| `apps/web/src/components/Sidebar.tsx:37` | `<Link to="/chat/new" className="new-chat-link" ...>新規</Link>` | 高: 継続利用時の新規作成導線。 |
| `apps/web/src/components/Sidebar.tsx:68` | `チューターに共有済み` / `メンターに共有済み` / `整理済み` / `整理中` | 高: 過去チャットの状態把握に使える。 |

**④ 再利用可能なUXパターン**

| ファイルパス:行 | 実コード/実文言の引用 | v2移植推奨度 |
|---|---|---|
| `apps/web/src/components/ChatInput.tsx:31` | `if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;` | 高: Enter送信、Shift+Enter改行、日本語IME保護の入力UX。 |
| `apps/web/src/routes/chat/$id.tsx:105` | `scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });` | 高: 新着メッセージ時の自動スクロール。 |
| `apps/web/src/components/QuestionSheet.tsx:56` | `<section className="question-sheet" aria-label="選択肢">` / `<span className="sheet-progress">{step + 1} / {questions.length}</span>` | 高: AI質問を1問ずつ進めるシートUI。 |
| `apps/web/src/routes/chat/$id.tsx:167` | ``.map((question, index) => `[${question.question}] ${nextAnswers[index] ?? ''}`).join('\n')`` | 高: 複数質問の回答を1メッセージに束ねるUX。 |
| `apps/web/src/components/QuestionSheet.tsx:121` | `自分の言葉で書く` | 高: 選択肢に閉じない自由入力の逃げ道。 |
| `apps/web/src/routes/chat/$id.tsx:207` | `<button type="button" className="sheet-reopen" ...>選択肢を見る</button>` | 高: 閉じた質問シートを再表示できる復帰導線。 |
| `apps/web/src/routes/__root.tsx:256` | `@media (max-width: 860px)` / `.sidebar { position: fixed; ... transform: translateX(-110%); }` | 中: モバイル用サイドバー挙動として有用。v2のレイアウト次第で調整が必要。 |
| `apps/web/src/components/PageHeader.tsx:14` | `const GITHUB_URL = 'https://github.com/MAA39/gs-20260630-aimani-gs';` | 低: v1リポジトリ固有リンク。UI構造だけなら流用可能。 |