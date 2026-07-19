# スタディきち v13 設計書(同期) — Claude Code引き継ぎ用

> 本書は「複数端末で同じ空花・風花のデータが揃う」ための詳細設計。SKILL.md(絶対原則)と v12 設計書を併読のこと。
> v13 は2段階納品: **v13-a(ポイント台帳化+マージ基盤+手動マージ)** → **v13-b(Firebase+家族コードで自動同期)**。
> v13-a 単体でも「JSONを送り合えば安全に合体できる」状態になり、現在起きている複数端末事故を解決できる。

## 合意済みの前提(設計チャットでの決定事項)

- 同期方式は **家族コード**(推測不能な長いコード=共有シークレット)。アカウント登録・パスワードなし。
- **写真(しょうこ写真/メモボード/将来のノート写真)は端末内のみ**。同期・バックアップ対象外(理由: 無料枠・速度・実装コスト)。
- **Gemini APIキーは同期しない**(端末ローカル)。クラウドに秘密情報を置かない。
- クラウドは石橋家の **Firebase 無料プロジェクト1つ**(Realtime Database)。Webアプリ用configはコードに埋め込んでよい(公開情報。守りはDBルールで行う)。
- ポイントは残高でなく **取引台帳(ledger)** で持つ。副産物として「ポイントつうちょう」画面を提供。

---

# Step A(v13-a): ポイント台帳化 + マージ基盤 + 手動マージ

## A-1. ポイント台帳(ledger)

### データ
```js
p.ledger=[{id,ts,delta,reason,ref}]
// id: 一意ID(後述の決定的ID規約に従う) / delta: ±整数 / reason: 種別文字列 / ref: 参照情報(任意)
// p.points は「台帳合計のキャッシュ」に意味変更。recalcPoints(p) で再計算可能にする
```

### reason 種別と発生箇所(全ポイント変動をここに集約)
| reason | 発生箇所 | id規約 | 備考 |
|---|---|---|---|
| `slot` | spinNext(セッション) | `tx-spin-<sessId>` | **決定的ID**: 2端末が同一セッションをオフラインで各々回しても、マージで1件に収束 |
| `slot` | spinNext(ボーナス) | `tx-spin-<bonusId>` | 同上 |
| `shop` | buyTicket | `tx-shop-<rand>` | 正当な複数購入があるためランダムID |
| `theme` | きせかえ購入(v12) | `tx-theme-<pid>-<themeId>` | 決定的ID(同テーマ二重購入をマージで防止) |
| `mission` | ミッション承認(v12) | `tx-ms-<missionId>` | 決定的ID |
| `adjust` | 親の手動調整(A-4) | `tx-adj-<rand>` | |
| `carryover` | migrate(既存残高の繰越) | `tx-init-<profileId>` | 決定的ID |

### 実装
- `addLedger(p,delta,reason,ref,fixedId?)`: 同IDが既に存在すれば何もしない(冪等)。追加後 `p.points+=delta`。
- 既存の `p.points+=` / `-=` 直書きを**全箇所** addLedger 経由に置換(spinNext / buyTicket / v12のミッション・テーマ)。
- `recalcPoints(p)`: 台帳合計で points を上書き。migrate とマージ適用後に必ず呼ぶ。

## A-2. ポイントつうちょう(UI)

- ホームの ⭐ポイント stat をタップ → モーダル「⭐ポイントつうちょう」: 直近30件を新しい順に `7/14 +50 スロット` `7/13 −300 こうかんじょ(パパと30分あそぶ券)` の形式で表示。残高をヘッダに。
- 子ども向け文言(スロット/こうかんじょ/きせかえ/ミッション/ちょうせい/くりこし)。

## A-3. マージ可能化(ID・更新時刻・墓標)

### 方針
- **IDを持つ実体は「和集合 + 同IDは mt(更新時刻)が新しい方」**でマージする(エンティティ単位LWW)。
- **削除は物理削除をやめるか、墓標(tombstone)を残す**。墓標がないと、片方で消した物がマージで蘇る。

### 変更一覧
1. **ID付与(migrateで既存分にも採番)**
   - exams: `e.id='ex'+ts+rand`
   - chat/chatArchive: `m.id` / `a.id`
   - tickets(所持券): 文字列→ `{id,name,ts,usedTs:null}` に変換。「つかう」= 削除でなく `usedTs` 記録(表示は未使用のみ)。使用履歴が残る副産物つき。
2. **mt(更新時刻)スタンプ**: 変異箇所で `x.mt=Date.now()` を打つ。対象と箇所:
   - sessions: 生成時 / judge(承認・却下) / spinNext(spin確定)
   - weeks: **サブ分割**(後述) planMt / testMt / report.ts(既存) / granted系
   - bonusSpins: 生成時 / judgeBonus / 消費時
   - missions(v12): 各status遷移
   - exams: examSave
   - tickets: useTicket
   - プロフィールのスカラー群: `p.metaMt`(saveParent / saveAiName / テーマ変更 / addPool等のリスト編集を含む)
   - S直下: `S.basesMt`(きち編集) / `S.pinMt`(親PIN変更)
3. **墓標**: `p.deleted={<id>:ts}`(exams/チャットアーカイブ/ミッション/将来のnotes等の削除時に記録)。S直下用に `S.deleted` も用意(きち削除)。90日より古い墓標はsave時に間引き。
4. **bonusSpins は削除しない**: 消費= `status:'used'`、却下= `status:'rejected'`(表示・抽選対象は approved のみ、60日超の used/rejected は間引き)。ボーナスIDは既に週×種別で決定的(`bs-`規約に変更: `'bs-'+weekKey+'-'+kind`)のため、**2端末が同条件で独立発行してもマージで1件に収束**する。grantBonus のID生成をこの規約に変更(migrateで既存分は現IDのまま=衝突しないので可)。

### weeks のサブ分割マージ(重要)
同じ週オブジェクトを「親端末が作戦」「子端末がバトル」と別端末で触るのが通常運用のため、週は丸ごとLWWにしない:
- **planブロック**(subjects/items/range/planTs) … `wk.planMt` でLWW
- **testブロック**(test{total,correct,items,ts} と reviews の**構成**) … `wk.testMt` でLWW
- **reviews の done フラグ** … 教科名でつき合わせ、`done は OR(trueが勝ち)`(チェック外し競合は稀・許容と明記)
- **granted** … キー単位で OR(trueが勝ち)。ボーナス実体は決定的IDで重複しないため安全
- **report** … report.ts が新しい方

## A-4. 親の手動ポイント調整

- パパ・ママモードに「⭐ポイントちょうせい」: ±数値 + 理由メモ → `adjust` 取引を追加。マージ後の万一のズレ(オフライン二重購入等)を親が正せる安全弁。つうちょうに理由つきで表示。

## A-5. mergeState(純関数) — 仕様

```js
function mergeState(a,b) → merged   // a,b を破壊しない。可換(a,b入替で同結果)を目指す
```
- S直下: bases=basesMt新しい方(墓標考慮)、parentPin=pinMt、gemini/tab/currentProfile/activeSession は**マージ対象外(呼び出し側のローカル値を維持)**
- profiles: IDの和集合。各プロフィールで:
  - スカラー群(name,em,grade,pin,aiName,examTarget,bigGoals,pool,books,theme) … metaMt でLWW(丸ごと)
  - ownedThemes … **和集合**(購入を失わない・例外規則)
  - sessions/exams/tickets/missions/notes … 和集合+ID一致はmt LWW、墓標適用
  - ledger … 和集合のみ(追記専用)。適用後 recalcPoints
  - chat … 和集合→ts昇順ソート。chatArchive … 和集合+墓標
  - weeks … 週キーの和集合、各週はA-3のサブ分割規則
  - bonusSpins … 和集合+ID一致はmt LWW(statusの進んだ方が通常新しい)
  - deleted … 和集合
- 実装後、**マージ単体テスト必須**(最低シナリオ): ①片方だけ新セッション ②同一セッションを両方で承認/一方却下 ③同一セッションを両方でスピン(ledger 1件収束) ④片方で券使用+片方で新規獲得 ⑤同週に別端末で作戦とバトル ⑥both独立に同種ボーナス発行→1件収束 ⑦片方で模試削除→蘇らない ⑧ポイント: A端末で−800購入+B端末で+50獲得→残高が台帳合計と一致 ⑨可換性(merge(a,b)≡merge(b,a)) ⑩冪等性(merge(m,a)≡m)

## A-6. 手動マージUI(v13-aの完成形)

- パパ・ママモード「💾バックアップ」に **「🔀べつの端末のデータと合体(マージ)」** を追加: JSON選択 → migrate → mergeState(S, imported) → **差分プレビュー**(「セッション+3 / 模試+1 / ポイント 640→690」程度の件数サマリ)→「合体する」で適用+save+render。
- 従来の「復元(上書き)」は残す(文言に「上書き」と明記)。
- 運用: 同期完成までは「週1でJSONを送って合体」で複数端末運用が可能になる。

## A-7. migrate(state v4)

- ledger 不在なら繰越取引を作成(現points)。exams/chat/archives/tickets のID採番、tickets オブジェクト化、p.deleted/S.deleted 初期化、各mtフィールドは0初期化。バックアップimport・マージ入力の両経路に適用。sw CACHE と せってい表記を v13 に。

---

# Step B(v13-b): Firebase Realtime Database + 家族コード

## B-1. 構成

- **Firebase Realtime Database**(Firestoreでなく)を採用: 家族=1ノードの小さなJSON、onValueでリアルタイム受信、無料枠(1GB/転送10GB月)で家族+友達数軒は余裕。
- パス: `/families/<familyId>/state`(同期対象状態) と `/families/<familyId>/meta {rev, updatedAt}`。
- **匿名認証(signInAnonymously)を必須化**し、ルールは「認証済み かつ パスを知っている者のみ」:
```json
{ "rules": { "families": { "$fid": { ".read": "auth != null", ".write": "auth != null" } }, ".read": false, ".write": false } }
```
  (families直下の一覧取得は不可 → familyId を知らない限り到達不能。コード=鍵の設計)

## B-2. 家族コード

- 「同期をはじめる」で `familyId = 26文字前後のbase32乱数`(crypto.getRandomValues) を発行。**localStorageの別キー(`studykichi_sync`)に保存し、S(=バックアップJSON)には含めない**(バックアップを他人に渡してもコードが漏れない)。
- パパ・ママモードに「☁️かぞく同期」セクション: 状態表示(未接続/接続中+最終同期時刻) / はじめる(コード発行) / つながる(コード入力。QR表示は任意実装: cdnjsのqrcodejs、失敗時はテキストコードのみで良い) / コードを見る(親PIN内なので表示可+「家族以外に教えない」注意書き) / 切断(ローカルデータは残る)。
- 端末追加手順(UIに文言表示): ①新端末でアプリを開く ②パパ・ママモード→かぞく同期→つながる ③コード入力 → 初回は「クラウドのデータと合体しますか?」→ mergeState 適用。

## B-3. 同期エンジン

- 送信対象の抽出 `syncable(S)`: gemini / tab / currentProfile / activeSession / (localStorageのsync設定) を除外した複製。
- **Push**: save() でdirtyフラグ→**2秒デバウンス**→ RTDBトランザクションで `state` を読み、`merged=mergeState(remote, syncable(S))` を書き戻し(rev+1)。トランザクションにより同時書込の取りこぼしなし。
- **Pull**: onValue(state) → `merged=mergeState(S, remote)` → 変化があれば S を更新(端末ローカル項目は維持)+ recalcPoints。
- **描画ポリシー(入力を壊さない)**: モーダルが開いている/planDraft・btDraft編集中/activeSessionのタイマー画面中は、Sだけ更新して再renderしない(次のタブ遷移・モーダル閉時に反映)。それ以外は render()。
- **ループ防止**: 受信適用によるsaveはpushをスケジュールしない(適用前後のsyncable(S)のJSON比較で無変化ならスキップ)。
- **オフライン**: 失敗時は保留、`online` イベントと起動時に再送。ヘッダ等に常時アイコンは出さず、せってい/親画面に「最終同期: HH:MM」のみ(ホームを汚さない原則)。
- 写真参照の扱い: photoId/boards は同期されるがバイナリは端末内のため、他端末ではサムネイル非表示(getPhotoがnull→img非表示は既存挙動で自然に成立。「この端末にない写真」の代替表示は不要、ただし親向け説明を同期セクションの注意書きに1行)。

## B-4. Firebase セットアップ(石橋さん作業・ガイド化すること)

1. console.firebase.google.com → プロジェクト作成(アナリティクス不要)
2. 構築→Realtime Database→作成(ロック モード)→ルールに B-1 のJSONを貼付
3. 認証→ログイン方法→「匿名」を有効化
4. プロジェクト設定→マイアプリ→Web→config(apiKey等)をコピー
5. index.html の `FIREBASE_CONFIG` 定数に貼付(このconfigは公開されて問題ない旨をコード内コメントに明記)
- SDKは gstatic のCDN(compat版でよい)。**未設定(config空)の場合、同期UIは「準備中」表示にし、他機能は従来通り動くこと**(configなしでアプリが壊れない)。

## B-5. テストと受け入れ

- 単体: mergeState はA-5のシナリオ網羅(node実行)。同期エンジンは transport をモック注入できる構造にし、push/pull/デバウンス/ループ防止/描画ポリシーをjsdomで検証。
- 実機受け入れチェックリスト(納品物に含める): 2端末で ①A記録→Bに数秒で反映 ②B承認→Aのスロットカード出現 ③機内モードでA記録→復帰で合流 ④A購入とB獲得の同時→残高=台帳合計 ⑤切断→再接続 ⑥3台目追加(初回マージ)
- **展開手順(必ずこの順)**: 全端末でバックアップJSON保存 → 親端末を最新版に更新し「はじめる」→ 子端末を更新し「つながる」(初回マージのプレビュー確認) → 1週間は週1バックアップ継続。

## 受容するトレードオフ(明記)

- pool/books等のリスト同時編集は metaMt LWW で片方が勝つ(親のみが触る想定・許容)
- reviews のチェック外し競合は done=OR で「チェック済み」が勝つ(稀・許容)
- オフライン中の二重購入で残高が理論上マイナスになり得る → 台帳が真実。親の「ちょうせい」で補正可能
- チャットは全文同期(テキストのみ)。写真つき発言の画像は撮影端末のみで表示

## 共通チェック(実装者へ)

- 全ポイント変動が ledger 経由か(直書き `p.points+=` の残存をgrepでゼロ確認)
- migrate v4 が 通常起動/復元/マージ入力 の3経路で効くか
- v13-a 納品時点で自動テスト全パス+`runtime errors: none`、v13-b はモック透過テスト+実機チェックリスト添付
- せってい vN と sw.js CACHE の同時更新 / 子ども画面の文言はひらがな基調
