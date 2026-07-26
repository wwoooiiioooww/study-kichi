/* スタディきち 自動テスト(jsdom)
   実行: cd test && npm install && npm test
   目的: v12新機能(ロケットOP/きせかえ/特別ミッション)のパス + 既存回帰(スロット/承認/週サイクル) + runtime errors: none */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; fails.push(name); console.log('  ✗ ' + name); }
}
function eq(a, b, name) { ok(Object.is(a, b), name + (Object.is(a, b) ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 起動ヘルパー。preState=localStorageの旧データ / extraLS=追加のlocalStorageキー */
function boot(preState, extraLS) {
  const errors = [];
  const alerts = [];
  const dom = new JSDOM(html, {
    url: 'https://example.com/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.confirm = () => true;
      window.alert = m => alerts.push(String(m));
      window.addEventListener('error', e => errors.push(e.message));
      window.localStorage.setItem('studykichi_concept', '1'); // 既定は表示済み(初回挙動は個別テストで検証)
      if (preState) window.localStorage.setItem('studykichi_v1', JSON.stringify(preState));
      if (extraLS) Object.entries(extraLS).forEach(([k, v]) => window.localStorage.setItem(k, v));
    },
  });
  dom.window.parentAuthed = true; // 既定は入室済み(PINゲートは[20]で個別に検証)
  return { dom, w: dom.window, errors, alerts };
}

/* ---------- 1. 起動 + 🚀ロケットOP ---------- */
console.log('\n[1] 起動 + 🚀ロケットOP');
{
  const { w, errors } = boot();
  const St=w.eval('S');ok(St && St.v === 5, '起動できて S.v=5');
  ok(w.document.querySelector('#app').innerHTML.length > 100, 'ホームが描画される');
  ok(w.document.querySelector('#splash'), '起動直後にスプラッシュが表示される');
  await sleep(1600);
  ok(!w.document.querySelector('#splash'), '1.3秒タイマーでスプラッシュが消える');
  w.render();
  ok(!w.document.querySelector('#splash'), '2回目のrender()でスプラッシュが再表示されない');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  const { w } = boot();
  const sp = w.document.querySelector('#splash');
  sp.dispatchEvent(new w.Event('click', { bubbles: true }));
  ok(!w.document.querySelector('#splash'), 'タップで即スキップできる');
  w.close();
}

/* ---------- 2. migrate(旧v11データ / バックアップimport相当) ---------- */
console.log('\n[2] migrate');
{
  // 旧v11相当: theme/ownedThemes/missions が無いプロフィール
  const old = {
    v: 3, currentProfile: 'sora',
    profiles: { sora: { name: '空花', em: '🌸', grade: '小5', points: 120, sessions: [], exams: [{ name: '合不合', date: '2026-06-01', scores: { 総合: 55 } }], chat: [], pool: ['旧文字列券'], tickets: ['小籠包ディナー券'], weeks: {}, bonusSpins: [], books: [] } },
  };
  const { w, errors } = boot(old);
  const p = w.eval('S').profiles.sora;
  eq(p.theme, 'sky', '旧データに theme=sky が付与される');
  ok(Array.isArray(p.ownedThemes) && p.ownedThemes.includes('sky') && p.ownedThemes.includes('sakura'), '旧データに ownedThemes=[sky,sakura] が付与される');
  ok(Array.isArray(p.missions) && p.missions.length === 0, '旧データに missions=[] が付与される');
  eq(p.points, 120, '既存ポイントは壊れない');
  eq(p.pool[0].name, '旧文字列券', '既存migrate(券の値札化)も引き続き動く');
  /* v13-a: 台帳・マージ基盤のmigrate */
  eq(p.ledger.length, 1, '既存残高が繰越取引になる');
  eq(p.ledger[0].id, 'tx-init-sora', '繰越取引は決定的ID(tx-init-<pid>)');
  eq(p.ledger[0].delta, 120, '繰越額=旧残高');
  ok(p.tickets[0] && p.tickets[0].name === '小籠包ディナー券' && p.tickets[0].id, '所持券がID付きオブジェクトに変換される');
  ok(p.exams[0].id && p.exams[0].mt === 0, '模試にIDとmtが採番される');
  ok(p.deleted && typeof p.deleted === 'object' && p.metaMt === 0, '墓標とmetaMtが初期化される');
  const St2 = w.eval('S');
  ok(St2.deleted && St2.basesMt === 0 && St2.pinMt === 0, 'S直下の墓標/basesMt/pinMtが初期化される');
  eq(errors.length, 0, 'runtime errors: none');
  // importData 経路と同じ migrate() を直接検証(所持外テーマの防御も)
  const st2 = { profiles: { x: { theme: 'night', ownedThemes: ['sky'], pool: [], weeks: {}, exams: [] } } };
  w.migrate(st2);
  eq(st2.profiles.x.theme, 'sky', '未所持テーマが指定されていたら sky に戻す(import防御)');
  ok(st2.profiles.x.ownedThemes.includes('sakura'), '初期所持テーマは必ず補完される');
  ok(w.importData.toString().indexOf('migrate(') >= 0, 'importData がmigrate経由である(コード照合)');
  w.close();
}

/* ---------- 3. 🎨きせかえ ---------- */
console.log('\n[3] 🎨きせかえ');
{
  const { w, errors } = boot();
  const doc = w.document;
  const p = w.P();
  const hd1 = () => doc.documentElement.style.getPropertyValue('--hd1');
  ok(hd1() === '#8EC8F2', '起動時に既定テーマ(sky)が適用される');
  // 未所持テーマは切替不可
  w.setTheme('night');
  eq(p.theme, 'sky', '未所持テーマへの切替は無効');
  // ポイント不足では購入不可
  p.points = 50; w.render();
  w.buyTheme('night');
  eq(p.points, 50, 'ポイント不足では購入されない');
  // 購入 → 減算 → 所持 → 即適用
  p.points = 150; w.render();
  w.buyTheme('night');
  eq(p.points, 50, '購入で100pt減算される');
  ok(p.ownedThemes.includes('night'), '購入テーマが所持に追加される');
  eq(p.theme, 'night', '購入テーマが即適用される');
  ok(hd1() === '#6478A8', ':root のCSS変数が night に切り替わる');
  w.buyTheme('night');
  eq(p.points, 50, '重複購入はできない');
  // プロフィール切替でメンバーごとのテーマに切り替わる
  w.switchProfile('fuka');
  ok(hd1() === '#8EC8F2', 'プロフィール切替でテーマも切り替わる(fuka=sky)');
  w.switchProfile('sora');
  ok(hd1() === '#6478A8', 'soraに戻すと night に戻る');
  // こうかんじょ・せってい画面の表示
  w.eval('S').tab = 'home'; w.render();
  ok(doc.querySelector('#app').innerHTML.includes('🎨 きせかえ'), 'こうかんじょに🎨きせかえセクションが常設される');
  w.eval('S').tab = 'set'; w.render();
  ok(doc.querySelector('#app').innerHTML.includes('こうかんじょで100pt'), 'せっていで未所持テーマに購入誘導が出る');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 4. 🎯特別ミッション ---------- */
console.log('\n[4] 🎯特別ミッション');
{
  const { w, errors } = boot();
  const doc = w.document;
  const p = w.P();
  const mkMs = (over) => Object.assign({
    id: 'ms' + Math.random().toString(36).slice(2), title: 'テストミッション', pts: 50,
    due: { type: 'today', date: null }, status: 'open',
    createdTs: Date.now(), claimedTs: null, approvedTs: null, ack: false,
  }, over);
  // 作成→ホーム表示→できた!→承認→加点→達成カード→ack
  const ms = mkMs({ title: '漢字ドリル1ページ' });
  p.missions.push(ms); w.eval('S').tab = 'home'; w.render();
  const app = () => doc.querySelector('#app').innerHTML;
  ok(app().includes('パパ・ママからの特別ミッション') && app().includes('漢字ドリル1ページ'), 'openミッションがホームにカード表示される');
  ok(app().includes('きょう中!'), '期限ラベル(きょう中!)が表示される');
  w.missionClaim(ms.id);
  eq(ms.status, 'claimed', 'できた!でclaimedになる');
  ok(ms.claimedTs != null, 'claimedTsが記録される');
  ok(app().includes('承認まち'), 'claimed中は承認まちがホームに見える');
  // せっていバッジ合算
  w.eval('S').tab = 'set'; w.render();
  ok(app().includes('承認まち 1'), 'せっていバッジにclaimed数が合算される');
  const before = p.points;
  w.judgeMission(ms.id, 1);
  eq(ms.status, 'approved', '承認でapprovedになる');
  eq(p.points, before + 50, '承認で固定ポイントが直接付与される');
  eq(ms.ack, false, 'ackは未読状態');
  w.eval('S').tab = 'home'; w.render();
  ok(app().includes('ミッションたっせい!'), '次のホームで達成カードが出る');
  w.missionAck(ms.id);
  ok(!app().includes('ミッションたっせい!'), 'ackで達成カードが消える');
  // 却下でopenに戻る
  const ms2 = mkMs({ title: 'おてつだい' });
  p.missions.push(ms2);
  w.missionClaim(ms2.id);
  w.judgeMission(ms2.id, 0);
  eq(ms2.status, 'open', '却下でopenに戻る(再挑戦可)');
  eq(ms2.claimedTs, null, '却下でclaimedTsがリセットされる');
  // 期限切れ: today期限は翌日expired
  const ms3 = mkMs({ title: 'きのうのミッション', createdTs: Date.now() - 864e5 });
  p.missions.push(ms3);
  w.checkMissionExpiry(p);
  eq(ms3.status, 'expired', 'today期限は翌日expiredになる');
  w.eval('S').tab = 'home'; w.render();
  ok(app().includes('きげんすぎちゃった'), '期限切れはグレー表示される');
  ms3.expiredTs = Date.now() - 4 * 864e5; w.render();
  ok(!app().includes('きげんすぎちゃった'), '期限切れは3日後に自動非表示');
  // week期限: 週の土曜23:59まで有効
  const wed = new Date(2026, 6, 15).getTime(); // 2026-07-15(水)
  const dueTs = w.missionDueTs({ createdTs: wed, due: { type: 'week' } });
  const sat = new Date(2026, 6, 18, 23, 59, 59).getTime(); // その週の土曜
  eq(dueTs, sat, 'week期限=その週の土曜23:59:59');
  const ms4 = mkMs({ title: 'せんしゅうのミッション', due: { type: 'week' }, createdTs: Date.now() - 8 * 864e5 });
  p.missions.push(ms4);
  w.checkMissionExpiry(p);
  eq(ms4.status, 'expired', '週をまたいだweek期限はexpiredになる');
  // 期限延長(dueBaseTs起点)で復活できる
  const ext = w.missionDueTs({ createdTs: Date.now() - 8 * 864e5, dueBaseTs: Date.now(), due: { type: 'today' } });
  ok(ext > Date.now() - 864e5, '期限延長はdueBaseTs(今日)起点で計算される');
  // date期限
  const ms5 = mkMs({ title: 'あしたまで', due: { type: 'date', date: new Date(Date.now() + 864e5).toISOString().slice(0, 10) } });
  p.missions.push(ms5);
  w.checkMissionExpiry(p);
  eq(ms5.status, 'open', '未来のdate期限はopenのまま');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 5. 既存回帰(スロット/承認/週サイクル) ---------- */
console.log('\n[5] 既存回帰');
{
  const { w, errors } = boot();
  const p = w.P();
  // 週サイクル
  eq(w.weekKeyFor(new Date(2026, 6, 15).getTime()), '2026-7-18', 'weekKeyFor: 水曜→その週の土曜');
  eq(w.weekKeyFor(new Date(2026, 6, 18).getTime()), '2026-7-18', 'weekKeyFor: 土曜→当日');
  eq(w.prevWeekKey('2026-7-18'), '2026-7-11', 'prevWeekKey');
  // 時間係数
  eq(w.coefFor(10), 0.3, 'coefFor: 15分未満は×0.3');
  eq(w.coefFor(30), 1, 'coefFor: 15〜44分は×1.0');
  eq(w.coefFor(50), 1.5, 'coefFor: 45分以上は×1.5');
  // ボーナス二重付与防止
  const wk = w.getWeek(p, '2026-7-18');
  ok(w.grantBonus(p, '2026-7-18', wk, 'plan', 'テスト', false) === true, 'grantBonus 初回は付与される');
  ok(w.grantBonus(p, '2026-7-18', wk, 'plan', 'テスト', false) === false, 'grantBonus 2回目は拒否(週grantedフラグ)');
  eq(p.bonusSpins.length, 1, 'bonusSpinsは1件のみ');
  eq(p.bonusSpins[0].id, 'bs-2026-7-18-plan', 'ボーナスIDは決定的(bs-<weekKey>-<kind>)');
  // セッション承認フロー
  p.sessions.unshift({ id: 'stest', base: 'home', plannedMin: 25, startTs: Date.now() - 25 * 60000, endTs: Date.now(), minutes: 25, subjects: ['算数'], memo: '', photoId: null, boards: [], focus: 'hi', status: 'pending', spin: null });
  w.judge('stest', 'approved');
  eq(p.sessions[0].status, 'approved', 'セッション承認が動く');
  eq(w.spinQueue(p).length, 1, '承認済み未スピンがスロット待ちに入る');
  // スロットを実際に回す(ボーナス承認込み)
  p.bonusSpins[0].status = 'approved';
  const ptsBefore = p.points;
  w.openSlots();
  ok(w.document.querySelector('#spin-btn'), 'スロットモーダルが開く');
  w.document.querySelector('#spin-btn').click();
  await sleep(1800);
  ok(p.sessions[0].spin != null, 'スピン結果がセッションに記録される');
  ok(p.points >= ptsBefore, 'ポイントが減らない(加算のみ)');
  ok(p.ledger.some(t => t.id === 'tx-spin-stest'), 'スピンが決定的IDで台帳に記録される');
  eq(p.points, p.ledger.reduce((a, t) => a + t.delta, 0), '残高=台帳合計');
  // ボーナス却下は削除でなく状態マーク
  const wk2 = w.getWeek(p, '2026-7-11');
  w.grantBonus(p, '2026-7-11', wk2, 'plan', 'テスト2', false);
  w.judgeBonus('bs-2026-7-11-plan', 0);
  const rej = p.bonusSpins.find(b => b.id === 'bs-2026-7-11-plan');
  ok(rej && rej.status === 'rejected', '却下ボーナスはrejectedマークで残る(マージで蘇らない)');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 7. 台帳・つうちょう・券(v13-a) ---------- */
console.log('\n[7] ⭐台帳・つうちょう・券');
{
  const { w, errors } = boot();
  const p = w.P();
  w.addLedger(p, 500, 'adjust', 'テスト付与');
  eq(p.points, 500, 'addLedgerで残高が動く');
  ok(w.addLedger(p, 100, 'slot', null, 'tx-fixed-1') === true, '決定的IDの初回は追加される');
  ok(w.addLedger(p, 100, 'slot', null, 'tx-fixed-1') === false, '同じ決定的IDは冪等(二重加算なし)');
  eq(p.points, 600, '冪等チェック後の残高が正しい');
  // 券の購入→使用(削除でなくusedTs)
  w.buyTicket(2); // パパと30分あそぶ券 300pt
  eq(p.points, 300, '券購入で減算される');
  eq(p.tickets.length, 1, '券がオブジェクトで追加される');
  ok(p.ledger.some(t => t.reason === 'shop' && t.delta === -300), '購入が台帳に記録される');
  w.useTicket(p.tickets[0].id);
  ok(p.tickets.length === 1 && p.tickets[0].usedTs, '「つかう」は削除でなく使用マーク(履歴が残る)');
  w.eval('S').tab = 'home'; w.render();
  ok(!w.document.querySelector('#app').innerHTML.includes('もっている券'), '使用済み券はホームに出ない');
  // つうちょうモーダル
  w.openLedger();
  const mr = w.document.querySelector('#modal-root').innerHTML;
  ok(mr.includes('ポイントつうちょう') && mr.includes('ちょうせい') && mr.includes('こうかんじょ'), 'つうちょうに取引が子ども語彙で並ぶ');
  w.closeModal();
  eq(p.points, p.ledger.reduce((a, t) => a + t.delta, 0), '残高=台帳合計');
  // ソース照合: points直書きが addLedger 内の1箇所だけ
  const writes = (html.match(/\.points\s*[+\-]=/g) || []).length;
  eq(writes, 1, 'p.points直書きはaddLedger内の1箇所のみ(grep照合)');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 8. mergeState シナリオ①〜⑩(A-5) ---------- */
console.log('\n[8] 🔀mergeState');
{
  const { w, errors } = boot();
  const clone = o => JSON.parse(JSON.stringify(o));
  const base = JSON.parse(w.eval('JSON.stringify(S)'));
  // 正規化stringify(キー順を揃えて比較)
  const sortk = v => Array.isArray(v) ? v.map(sortk)
    : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = sortk(v[k]), o), {}) : v;
  const canon = o => JSON.stringify(sortk(o));
  const mkSess = (id, over) => Object.assign({ id, base: 'home', plannedMin: 25, startTs: 1000, endTs: 2000, minutes: 25, subjects: ['算数'], memo: '', photoId: null, boards: [], focus: 'hi', status: 'pending', spin: null, mt: 10 }, over);

  // ① 片方だけ新セッション
  let A = clone(base), B = clone(base);
  A.profiles.sora.sessions.unshift(mkSess('s1'));
  let M = w.mergeState(A, B);
  ok(M.profiles.sora.sessions.some(s => s.id === 's1'), '①片方だけの新セッションが入る');

  // ② 同一セッションを両方で判定(mtが新しい方が勝つ)
  A = clone(base); B = clone(base);
  A.profiles.sora.sessions.unshift(mkSess('s2', { status: 'approved', mt: 200 }));
  B.profiles.sora.sessions.unshift(mkSess('s2', { status: 'rejected', mt: 300 }));
  M = w.mergeState(A, B);
  eq(M.profiles.sora.sessions.find(s => s.id === 's2').status, 'rejected', '②同一セッションの判定はmtが新しい方(却下)が勝つ');

  // ③ 同一セッションを両方でスピン → ledger 1件に収束
  A = clone(base); B = clone(base);
  A.profiles.sora.ledger.push({ id: 'tx-spin-s3', ts: 100, delta: 50, reason: 'slot', ref: null });
  B.profiles.sora.ledger.push({ id: 'tx-spin-s3', ts: 110, delta: 30, reason: 'slot', ref: null });
  M = w.mergeState(A, B);
  eq(M.profiles.sora.ledger.filter(t => t.id === 'tx-spin-s3').length, 1, '③二重スピンは台帳1件に収束');
  eq(M.profiles.sora.points, M.profiles.sora.ledger.reduce((a, t) => a + t.delta, 0), '③残高=台帳合計に再計算');

  // ④ 片方で券使用+片方で新規獲得
  A = clone(base); B = clone(base);
  const t1 = { id: 't1', name: '券1', ts: 1, usedTs: null, mt: 1 };
  A.profiles.sora.tickets = [Object.assign({}, t1, { usedTs: 500, mt: 500 })];
  B.profiles.sora.tickets = [clone(t1), { id: 't2', name: '券2', ts: 2, usedTs: null, mt: 2 }];
  M = w.mergeState(A, B);
  ok(M.profiles.sora.tickets.find(t => t.id === 't1').usedTs === 500, '④使用済みマークが残る');
  ok(M.profiles.sora.tickets.some(t => t.id === 't2'), '④新規獲得の券も残る');

  // ⑤ 同週に別端末で作戦とバトル
  A = clone(base); B = clone(base);
  A.profiles.sora.weeks['2026-7-18'] = { subjects: ['算数'], items: [], range: 'P1〜5', goal: '', planTs: 111, planMt: 111, testMt: 0, test: null, reviews: [], granted: { plan: 1 } };
  B.profiles.sora.weeks['2026-7-18'] = { subjects: [], items: [], range: '', goal: '', planTs: null, planMt: 0, testMt: 222, test: { total: 10, correct: 8, ts: 222, items: [{ subj: '算数', total: 10, correct: 8 }] }, reviews: [{ text: '算数', done: false }], granted: { test: 1 } };
  M = w.mergeState(A, B);
  const mw = M.profiles.sora.weeks['2026-7-18'];
  ok(mw.planTs === 111 && mw.subjects[0] === '算数', '⑤作戦ブロックが残る');
  ok(mw.test && mw.test.correct === 8, '⑤バトルブロックも残る');
  ok(mw.granted.plan === 1 && mw.granted.test === 1, '⑤grantedはOR');

  // ⑥ 両端末が独立に同種ボーナス発行 → 1件に収束
  A = clone(base); B = clone(base);
  A.profiles.sora.bonusSpins = [{ id: 'bs-2026-7-18-plan', reason: 'x', golden: false, status: 'pending', mt: 10 }];
  B.profiles.sora.bonusSpins = [{ id: 'bs-2026-7-18-plan', reason: 'x', golden: false, status: 'approved', mt: 20 }];
  M = w.mergeState(A, B);
  eq(M.profiles.sora.bonusSpins.length, 1, '⑥同種ボーナスは1件に収束');
  eq(M.profiles.sora.bonusSpins[0].status, 'approved', '⑥状態が進んだ方(mt新)が勝つ');

  // ⑦ 片方で模試削除 → 蘇らない
  A = clone(base); B = clone(base);
  const ex = { id: 'ex1', name: '模試', date: '2026-06-01', scores: { 総合: 55 }, memo: '', mt: 1 };
  A.profiles.sora.exams = []; A.profiles.sora.deleted = { ex1: 999 };
  B.profiles.sora.exams = [clone(ex)];
  M = w.mergeState(A, B);
  eq(M.profiles.sora.exams.length, 0, '⑦削除した模試はマージで蘇らない(墓標)');

  // ⑧ A端末で−800購入 + B端末で+50獲得
  A = clone(base); B = clone(base);
  A.profiles.sora.ledger.push({ id: 'tx-shop-a', ts: 1, delta: -800, reason: 'shop', ref: '大物' });
  B.profiles.sora.ledger.push({ id: 'tx-spin-b', ts: 2, delta: 50, reason: 'slot', ref: null });
  M = w.mergeState(A, B);
  eq(M.profiles.sora.points, -750, '⑧残高が台帳合計と一致(マイナスも台帳が真実)');

  // ⑨ 可換性 / ⑩ 冪等性(同期対象フィールドで比較)
  A = clone(base); B = clone(base);
  A.profiles.sora.sessions.unshift(mkSess('s9', { mt: 100 }));
  A.profiles.sora.ledger.push({ id: 'tx-spin-s9', ts: 5, delta: 50, reason: 'slot', ref: null });
  A.profiles.sora.deleted = { old1: 123 };
  B.profiles.sora.sessions.unshift(mkSess('s9b', { mt: 90 }));
  B.profiles.sora.ledger.push({ id: 'tx-spin-s9', ts: 6, delta: 30, reason: 'slot', ref: null });
  B.profiles.fuka.missions.push({ id: 'ms9', title: 'm', pts: 10, due: { type: 'today', date: null }, status: 'open', createdTs: 1, claimedTs: null, approvedTs: null, ack: false, mt: 1 });
  B.basesMt = 50; B.bases = base.bases.slice(0, 4);
  const M1 = w.mergeState(A, B), M2 = w.mergeState(B, A);
  eq(canon(w.syncable(M1)), canon(w.syncable(M2)), '⑨可換性: merge(a,b)≡merge(b,a)');
  const M3 = w.mergeState(M1, A);
  eq(canon(w.syncable(M3)), canon(w.syncable(M1)), '⑩冪等性: merge(m,a)≡m');

  // 端末ローカル項目は呼び出し側を維持
  A = clone(base); B = clone(base);
  A.gemini = { key: 'LOCAL', model: 'm1' }; B.gemini = { key: 'OTHER', model: 'm2' }; B.tab = 'ai';
  M = w.mergeState(A, B);
  ok(M.gemini.key === 'LOCAL' && M.tab === A.tab, 'gemini/tab等はマージ対象外(ローカル維持)');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 9. ☁️かぞく同期エンジン(v13-b / モックtransport) ---------- */
console.log('\n[9] ☁️かぞく同期');
{
  // config未設定相当(FB_CONFIG_TEST={}で本番configを無効化): 同期UIは「じゅんび中」・他機能は従来どおり
  const { w, errors } = boot();
  w.FB_CONFIG_TEST = {};
  w.openParent();
  ok(w.document.querySelector('#modal-root').innerHTML.includes('じゅんび中'), 'config空なら同期セクションは「じゅんび中」');
  w.closeModal();
  eq(errors.length, 0, 'config空でも runtime errors: none');
  w.close();
}
{
  const { w, errors } = boot();
  w.FB_CONFIG_TEST = { apiKey: 'test', databaseURL: 'https://test' }; // テスト用フック
  const mock = {
    started: null, onRemote: null, node: null, pushes: 0,
    start(code, cb) { this.started = code; this.onRemote = cb; return Promise.resolve(); },
    stop() { this.started = null; },
    push(fn) { this.pushes++; this.node = fn(this.node); return Promise.resolve(); },
  };
  w.setSyncTransport(mock);
  // はじめる(1台目)
  w.syncStart();
  await sleep(80);
  const code = w.eval('sync.code');
  ok(/^[a-z2-7]{26}$/.test(code), '家族コードは26文字のbase32');
  eq(mock.started, code, 'transportが家族コードで接続される');
  ok((w.localStorage.getItem('studykichi_sync') || '').includes(code), 'コードは別キーstudykichi_syncに保存');
  ok(!JSON.stringify(w.eval('S')).includes(code), 'コードはS(=バックアップJSON)に含まれない');
  await sleep(80);
  eq(mock.pushes, 1, '接続時にローカルを初回push');
  ok(mock.node && typeof mock.node.state === 'string' && mock.node.meta.rev === 1, 'クラウドはstate文字列+meta.rev');
  w.closeModal();
  // 2秒デバウンスpush: 連続保存でも1回にまとまる
  const p = w.P();
  p.missions.push({ id: 'msA', title: 'ローカルミッション', pts: 10, due: { type: 'today', date: null }, status: 'open', createdTs: Date.now(), claimedTs: null, approvedTs: null, ack: false, mt: 1 });
  w.save(); w.save(); w.save();
  eq(mock.pushes, 1, 'デバウンス中はまだpushされない');
  await sleep(2300);
  eq(mock.pushes, 2, '2秒デバウンスで1回だけpush');
  ok(mock.node.state.includes('msA') && mock.node.meta.rev === 2, '変更がクラウドに反映されrevが進む');
  // Pull: クラウド由来の新データを取り込み(ローカル項目は維持)。エコーではpushしない
  w.eval('S').gemini.key = 'LOCAL-KEY';
  const rem = JSON.parse(mock.node.state);
  rem.profiles.sora.sessions.unshift({ id: 's-remote', base: 'home', plannedMin: 25, startTs: 3000, endTs: 4000, minutes: 25, subjects: ['国語'], memo: '', photoId: null, boards: [], focus: null, status: 'pending', spin: null, mt: 5 });
  mock.onRemote({ state: w.stableStr(rem), meta: { rev: 3, updatedAt: Date.now() } });
  await sleep(50);
  ok(w.P().sessions.some(s => s.id === 's-remote'), '受信したセッションが取り込まれる');
  eq(w.eval('S').gemini.key, 'LOCAL-KEY', 'APIキー等のローカル項目は維持される');
  const pushesBefore = mock.pushes;
  await sleep(2300);
  eq(mock.pushes, pushesBefore, 'クラウドが上位集合なら送り返さない(ループ防止)');
  // 送り返し: クラウドにこちらだけのデータが無い場合はpush
  const rem2 = JSON.parse(mock.node.state);
  delete rem2.profiles.sora.missions; rem2.profiles.sora.missions = [];
  mock.onRemote({ state: w.stableStr(rem2), meta: { rev: 4, updatedAt: Date.now() } });
  await sleep(2300);
  ok(mock.pushes > pushesBefore && mock.node.state.includes('msA'), 'こちらだけが持つ分は送り返して収束');
  // 描画ポリシー: モーダル中はrenderせず、閉じたら反映
  w.eval('S').tab = 'home'; w.render();
  w.openModal('<h3>編集中</h3>');
  const rem3 = JSON.parse(mock.node.state);
  rem3.profiles.sora.sessions.unshift({ id: 's-remote2', base: 'home', plannedMin: 5, startTs: 5000, endTs: 6000, minutes: 5, subjects: [], memo: '', photoId: null, boards: [], focus: null, status: 'pending', spin: null, mt: 6 });
  const appBefore = w.document.querySelector('#app').innerHTML;
  mock.onRemote({ state: w.stableStr(rem3), meta: { rev: 5, updatedAt: Date.now() } });
  ok(w.document.querySelector('#app').innerHTML === appBefore, 'モーダル表示中はrenderしない(入力を壊さない)');
  ok(w.P().sessions.some(s => s.id === 's-remote2'), 'Sは更新されている');
  ok(w.document.querySelector('#modal-root').innerHTML.includes('編集中'), 'モーダルは開いたまま');
  w.closeModal();
  ok(w.document.querySelector('#modal-root').innerHTML === '', 'モーダルが閉じる');
  // 切断
  w.syncDisconnect();
  ok(w.eval('sync.code') === null && mock.started === null, '切断でコード破棄+transport停止');
  w.closeModal();
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 10. パパ・ママモードの折りたたみ整理 ---------- */
console.log('\n[10] 👨親モードUI');
{
  const { w, errors } = boot();
  const p = w.P();
  p.sessions.unshift({ id: 'sp1', base: 'home', plannedMin: 25, startTs: 1, endTs: 2, minutes: 25, subjects: [], memo: '', photoId: null, boards: [], focus: null, status: 'pending', spin: null, mt: 1 });
  w.openParent();
  const mr = () => w.document.querySelector('#modal-root');
  eq(mr().querySelectorAll('details.pd').length, 8, '8つの折りたたみセクションがある');
  const ap = mr().querySelector('#pd-approve');
  ok(ap && ap.open, '承認センターは初期展開');
  ok(ap.innerHTML.includes('承認まちはありません') === false && ap.innerHTML.includes('セッション(1)'), '承認センターに件数が出る');
  ok(mr().innerHTML.includes('承認まち 1'), 'サマリに承認まちバッジ');
  for (const id of ['pd-mission', 'pd-reward', 'pd-remind', 'pd-ctx', 'pd-member', 'pd-sync', 'pd-sys']) {
    const d = mr().querySelector('#' + id);
    ok(d && !d.open, id + ' は初期折りたたみ');
  }
  // 主要インプットが全部残っているか(機能不変の確認)
  for (const sel of ['#ms-title', '#pool-new', '#tgt-label', '#book-new', '[data-pf-nm="sora"]', '[data-bs-nm="0"]', '#gm-key', '#pin-chg', '#adj-delta']) {
    ok(!!mr().querySelector(sel), '入力が存在: ' + sel);
  }
  ok(mr().innerHTML.includes('まとめて保存'), 'まとめて保存ボタンがある');
  w.closeModal();
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 11. v15(ガイド・汎用デフォルト・折りたたみ・フィードバック) ---------- */
console.log('\n[11] 🎈v15');
{
  const { w, errors } = boot();
  ok(w.document.querySelector('#modal-root').innerHTML.includes('ようこそ、スタディきちへ'), '初回はガイドが自動表示され、1枚目は世界観の宣言');
  w.showGuide(1);
  ok(w.document.querySelector('#modal-root').innerHTML.includes('しゅつげき'), '2枚目からは今までどおりの操作ガイド');
  eq(w.localStorage.getItem('studykichi_guide'), '1', '表示済みフラグが端末ローカルに立つ');
  w.showGuide(4);
  ok(w.document.querySelector('#modal-root').innerHTML.includes('保護者の方へ'), '最終ページに保護者向け案内');
  w.closeModal();
  const St = w.eval('S');
  eq(St.profiles.sora.name, 'そら', 'デフォルト名「そら」');
  eq(St.profiles.fuka.name, 'ふう', 'デフォルト名「ふう」');
  ok(St.bases.some(b => b.name === 'としょかん') && St.bases.some(b => b.name === 'きちカフェ'), 'きち初期値が汎用化');
  ok(St.profiles.sora.pool[0].name.includes('レストラン'), 'ごほうび券サンプルが汎用化');
  eq(w.document.title, 'スタディきち', 'タブタイトルが汎用化');
  w.eval('S').tab = 'set'; w.render();
  const app = () => w.document.querySelector('#app').innerHTML;
  ok(app().includes('そら ＆ ふう ＆ パパ'), 'せっていにクレジット表記');
  ok(app().includes('つかいかたガイド'), 'ガイド再表示ボタンがある');
  ok(!!w.document.querySelector('#app details.pd'), 'せってい「アプリとしてつかう」が折りたたみ');
  const p = w.P();
  p.weeks['2026-7-11'] = { subjects: ['算数'], items: [], range: 'x', goal: '', planTs: 1, planMt: 1, testMt: 0, test: null, reviews: [], granted: {} };
  w.eval('S').tab = 'goal'; w.render();
  ok(app().includes('まいしゅうの きろく(1)'), 'まいしゅうのきろくが折りたたみ+件数表示');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  // 表示済みガイドは出ない/既存データは汎用デフォルト化の影響を受けない
  const old = { v: 5, currentProfile: 'sora', bases: [{ id: 'solid', name: 'ソリッドスクエア', em: '🏢' }], planRemind: { on: 0, day: 0, max: 3 },
    profiles: { sora: { name: '空花', em: '🌸', grade: '小5', points: 0, sessions: [], exams: [], chat: [], pool: [], tickets: [], weeks: {}, bonusSpins: [], books: [] } } };
  const { w, errors } = boot(old, { studykichi_guide: '1' });
  eq(w.document.querySelector('#modal-root').innerHTML, '', '表示済みならガイドは出ない');
  eq(w.P().name, '空花', '既存メンバー名は上書きされない');
  eq(w.eval('S').bases[0].name, 'ソリッドスクエア', '既存のきちは上書きされない');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  // 📮フィードバック(UI・バリデーション・1日1回制限)
  const { w, errors, alerts } = boot(undefined, { studykichi_guide: '1' });
  w.openParent();
  ok(w.document.querySelector('#modal-root').innerHTML.includes('かいはつ者への感想・要望'), 'フィードバック欄が保護者モードにある');
  w.sendFeedback();
  ok(alerts.some(a => a.includes('内容を入力')), '空送信はバリデーションで止まる');
  w.localStorage.setItem('studykichi_fb_ts', String(Date.now()));
  w.document.querySelector('#fb-good').value = 'テストの感想';
  w.sendFeedback();
  ok(alerts.some(a => a.includes('1日1回')), '連投は1日1回制限で止まる');
  w.closeModal();
  // かぞくコードのコピー導線(モックtransportで接続してから確認)
  w.FB_CONFIG_TEST = { apiKey: 'test', databaseURL: 'https://test' };
  w.setSyncTransport({ start() { return Promise.resolve(); }, stop() {}, push(fn) { this.node = fn(this.node); return Promise.resolve(); } });
  w.syncStart();
  await sleep(80);
  w.syncShowCode();
  ok(w.document.querySelector('#modal-root').innerHTML.includes('📋 コピー'), 'かぞくコードにコピーボタン');
  w.closeModal();
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 12. saveParent: 未編集のmetaMt/basesMtを進めない(家族同期の上書き事故・再発防止) ----------
   実障害: まとめて保存が全プロフィール+きちに一律スタンプ→未編集端末のデフォルト値がLWWで本物に勝ち、
   名前・きち・ごほうび・目標・テキストが上書きされた */
console.log('\n[12] 🔒saveParent×同期');
{
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const St = w.eval('S');
  St.profiles.sora.metaMt = 111; St.profiles.fuka.metaMt = 222; St.basesMt = 333;
  // 何も編集せず「まとめて保存」
  w.openParent();
  w.saveParent();
  eq(St.profiles.sora.metaMt, 111, '未編集: soraのmetaMtが進まない');
  eq(St.profiles.fuka.metaMt, 222, '未編集: fukaのmetaMtが進まない');
  eq(St.basesMt, 333, '未編集: basesMtが進まない');
  // soraの名前だけ編集
  w.openParent();
  w.document.querySelector('[data-pf-nm="sora"]').value = '空花';
  w.saveParent();
  ok(St.profiles.sora.metaMt > 111, '編集したsoraのmetaMtは進む');
  eq(St.profiles.fuka.metaMt, 222, '編集していないfukaのmetaMtは進まない');
  eq(St.basesMt, 333, 'きち未編集ならbasesMtは進まない');
  // きちの名前だけ編集
  w.openParent();
  w.document.querySelector('[data-bs-nm="0"]').value = 'ソリッドスクエア';
  w.saveParent();
  ok(St.basesMt > 333, 'きちを編集したらbasesMtが進む');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  // 事故シナリオ直撃: 未編集端末(全部デフォルト・mt0) × 実データ端末(旧v3移行相当・mt0)の同点マージ
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const clone = o => JSON.parse(JSON.stringify(o));
  const sortk = v => Array.isArray(v) ? v.map(sortk)
    : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = sortk(v[k]), o), {}) : v;
  const canon = o => JSON.stringify(sortk(o));
  const base = JSON.parse(w.eval('JSON.stringify(S)'));
  const fresh = clone(base); // デフォルトのまま・metaMt/basesMt/pinMt=0(修正後はもうスタンプされない)
  const real = clone(base);  // v3バックアップをmigrateした直後の形(実データだがmt=0)
  real.parentPin = '1975';
  real.profiles.sora.name = '空花';
  real.profiles.sora.books = ['基本トレーニング計算📏'];
  real.profiles.sora.pool = [{ name: '小籠包ディナー券 🥟', price: 800 }];
  real.bases = [{ id: 'solid', name: 'ソリッドスクエア', em: '🏢' }];
  const M1 = w.mergeState(clone(fresh), clone(real));
  const M2 = w.mergeState(clone(real), clone(fresh));
  eq(M1.profiles.sora.name, '空花', 'mt同点: デフォルトの名前が本物に負ける');
  eq(M1.profiles.sora.books[0], '基本トレーニング計算📏', 'mt同点: テキストが守られる');
  eq(M1.profiles.sora.pool[0].name, '小籠包ディナー券 🥟', 'mt同点: ごほうび券カタログが守られる');
  eq(M1.bases[0].name, 'ソリッドスクエア', 'mt同点: デフォルトのきちが本物に負ける');
  eq(M1.parentPin, '1975', 'mt同点: 未設定PIN(null)が設定済みPINに負ける');
  eq(canon(w.syncable(M1)), canon(w.syncable(M2)), 'mt同点マージも可換(push無限ループしない)');
  const M3 = w.mergeState(clone(M1), clone(real));
  eq(canon(w.syncable(M3)), canon(w.syncable(M1)), 'mt同点マージも冪等');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 13. 🔐親PINの同期除外 + 📷写真プレースホルダ ---------- */
console.log('\n[13] 🔐PIN同期除外 + 📷写真');
{
  // 親PINはクラウドに載せない・受け取っても適用しない(端末ローカル)
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  w.FB_CONFIG_TEST = { apiKey: 'test', databaseURL: 'https://test' };
  const mock = {
    node: null, pushes: 0,
    start(code, cb) { this.onRemote = cb; return Promise.resolve(); },
    stop() {},
    push(fn) { this.pushes++; this.node = fn(this.node); return Promise.resolve(); },
  };
  w.setSyncTransport(mock);
  w.eval('S').parentPin = '7777'; w.eval('S').pinMt = 111;
  w.syncStart();
  await sleep(120);
  ok(mock.node && !mock.node.state.includes('parentPin') && !mock.node.state.includes('7777'), '親PINはクラウドstateに含まれない');
  w.closeModal();
  // 旧バージョンのクラウドに親PINが残っていても取り込まない
  const rem = JSON.parse(mock.node.state);
  rem.parentPin = '9999'; rem.pinMt = 9999999999999;
  mock.onRemote({ state: w.stableStr(rem), meta: { rev: 2, updatedAt: Date.now() } });
  await sleep(50);
  eq(w.eval('S').parentPin, '7777', '旧クラウドの親PINを受信してもこの端末のPINを維持');
  // syncableの除外リスト(コード照合)
  ok(w.syncable(w.eval('S')).parentPin === undefined, 'syncable()がparentPinを除外する');
  ok(w.syncable(w.eval('S')).pinMt === undefined, 'syncable()がpinMtを除外する');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  // 写真がこの端末に無いとき(他端末で撮影/復元直後)はプレースホルダ表示
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const p = w.P();
  p.sessions.unshift({ id: 'sph', base: 'home', plannedMin: 25, startTs: 1, endTs: 2, minutes: 25, subjects: ['算数'], memo: '', photoId: 'p-not-here', boards: ['m-not-here'], focus: 'hi', status: 'approved', spin: null, mt: 1 });
  w.eval('S').tab = 'rec'; w.render();
  await sleep(120);
  const misses = w.document.querySelectorAll('.thumb-miss');
  eq(misses.length, 2, '写真・計算メモの両方がプレースホルダになる(こわれた画像を出さない)');
  eq(misses[0].textContent, '📷', 'プレースホルダは📷マーク');
  ok(!w.document.querySelector('img[data-photo]'), 'src無しの壊れたimgが残らない');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 14. 👨親モードの連続入力(折りたたみ・カーソル維持) ----------
   実障害: 追加のたびにopenParent()でモーダルを作り直すため、開いていたセクションが閉じ
   カーソルも外れて、テキストや券を続けて登録できなかった */
console.log('\n[14] 👨親モード 連続入力');
{
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const doc = w.document;
  const mr = () => doc.querySelector('#modal-root');
  w.openParent();
  ok(mr().querySelector('#pd-approve').open && !mr().querySelector('#pd-reward').open, '初回オープンは既定の開閉状態');
  // 📚テキストを続けて登録
  mr().querySelector('#pd-reward').open = true;
  doc.querySelector('#book-new').value = '予習シリーズ 算数(上)';
  w.addBook();
  ok(mr().querySelector('#pd-reward').open, 'テキスト追加後もセクションが開いたまま');
  ok(!mr().querySelector('#pd-member').open, '閉じていたセクションは閉じたまま');
  eq(doc.activeElement.id, 'book-new', '追加後は入力欄にカーソルが戻る(続けて打てる)');
  eq(doc.querySelector('#book-new').value, '', '入力欄は空になっている');
  doc.querySelector('#book-new').value = '基本トレーニング計算';
  w.addBook();
  eq(w.P().books.length, 2, '2つめも続けて登録できる');
  ok(mr().querySelector('#pd-reward').open, '2回目もセクションが開いたまま');
  w.delBook(0);
  ok(mr().querySelector('#pd-reward').open, '削除でもセクションが開いたまま');
  eq(w.P().books.length, 1, '削除が反映される');
  // 🎟️ごほうび券でも同じ
  doc.querySelector('#pool-new').value = '回転ずし券 🍣';
  doc.querySelector('#pool-price').value = '600';
  w.addPool();
  ok(mr().querySelector('#pd-reward').open, '券の追加でもセクションが開いたまま');
  eq(doc.activeElement.id, 'pool-new', '券追加後も入力欄にカーソルが戻る');
  // 🎯ミッションでも同じ(複数セクションの開閉が同時に保たれる)
  mr().querySelector('#pd-mission').open = true;
  doc.querySelector('#ms-title').value = 'おてつだい';
  doc.querySelector('#ms-pts').value = '20';
  w.addMission();
  ok(mr().querySelector('#pd-mission').open && mr().querySelector('#pd-reward').open, 'ミッション追加でも開閉状態が保たれる');
  eq(doc.activeElement.id, 'ms-title', 'ミッション追加後も入力欄にカーソルが戻る');
  // 🗺️きち・メンバーの追加でも維持
  mr().querySelector('#pd-member').open = true;
  w.addBase();
  ok(mr().querySelector('#pd-member').open, 'きち追加でもセクションが開いたまま');
  w.closeModal();
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 15. 🚀FAB(ホーム以外からの近道 / しゅつげき中のタイマー復帰) ---------- */
console.log('\n[15] 🚀FAB');
{
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const doc = w.document;
  const fab = () => doc.querySelector('#fab-wrap');
  eq(fab().innerHTML, '', 'ホームではFABを出さない(きち一覧があるため)');
  ok(!doc.body.classList.contains('has-fab'), 'ホームでは下余白を広げない');
  w.go('rec');
  ok(fab().innerHTML.includes('しゅつげき'), 'きろくタブに🚀しゅつげきFABが出る');
  ok(doc.body.classList.contains('has-fab'), 'FAB表示中は下余白を広げる(最後のカードに かぶらない)');
  w.fabBases();
  ok(doc.querySelector('#modal-root').innerHTML.includes('どの きちで'), 'FABできち選択モーダルが開く');
  w.pickBase('home', 1);
  ok(doc.querySelector('#modal-root').innerHTML.includes('えらびなおす'), 'FAB経由の分数えらびに「もどる」がある');
  w.pickBase('home');
  ok(!doc.querySelector('#modal-root').innerHTML.includes('えらびなおす'), 'ホームからの分数えらびには出ない(従来どおり)');
  w.startSession(25);
  eq(w.eval('S').tab, 'home', 'しゅつげき開始でホームへ');
  ok(w.eval('S').activeSession != null, 'セッションが始まっている');
  eq(fab().innerHTML, '', 'ホームのタイマー画面ではFABを出さない');
  // しゅつげき中に他タブへ行くとタイマーが見えなくなる問題をFABが埋める
  w.go('ai');
  ok(fab().innerHTML.includes('タイマーにもどる'), 'しゅつげき中は⏱タイマーにもどるFABになる');
  ok(fab().querySelector('.fab.run'), 'しゅつげき中はFABの見た目が変わる');
  fab().querySelector('.fab').dispatchEvent(new w.Event('click', { bubbles: true }));
  eq(w.eval('S').tab, 'home', 'FABでホームのタイマーに戻れる');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 16. 📅さくせん会議リマインダー(v17) ---------- */
console.log('\n[16] 📅さくせん会議リマインダー');
{
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const St = w.eval('S');
  const mr = () => w.document.querySelector('#modal-root').innerHTML;
  eq(St.planRemind.day, 0, '既定は日曜から');
  eq(St.planRemind.max, 3, '既定は3回まで');
  eq(St.planRemind.on, 1, '既定はON');
  // 起動時に1回出る(day=今日の曜日にして曜日ゲートを確実に通す)
  ok(mr().includes('さくせん会議'), '作戦が未設定なら起動時に声をかける');
  ok(!mr().includes('まだ') || !mr().includes('サボ'), 'せかす・責める文言を出さない');
  eq(w.nudgeLoad()[w.eval('S.currentProfile') + '|' + w.planTargetKey()].n, 1, '表示回数が1になる');
  // 同じ日に2回目は出ない
  w.closeModal();
  w.maybePlanNudge();
  eq(mr(), '', 'きょうはもう出したので2回目は出ない');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const St = w.eval('S');
  const today = new Date().getDay();
  const mr = () => w.document.querySelector('#modal-root').innerHTML;
  const key = w.planTargetKey();
  const nk = () => w.eval('S.currentProfile') + '|' + key;
  w.closeModal();
  // 回数の上限で止まる
  St.planRemind.day = today; // 曜日ゲートは通す
  w.nudgeSave({ [nk()]: { n: 3, d: '' } });
  w.maybePlanNudge();
  eq(mr(), '', '3回出しきったら止まる(来週まで待つ)');
  w.nudgeSave({ [nk()]: { n: 1, d: '' } });
  w.maybePlanNudge();
  ok(mr().includes('さくせん会議'), '上限前なら日をあらためて出る');
  w.closeModal();
  // 作戦をたてたら即停止
  w.nudgeSave({ [nk()]: { n: 1, d: '' } });
  w.getWeek(w.P(), key).planTs = Date.now();
  w.maybePlanNudge();
  eq(mr(), '', '作戦をたてたら止まる');
  w.getWeek(w.P(), key).planTs = null;
  // OFFなら出ない
  w.nudgeSave({ [nk()]: { n: 0, d: '' } });
  St.planRemind.on = 0;
  w.maybePlanNudge();
  eq(mr(), '', 'OFFなら出ない');
  St.planRemind.on = 1;
  // 設定曜日より前は出ない(未来の曜日を指定して判定を確認)
  St.planRemind.day = 6;
  ok(w.planNudgeDue(new Date(2026, 6, 20).getTime()) === null, '設定曜日(土)より前の月曜には出ない');
  ok(w.planNudgeDue(new Date(2026, 6, 25).getTime()) !== null, '設定曜日(土)当日には出る');
  St.planRemind.day = today;
  // 割り込まない条件
  w.eval('S').activeSession = { base: 'home', plannedMin: 25, startTs: Date.now(), boards: [] };
  w.maybePlanNudge();
  eq(mr(), '', 'しゅつげき中は割り込まない');
  w.eval('S').activeSession = null;
  // もくひょうタブ: 作戦カードが見えているのでモーダルではなく カードを光らせて場所を教える
  w.eval('S').tab = 'goal'; w.render();
  w.nudgeSave({ [nk()]: { n: 0, d: '' } });
  w.maybePlanNudge();
  eq(mr(), '', 'もくひょうタブではモーダルを出さない');
  ok(w.document.querySelector('#plan-card').classList.contains('flash'), '代わりに作戦カードが光って場所を教える');
  w.eval('S').tab = 'home';
  w.openModal('<h3>べつのモーダル</h3>');
  w.maybePlanNudge();
  ok(mr().includes('べつのモーダル'), '他のモーダル表示中は割り込まない');
  w.closeModal();
  // 「さくせんをたてる」でもくひょうタブへ
  w.nudgeSave({ [nk()]: { n: 0, d: '' } });
  w.maybePlanNudge();
  ok(mr().includes('さくせんをたてる'), 'さくせんをたてるボタンがある');
  w.goPlan();
  eq(w.eval('S').tab, 'goal', 'ボタンでもくひょうタブへ移動する');
  eq(mr(), '', 'モーダルは閉じる');
  ok(w.document.querySelector('#plan-card'), '作戦カードにジャンプ先のidがある');
  // 回数カウンタは端末ローカル(同期データ・バックアップJSONを汚さない)
  ok(!JSON.stringify(w.eval('S')).includes('studykichi_nudge'), 'カウンタはSに入らない');
  ok(w.syncable(w.eval('S')).planRemind != null, 'リマインダー設定は同期される');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  // 設定UI + migrate + マージ(LWW / 同点は既定値が負ける)
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  w.closeModal();
  w.openParent();
  const doc = w.document;
  ok(doc.querySelector('#pd-remind'), 'パパ・ママモードにリマインダーのセクションがある');
  ok(doc.querySelector('#rm-on') && doc.querySelector('#rm-day') && doc.querySelector('#rm-max'), 'ON/曜日/回数の3つを設定できる');
  doc.querySelector('#rm-day').value = '3';
  w.setPlanRemind();
  eq(w.eval('S').planRemind.day, 3, '曜日の変更が即反映される');
  ok(w.eval('S').planRemindMt > 0, '変更で更新時刻が打たれる(同期のLWW用)');
  const mtAfter = w.eval('S').planRemindMt;
  w.setPlanRemind();
  eq(w.eval('S').planRemindMt, mtAfter, '変更がなければ更新時刻は進まない');
  w.closeModal();
  // migrate: 旧データ・壊れた値の防御
  const st = { profiles: {}, planRemind: { on: 1, day: 99, max: 99 } };
  w.migrate(st);
  eq(st.planRemind.day, 6, '範囲外の曜日は上限に丸められる(import防御)');
  eq(st.planRemind.max, 5, '範囲外の回数は上限に丸められる(import防御)');
  const st0 = { profiles: {}, planRemind: { on: 1, day: -5, max: 0 } };
  w.migrate(st0);
  eq(st0.planRemind.day, 0, '負の曜日は0に丸められる');
  eq(st0.planRemind.max, 3, '0回など不正な回数は既定の3に戻る(OFFにしたいときはonで切る)');
  const st2 = { profiles: {} };
  w.migrate(st2);
  eq(st2.planRemind.day, 0, '旧データには既定値が付与される');
  // マージ: mt同点なら「既定値のままの側」が負ける + 可換
  const clone = o => JSON.parse(JSON.stringify(o));
  const base = JSON.parse(w.eval('JSON.stringify(S)'));
  const fresh = clone(base); fresh.planRemind = { on: 1, day: 0, max: 3 }; fresh.planRemindMt = 0;
  const real = clone(base); real.planRemind = { on: 0, day: 4, max: 2 }; real.planRemindMt = 0;
  eq(w.mergeState(clone(fresh), clone(real)).planRemind.day, 4, 'mt同点: 既定値のままの側が負ける');
  eq(w.mergeState(clone(real), clone(fresh)).planRemind.day, 4, 'mt同点マージも可換');
  const newer = clone(base); newer.planRemind = { on: 1, day: 5, max: 5 }; newer.planRemindMt = 9999;
  eq(w.mergeState(clone(real), clone(newer)).planRemind.day, 5, 'mtが新しい方が勝つ');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 17. v19: プロフィール切替の合図 / 文言 / PIN入力の自動入力抑止 ---------- */
console.log('\n[17] 🔁切替の合図・文言・PIN入力');
{
  // 実報告: そら→ふう に切り替えたときに出ないことがあった(もくひょうタブにいると抑止されていた)
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const mr = () => w.document.querySelector('#modal-root').innerHTML;
  w.closeModal();
  const today = new Date().getDay();
  w.eval('S').planRemind.day = today;
  // ホームタブでの切替 → 新しいプロフィール宛てに出る
  w.eval('S').tab = 'home'; w.render();
  w.switchProfile('fuka');
  eq(w.eval('S').currentProfile, 'fuka', 'ふうに切り替わる');
  ok(mr().includes('さくせん会議'), 'プロフィール切替でも(そのメンバーの作戦がまだなら)声をかける');
  w.closeModal();
  // 切替先ごとに回数を数える(そらで出したぶんが ふうの回数を消費しない)
  const all = w.nudgeLoad();
  ok(Object.keys(all).some(k => k.startsWith('fuka|')), 'ふうの回数が別に記録される');
  // もくひょうタブでの切替 → モーダルではなくカードが光る
  w.eval('S').tab = 'goal'; w.render();
  w.nudgeSave({});
  w.switchProfile('sora');
  eq(mr(), '', 'もくひょうタブではモーダルを出さない');
  ok(w.document.querySelector('#plan-card').classList.contains('flash'), 'もくひょうタブでは作戦カードが光る(切替でも合図が出る)');
  // 文言: せかす・責める表現を使わない
  w.eval('S').tab = 'home'; w.render();
  w.nudgeSave({});
  w.maybePlanNudge();
  ok(mr().includes('パパ・ママに みせよう'), 'つくる動機になる文言になっている');
  ok(!mr().includes('まだだよ'), 'できていないことを指摘する文言を使わない');
  w.closeModal();
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  // PIN入力: パスワードマネージャーの保存候補・自動入力を出させない
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  w.closeModal();
  w.eval('S').parentPin = '1975';
  w.parentGate();
  const el = w.document.querySelector('#pin-in');
  ok(el, '親PINの入力欄がある');
  ok(el.type !== 'password' || !w.PIN_MASK, 'マスク表示できる環境では type=password を使わない');
  eq(el.getAttribute('autocomplete'), 'off', '自動入力を切っている');
  eq(el.getAttribute('inputmode'), 'numeric', '数字キーボードが出る');
  eq(el.getAttribute('maxlength'), '4', '4けた制限は維持');
  ok(!el.getAttribute('name'), 'パスワード欄と誤認されるname属性を付けない');
  if (w.PIN_MASK) ok(el.classList.contains('pin-mask'), 'CSSでマスク表示する');
  ok(w.pinInput('x').indexOf('data-lpignore') >= 0, '他のパスワード管理ツールにも無視させる');
  // PINそのものは今までどおり機能する
  el.value = '1975';
  w.checkPin();
  ok(w.document.querySelector('#modal-root').innerHTML.includes('パパ・ママモード'), '正しいPINでひらける');
  w.closeModal();
  // 子どものPIN・PIN変更欄にも同じ生成関数を使っている
  ok(w.showWhoModal.toString().length > 0 && w.whoPick.toString().indexOf('pinInput') >= 0, 'こどもPINにも同じ入力を使う(コード照合)');
  ok(w.openParent.toString().indexOf("pinInput('pin-chg'") >= 0, 'PIN変更欄にも同じ入力を使う(コード照合)');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 18. 🤖Personal Context(v20) ---------- */
console.log('\n[18] 🤖Personal Context');
{
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const doc = w.document;
  w.closeModal();
  const p = w.P();
  // 既定は空 → 今までどおりのプロンプト(余計なものを足さない)
  eq(p.context.about, '', '既定は空');
  eq(w.ctxPrompt(p), '', '空なら何も足さない(従来どおりの動作)');
  // 保護者モードで入力 → まとめて保存
  w.openParent();
  ok(doc.querySelector('#pd-ctx'), 'パパ・ママモードにPersonal Contextのセクションがある');
  ok(doc.querySelector('#pd-ctx').innerHTML.includes('Google'), '送信先とクラウド保存の注意が書いてある');
  ok(doc.querySelector('#pd-ctx').innerHTML.includes('個人が特定できる情報'), '個人情報を書かない注意がある');
  const before = p.metaMt;
  doc.querySelector('#ctx-about').value = '負けずぎらい。算数のひらめき問題が好き';
  doc.querySelector('#ctx-now').value = 'しゅうがく旅行に行っている';
  doc.querySelector('#ctx-until').value = '2026-07-24';
  w.saveParent();
  eq(w.P().context.about, '負けずぎらい。算数のひらめき問題が好き', '長期の情報が保存される');
  eq(w.P().context.nowUntil, '2026-07-24', '期限が保存される');
  ok(w.P().metaMt > before, '編集したのでmetaMtが進む(同期のLWW用)');
  eq(w.eval('S').profiles.fuka.metaMt, 0, '編集していないメンバーのmetaMtは進まない');
  // 期限の内/外
  const inTerm = new Date(2026, 6, 23).getTime(), afterTerm = new Date(2026, 6, 26).getTime();
  ok(w.ctxNowActive(w.P(), inTerm), '期限内は「いまのできごと」が有効');
  ok(!w.ctxNowActive(w.P(), afterTerm), '期限をすぎたら会話に使わない');
  ok(w.ctxNowJustEnded(w.P(), afterTerm), '終わった直後は「おかえり」の対象');
  ok(!w.ctxNowJustEnded(w.P(), new Date(2026, 7, 10).getTime()), '1週間すぎたら「おかえり」は言わない(今さら感を出さない)');
  ok(!w.ctxNowJustEnded(w.P(), inTerm), '期限内は「おかえり」にならない');
  // プロンプトへの注入
  const sp = w.sysPrompt(w.P());
  ok(sp.includes('負けずぎらい'), 'チャットのプロンプトに長期の情報が入る');
  ok(sp.includes('責めたりしない'), '責めない指示が入る');
  ok(sp.includes('パパ・ママから聞いた') , '出どころを本人に言わない指示が入る');
  ok(w.makeReport.toString().includes('この時期のできごと'), '週次レポートにもできごとを渡す(コード照合)');
  ok(w.makeReport.toString().includes('この子について'), '週次レポートに長期の情報も渡す(コード照合)');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  // 👋カムバックナッジ: 終わった翌日に1回だけ
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const mr = () => w.document.querySelector('#modal-root').innerHTML;
  w.closeModal(); w.nudgeSave({});
  const p = w.P();
  const until = new Date(Date.now() - 864e5); // きのう終わった
  p.context = { about: '', now: 'しゅうがく旅行', nowUntil:
    until.getFullYear() + '-' + String(until.getMonth() + 1).padStart(2, '0') + '-' + String(until.getDate()).padStart(2, '0') };
  ok(w.maybeBackNudge(), 'できごとが終わった翌日に「おかえり」を出す');
  ok(mr().includes('おかえり') && mr().includes('しゅうがく旅行'), 'できごとの名前を入れて声をかける');
  ok(mr().includes('5分だけ'), '小さく再開する提案をする');
  ok(mr().includes('しゅつげき'), 'そのまま しゅつげきできる');
  w.closeModal();
  ok(!w.maybeBackNudge(), '2回目は出さない(追撃しない)');
  eq(mr(), '', 'モーダルは出ていない');
  // 「おかえり」を優先し、同時に2つ出さない
  w.nudgeSave({});
  w.eval('S').planRemind.day = new Date().getDay();
  w.maybeNudge();
  ok(mr().includes('おかえり'), 'さくせん会議より「おかえり」を優先する');
  w.closeModal();
  w.maybeNudge();
  ok(mr().includes('さくせん会議'), '「おかえり」が済んだらさくせん会議の声かけに戻る');
  w.closeModal();
  // 割り込まない条件
  w.nudgeSave({});
  w.eval('S').activeSession = { base: 'home', plannedMin: 25, startTs: Date.now(), boards: [] };
  ok(!w.maybeBackNudge(), 'しゅつげき中は割り込まない');
  w.eval('S').activeSession = null;
  // 記録は端末ローカル(同期データを汚さない)
  w.maybeBackNudge();
  ok(Object.keys(w.nudgeLoad()).some(k => k.startsWith('back|')), '表示済みの記録は端末ローカルに残る');
  ok(!JSON.stringify(w.eval('S')).includes('back|'), '同期データ・バックアップJSONには入らない');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  // migrate: 旧データ・壊れた値の防御 + マージ(metaMt LWW)
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  w.closeModal();
  const st = { profiles: { x: { pool: [], weeks: {}, exams: [], context: { about: 'a'.repeat(900), now: 'b', nowUntil: 'へんな日付' } } } };
  w.migrate(st);
  eq(st.profiles.x.context.about.length, 600, '長すぎる文章は切り詰める(プロンプト暴発の防止)');
  eq(st.profiles.x.context.nowUntil, '', '日付の形になっていない値は捨てる(import防御)');
  const st2 = { profiles: { y: { pool: [], weeks: {}, exams: [] } } };
  w.migrate(st2);
  eq(st2.profiles.y.context.about, '', '旧データには空のcontextが付与される');
  // マージ: metaMtが新しい方のcontextが採用される
  const clone = o => JSON.parse(JSON.stringify(o));
  const base = JSON.parse(w.eval('JSON.stringify(S)'));
  const a = clone(base); a.profiles.sora.context = { about: 'ふるい', now: '', nowUntil: '' }; a.profiles.sora.metaMt = 100;
  const b2 = clone(base); b2.profiles.sora.context = { about: 'あたらしい', now: '', nowUntil: '' }; b2.profiles.sora.metaMt = 200;
  eq(w.mergeState(a, b2).profiles.sora.context.about, 'あたらしい', 'contextはmetaMtが新しい方が勝つ');
  eq(w.mergeState(b2, a).profiles.sora.context.about, 'あたらしい', '引数順によらない(可換)');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 19. 📖 コンセプト と はじめての方へ(v22) ---------- */
console.log('\n[19] 📖コンセプト・保護者ガイド');
{
  // 初回のパパ・ママモード入室でだけコンセプトが出る(=確実に保護者が見ている瞬間)
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const mr = () => w.document.querySelector('#modal-root').innerHTML;
  w.closeModal();
  w.localStorage.removeItem('studykichi_concept');
  ok(!w.conceptSeen(), '初期状態では未表示');
  w.openParent();
  ok(mr().includes('大切にしていること'), '初回のパパ・ママモードでコンセプトが出る');
  ok(mr().includes('はじめられた'), '柱1: やらせるのではなく はじめられたを祝う');
  ok(mr().includes('となりの相棒'), '柱2: AIは考える力を残して伴走する');
  ok(mr().includes('あなたが認めてくれたという事実'), '柱3: 承認こそがごほうびの本体');
  ok(mr().includes('「承認」</b>だけ覚えて'), '理念から実務(承認)へつなぐ一文がある');
  ok(w.conceptSeen(), '表示したらフラグが立つ(端末ローカル)');
  ok(!JSON.stringify(w.eval('S')).includes('studykichi_concept'), 'フラグは同期データに入らない');
  // そのままパパ・ママモードへ進める
  w.openParent();
  ok(mr().includes('パパ・ママモード') && mr().includes('承認センター'), '2回目からは通常どおりパパ・ママモードが開く');
  ok(mr().includes('はじめての方へ'), 'パパ・ママモードの先頭に説明書への導線がある');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  // 説明書の中身: 知らないと損する7項目 + モードの地図
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  w.closeModal();
  w.showParentGuide();
  const g = w.document.querySelector('#modal-root').innerHTML;
  ok(g.includes('ごほうびのスイッチ'), '①承認しないと報酬が止まることを最初に伝える');
  ok(g.includes('日曜から土曜') && g.includes('翌週ぶん'), '②週の区切りと土曜の例外');
  ok(g.includes('つうちょう') && g.includes('ポイントちょうせい'), '③ポイントは台帳が正・直し方');
  ok(g.includes('含まれません') && g.includes('故障ではありません'), '④写真が同期されないのは仕様だと明記');
  ok(g.includes('親PINは同期されません') && g.includes('こどもPIN'), '⑤同期とPINの注意');
  ok(g.includes('APIキー') && g.includes('この端末の中だけ'), '⑥AIキーの取得と保存場所');
  ok(g.includes('機種変更の前には、必ず保存'), '⑦バックアップを促す');
  ok(g.includes('パパ・ママモードの地図'), 'モードの地図がある');
  ['承認センター', '特別ミッション', 'ごほうび設定', 'リマインダー', 'メンバーときち', 'かぞく同期', 'データとシステム']
    .forEach(t => ok(g.includes(t), '地図に載っている: ' + t));
  ok(g.includes('もどる'), 'パパ・ママモードへ戻る導線がある');
  // せっていからいつでも読める
  w.closeModal();
  w.eval('S').tab = 'set'; w.render();
  const app = w.document.querySelector('#app').innerHTML;
  ok(app.includes('はじめての方へ'), 'せっていから説明書を開ける');
  ok(app.includes('大切にしていること'), 'せっていからコンセプトを読み返せる');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 20. 🔐 パパ・ママモードの入室ゲート(v23) ----------
   実障害: 説明書の「← パパ・ママモードにもどる」から、PINを通さずに入室できた。
   画面ごとに導線を直すのではなく openParent() 自身に守らせる */
console.log('\n[20] 🔐入室ゲート');
{
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  const mr = () => w.document.querySelector('#modal-root').innerHTML;
  w.closeModal();
  w.eval('S').parentPin = '1975';
  w.parentAuthed = false; // PINをまだ通していない状態
  // 直接呼んでもゲートに落ちる
  w.openParent();
  ok(mr().includes('PIN') && !mr().includes('承認センター'), 'openParent()を直接呼んでもPINゲートに落ちる');
  w.closeModal();
  // せってい → 説明書 → もどる の経路(報告された穴)
  w.eval('S').tab = 'set'; w.render();
  w.showParentGuide();
  ok(!mr().includes('パパ・ママモードにもどる'), '未認証では「もどる」ボタン自体を出さない');
  ok(mr().includes('とじる'), '代わりに「とじる」を出す');
  w.closeModal();
  // コンセプト → 説明書 の経路も同じ
  w.showConcept();
  ok(!mr().includes('パパ・ママモードへ'), '未認証のコンセプトからは入室ボタンを出さない');
  w.closeModal();
  // 間違ったPINでは入れない
  w.parentGate();
  w.document.querySelector('#pin-in').value = '0000';
  w.checkPin();
  ok(!mr().includes('承認センター'), 'ちがうPINでは入れない');
  ok(!w.parentAuthed, 'ちがうPINでは入室許可が立たない');
  // 正しいPINで入れる
  w.document.querySelector('#pin-in').value = '1975';
  w.checkPin();
  ok(w.parentAuthed, '正しいPINで入室許可が立つ');
  ok(mr().includes('承認センター'), 'パパ・ママモードが開く');
  // 認証後は説明書から戻れる
  w.showParentGuide();
  ok(mr().includes('パパ・ママモードにもどる'), '認証後は「もどる」が出る');
  w.openParent();
  ok(mr().includes('承認センター'), '認証後は説明書から戻れる');
  w.closeModal();
  // タブを移る/つかう人が変わると入室許可は切れる
  w.go('home');
  ok(!w.parentAuthed, 'タブを移ると入室許可が切れる');
  w.parentAuthed = true;
  w.switchProfile('fuka');
  ok(!w.parentAuthed, 'つかう人が変わると入室許可が切れる');
  // PIN未設定のときも素通りさせない(PINを決める画面へ)
  w.eval('S').parentPin = null; w.parentAuthed = false;
  w.closeModal();
  w.openParent();
  ok(mr().includes('4けたの暗証番号'), 'PIN未設定なら、まず決めてもらう画面に行く');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}
{
  // 読みやすさ: 大きめの本文 + 「くわしく」で深掘り
  const { w, errors } = boot(undefined, { studykichi_guide: '1' });
  w.closeModal();
  w.showParentGuide();
  const doc = w.document;
  const g = doc.querySelector('#modal-root');
  ok(g.querySelector('.pg'), '保護者向けの大きめ本文スタイルが当たっている');
  eq(g.querySelectorAll('.pg-row').length, 7, '7項目が1つずつのブロックになっている');
  eq(g.querySelectorAll('.pg-more').length, 7, '各項目に「くわしく」がある');
  ok([...g.querySelectorAll('.pg-more')].every(d => !d.open), '「くわしく」は既定で閉じている(最初は短く読める)');
  ok([...g.querySelectorAll('.pg-more summary')].every(s2 => s2.textContent.includes('くわしく')), 'ラベルは「くわしく」');
  // まとめだけで意味が通る(1項目目)
  const first = g.querySelector('.pg-row .pg-s').textContent;
  ok(first.includes('ごほうびのスイッチ') && first.length < 60, '最初のまとめは短く、要点だけ');
  ok(g.querySelector('.pg-lead').textContent.includes('7つだけ'), '冒頭で「7つだけ」と量を約束する');
  // コンセプトも同じ読みやすさ
  w.closeModal(); w.showConcept();
  ok(doc.querySelector('#modal-root .pg'), 'コンセプトも同じ本文スタイル');
  eq(doc.querySelectorAll('#modal-root .pg-row').length, 3, 'コンセプトは3本柱');
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 6. リリース規約(6ファイル構成 + バージョン同時更新) ---------- */
console.log('\n[6] リリース規約');
{
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const vApp = (html.match(/APP_VER='v(\d+)'/) || [])[1];
  const vSw = (sw.match(/studykichi-v(\d+)/) || [])[1];
  ok(vApp === vSw, `せってい表示(v${vApp})と sw.js CACHE(v${vSw})が一致する`);
  for (const f of ['index.html', 'manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    ok(fs.existsSync(path.join(__dirname, '..', f)), `リリースファイル存在: ${f}`);
  }
  /* 著作権表示: 配布されるファイルと、リポジトリを見た人の両方に必ず届くようにする */
  const lic = path.join(__dirname, '..', 'LICENSE');
  ok(fs.existsSync(lic), 'LICENSE がある(表記がないと自由に使えると誤解される)');
  const lt = fs.readFileSync(lic, 'utf8');
  ok(lt.includes('Copyright (c) 2026 そら ＆ ふう ＆ パパ'), 'LICENSE に著作権者');
  ok(lt.includes('github.com/wwoooiiioooww'), 'LICENSE に権利者を特定できる連絡先');
  ok(lt.includes('個人・家庭内での利用は自由'), 'LICENSE に許可の範囲');
  ok(lt.includes('商用利用'), 'LICENSE に要相談の範囲');
  ok(lt.includes('無保証') && lt.includes('NO WARRANTY'), 'LICENSE に無保証条項(日英)');
  ok(html.slice(0, 700).includes('Copyright (c) 2026'), 'index.html の先頭に著作権表示(コピーされても残る)');
  ok(html.includes('© 2026 そら ＆ ふう ＆ パパ'), 'アプリ内にも著作権表示');
  ok(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8').includes('Copyright (c) 2026'), 'sw.js にも著作権表示');
  const rm = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  ok(rm.includes('ライセンス') && rm.includes('LICENSE'), 'README からライセンスに導線がある');
}

console.log(`\n==== 結果: ${passed} passed / ${failed} failed ====`);
if (failed) { console.log('失敗:', fails.join(' | ')); process.exit(1); }
console.log('runtime errors: none');
