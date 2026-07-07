ファイル変更はしていません。`SON-*` は読了しましたが、依頼の元指摘ID範囲が `TSU-* / MIH-* / ADV-*` のため表からは外し、優先度判断だけに反映しています。

分類: `①` domain純粋ロジック、`②` D1 adapter、`③` E2E/HTTP/workflow/静的検査として除外。型で守るべきものはテスト不要と明記します。

| テストID | 元指摘ID | テスト名(日本語) | 分類①②③ | 対象関数 | mock構成の要点 |
|---|---|---|---|---|---|
| D-001 | TSU-004/BT-003 | `it('AI応答待ち中のチャットへの追加送信は409相当のエラーを返す')` | ① | `sendMessage` | `chatRepo.findById=active`; in-flight確認Port追加; `appendMessage/createQueued`未呼び出し |
| D-002 | TSU-006/BT-004 | `it('上限超過メッセージの面談開始はAI runを作らず拒否する')` | ① | `startChat/sendMessage` | 長文body; `idGen`含め全Port未呼び出し。`InvalidMessageBody`追加前提 |
| D-003 | TSU-007/BT-005 | `it('同じ冪等キーの再送はメッセージとAI runを重複作成しない')` | ① | `startChat/sendMessage` | `idempotencyKey`入力追加; 既存run返却/競合Resultをmock |
| D-004 | MIH-003@初回 | `it('チャット所有者と異なるactorの追加メッセージは403相当のエラーを返す')` | ① | `sendMessage` | `actorMemberId`追加; `chat.memberId !== actor`; 後続Port未呼び出し |
| D-005 | MIH-007@PR12-r2 | `it('所有者以外のメンバーのメッセージ送信は403相当のエラーを返す')` | ① | `sendMessage` | D-004同等。`MemberNotAuthorized`系error union追加前提 |
| D-006 | MIH-008@PR12-r2 | `it('存在しないメンバーの面談開始はMemberNotFoundを返し後続Portを呼ばない')` | ① | `startChat` | `memberRepo.findById=MemberNotFound`; `chatRepo/aiRunRepo/idGen`未呼び出し |
| D-007 | ADV-002@初回 | `it('他人のチャットへのメッセージ注入は403相当のエラーを返す')` | ① | `sendMessage` | actor不一致をdomainで判定。routeだけに置かない |
| D-008 | ADV-011@初回 | `it('上限超過メッセージの追加送信はAI runを作らず拒否する')` | ① | `sendMessage` | 長文body; `appendMessage/createQueued`未呼び出し |
| D-009 | ADV-011@PR12-r2 | `it('public API由来の過大入力はdomain境界で拒否する')` | ① | `startChat/sendMessage` | 空白のみ・最大長超過をtable test化。rate制限は③ |
| A-001 | TSU-003/BF-001 | `it('同一チャットへの並行送信はsequence競合をResultで返す')` | ② | `D1ChatRepository.appendMessage` | D1で同一`chatId`へ並列insert; throw禁止 |
| A-002 | MIH-004@初回 | `it('message/eventのsequence採番競合は500ではなくConflict Resultになる')` | ② | D1 chat/ai-run adapters | `UNIQUE(chat_id,sequence)` / `UNIQUE(ai_run_id,sequence)`衝突を再現 |
| A-003 | MIH-005@PR12-r2 | `it('D1失敗はthrowせずDbFailure Resultに変換する')` | ② | D1 repositories | `.run()/.all()`失敗をfake D1で発生させる |
| A-004 | MIH-006@PR12-r2 | `it('並行appendの同一sequence採番はretryまたはMessageSequenceConflictになる')` | ② | `D1ChatRepository.appendMessage` | 2並列POST相当。どちらも未捕捉例外にしない |
| A-005 | ADV-007@初回 | `it('同時送信のsequence競合はResultに包まれ500にならない')` | ② | `D1ChatRepository.appendMessage` | A-001同等のadapter契約 |
| A-006 | ADV-012@初回 | `it('別チャットのtriggerMessageIdを持つAI runはDBで拒否される')` | ② | migration / `createQueued` | chat A run + chat B messageをinsert |
| A-007 | ADV-004@PR12-r2 | `it('二重送信のmessage sequence競合はD1例外ではなくResultで返る')` | ② | `D1ChatRepository.appendMessage` | 同一next sequenceを競合させる |
| A-008 | ADV-006@PR12-r2 | `it('CAS失敗時のfailは生成中runをfailedへ上書きしない')` | ② | `D1AiRunRepository.fail` | `generating`状態に`fail`して不正遷移Resultを期待 |
| A-009 | ADV-007@PR12-r2 | `it('human message作成とAI run作成は片方だけ永続化されない')` | ② | transactional adapter/use-case boundary | `createQueued`失敗後にmessageが残らないことをD1で確認 |
| A-010 | ADV-010@PR12-r2 | `it('ai_runs.chat_idとtrigger_message_idの同一チャット性をDBが守る')` | ② | migration / `createQueued` | A-006同等。複合FK等のschema契約 |
| X-001 | TSU-001/BT-001 | `it('x-user-idだけでは他人のチャット履歴を読めない')` | ③ | HTTP `GET /messages` | domainにread use-caseなし。認証境界込みのAPI契約 |
| X-002 | TSU-002/BT-002 | `it('自己作成メンバーはadmin roleを作成できない')` | ③ | HTTP `POST /members` | member作成use-case不在。route/認可契約 |
| X-003 | TSU-005/BF-002 | `it('AI生成失敗時はユーザーに終端状態が見える')` | ③ | workflow + messages API | AI失敗・system message・UI polling込み |
| X-004 | MIH-001@初回 | テスト不要: `throw new Error` はCI静的guardで検出 | ③ | `api-client` | runtime testではなくarchitecture guard |
| X-005 | MIH-002@初回 | `it('wrangler entrypointは実在するWorker入口を指す')` | ③ | deploy config | deploy smoke/static check |
| X-006 | MIH-005@初回 | `it('外部入力の不正JSONや未知roleは400 Resultになる')` | ③ | HTTP parsers | boundary parser契約。型アサーション禁止 |
| X-007 | MIH-006@初回 | テスト不要: `_tag` switchは`satisfies never`で型検出 | ③ | error mapper | 型で守る。runtime test不要 |
| X-008 | MIH-007@初回 | `it('CIは実テストを実行する')` | ③ | CI | meta/CI契約 |
| X-009 | MIH-008@初回 | テスト不要: nullable状態は状態union/Brand型で表す | ③ | domain models | 型で守る。runtime test不要 |
| X-010 | MIH-001@PR12-r2 | テスト不要: `throw new Error` はCI静的guardで検出 | ③ | repo guard | runtime test不要 |
| X-011 | MIH-002@PR12-r2 | テスト不要: `_tag`網羅は`satisfies never`で型検出 | ③ | route error mapper | 型で守る |
| X-012 | MIH-003@PR12-r2 | `it('境界parseに失敗したMemberId/ChatId/payloadは400になる')` | ③ | HTTP/workflow boundary | parser unit/API契約。domain Brandは型で守る |
| X-013 | MIH-004@PR12-r2 | テスト不要: nullableなAI run状態は状態unionで表す | ③ | `AiRun` model | 型で守る。DB NOT NULLは別途②でも可 |
| X-014 | MIH-009@PR12-r2 | `it('localStorageのmemberIdとx-user-idだけでは本人性を成立させない')` | ③ | auth/API | 認証方式SpecGap。E2E相当 |
| X-015 | ADV-001@初回 | `it('認可なしでは任意チャットを読めない')` | ③ | HTTP `GET /messages` | API契約。domain対象外 |
| X-016 | ADV-003@初回 | `it('自己申告のx-user-idは認証主体として扱われない')` | ③ | auth/API proxy | セッション/JWT等の境界込み |
| X-017 | ADV-004@初回 | `it('publicなmember作成ではadmin roleを作れない')` | ③ | HTTP `POST /members` | route/member作成契約 |
| X-018 | ADV-005@初回 | `it('Flue workflow/run入口は外部公開されない')` | ③ | Worker routing | security smoke |
| X-019 | ADV-006@初回 | `it('ユーザー本文のrole spoofingはAI promptのsystem境界に混入しない')` | ③ | workflow prompt builder | workflow/prompt層。domain対象外 |
| X-020 | ADV-008@初回 | `it('AI runはtriggerMessageId時点の履歴だけで応答する')` | ③ | workflow | domainはIDを渡せるが、実害はworkflow履歴取得 |
| X-021 | ADV-009@初回 | `it('workflow起動失敗は201成功の裏でqueuedに固着しない')` | ③ | route + workflow dispatch | waitUntil/DB反映込み |
| X-022 | ADV-010@初回 | `it('AI呼び出しtimeout時はgeneratingに固着しない')` | ③ | workflow + AI client | timeout/AbortSignal契約 |
| X-023 | ADV-001@PR12-r2 | `it('x-user-id偽装ではowner検証を通過できない')` | ③ | auth/API | 認証主体とヘッダ分離が必要 |
| X-024 | ADV-002@PR12-r2 | `it('workflow payload改ざんでは他人chatへAI投稿できない')` | ③ | workflow entry | internal route guard + payload整合性 |
| X-025 | ADV-003@PR12-r2 | `it('存在する他人chatIdと不存在chatIdを404/403で識別できない')` | ③ | HTTP route | oracle対策。API契約 |
| X-026 | ADV-005@PR12-r2 | `it('連続send時のAI応答はtriggerMessageIdに対応する')` | ③ | workflow | 履歴snapshot/1 in-flight仕様 |
| X-027 | ADV-008@PR12-r2 | `it('workflow dispatch失敗後のAI runはqueuedに固着しない')` | ③ | route + workflow | dispatch failureをDBへ反映 |
| X-028 | ADV-009@PR12-r2 | `it('AI timeout時はユーザーに失敗状態が見える')` | ③ | workflow + UI/API | AI client timeoutと状態公開 |
| X-029 | ADV-012@PR12-r2 | テスト不要: `throw new Error` はCI静的guardで検出 | ③ | repo guard | runtime test不要 |

①で最優先に実装するなら、まず `D-006`（`startChat`の失敗Result伝搬）、`D-004/D-005/D-007`（`sendMessage`の所有者認可）、`D-002/D-008/D-009`（入力長上限）です。現行domainのまま即書けるのは `D-006` と `ChatArchived` 系、認可・冪等性・in-flight制御は関数引数/Port/error unionの追加が先です。