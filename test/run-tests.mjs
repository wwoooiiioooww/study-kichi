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

/* 起動ヘルパー。preState を渡すと localStorage に旧データを仕込んでから起動する */
function boot(preState) {
  const errors = [];
  const dom = new JSDOM(html, {
    url: 'https://example.com/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.confirm = () => true;
      window.alert = () => {};
      window.addEventListener('error', e => errors.push(e.message));
      if (preState) window.localStorage.setItem('studykichi_v1', JSON.stringify(preState));
    },
  });
  return { dom, w: dom.window, errors };
}

/* ---------- 1. 起動 + 🚀ロケットOP ---------- */
console.log('\n[1] 起動 + 🚀ロケットOP');
{
  const { w, errors } = boot();
  const St=w.eval('S');ok(St && St.v === 4, '起動できて S.v=4');
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
    profiles: { sora: { name: '空花', em: '🌸', grade: '小5', points: 120, sessions: [], exams: [], chat: [], pool: ['旧文字列券'], tickets: [], weeks: {}, bonusSpins: [], books: [] } },
  };
  const { w, errors } = boot(old);
  const p = w.eval('S').profiles.sora;
  eq(p.theme, 'sky', '旧データに theme=sky が付与される');
  ok(Array.isArray(p.ownedThemes) && p.ownedThemes.includes('sky') && p.ownedThemes.includes('sakura'), '旧データに ownedThemes=[sky,sakura] が付与される');
  ok(Array.isArray(p.missions) && p.missions.length === 0, '旧データに missions=[] が付与される');
  eq(p.points, 120, '既存ポイントは壊れない');
  eq(p.pool[0].name, '旧文字列券', '既存migrate(券の値札化)も引き続き動く');
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
  ok(w.grantBonus(p, wk, 'plan', 'テスト', false) === true, 'grantBonus 初回は付与される');
  ok(w.grantBonus(p, wk, 'plan', 'テスト', false) === false, 'grantBonus 2回目は拒否(週grantedフラグ)');
  eq(p.bonusSpins.length, 1, 'bonusSpinsは1件のみ');
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
  eq(errors.length, 0, 'runtime errors: none');
  w.close();
}

/* ---------- 6. リリース規約(6ファイル構成 + バージョン同時更新) ---------- */
console.log('\n[6] リリース規約');
{
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const vApp = (html.match(/スタディきち v(\d+)/) || [])[1];
  const vSw = (sw.match(/studykichi-v(\d+)/) || [])[1];
  ok(vApp === vSw, `せってい表示(v${vApp})と sw.js CACHE(v${vSw})が一致する`);
  for (const f of ['index.html', 'manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    ok(fs.existsSync(path.join(__dirname, '..', f)), `リリースファイル存在: ${f}`);
  }
}

console.log(`\n==== 結果: ${passed} passed / ${failed} failed ====`);
if (failed) { console.log('失敗:', fails.join(' | ')); process.exit(1); }
console.log('runtime errors: none');
