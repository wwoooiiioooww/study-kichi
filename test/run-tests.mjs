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
      if (preState) window.localStorage.setItem('studykichi_v1', JSON.stringify(preState));
      if (extraLS) Object.entries(extraLS).forEach(([k, v]) => window.localStorage.setItem(k, v));
    },
  });
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
  eq(mr().querySelectorAll('details.pd').length, 6, '6つの折りたたみセクションがある');
  const ap = mr().querySelector('#pd-approve');
  ok(ap && ap.open, '承認センターは初期展開');
  ok(ap.innerHTML.includes('承認まちはありません') === false && ap.innerHTML.includes('セッション(1)'), '承認センターに件数が出る');
  ok(mr().innerHTML.includes('承認まち 1'), 'サマリに承認まちバッジ');
  for (const id of ['pd-mission', 'pd-reward', 'pd-member', 'pd-sync', 'pd-sys']) {
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
  ok(w.document.querySelector('#modal-root').innerHTML.includes('しゅつげき'), '初回はガイドが自動表示される');
  eq(w.localStorage.getItem('studykichi_guide'), '1', '表示済みフラグが端末ローカルに立つ');
  w.showGuide(3);
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
  const old = { v: 5, currentProfile: 'sora', bases: [{ id: 'solid', name: 'ソリッドスクエア', em: '🏢' }],
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
}

console.log(`\n==== 結果: ${passed} passed / ${failed} failed ====`);
if (failed) { console.log('失敗:', fails.join(' | ')); process.exit(1); }
console.log('runtime errors: none');
