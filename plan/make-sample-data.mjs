/* スタディきち スクリーンショット用サンプルデータ生成
   実行: node plan/make-sample-data.mjs   → plan/sample-data.json

   ・日付は「実行した日」を基準に作るので、古くなったら再実行するだけで新しくなる
   ・アプリの「🔧データとシステム → バックアップから復元(上書き)」で読み込む
   ・⚠️ 復元は今のデータを消す。必ず別ブラウザ/シークレットウィンドウで使うこと */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NOW = Date.now();
const DAY = 864e5;
/* index.html と同じ実装にそろえる(ゼロ埋めしない形式。ここがズレると週が引けない) */
const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const weekKeyFor = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (6 - d.getDay())); return dayKey(d.getTime()); };
const prevWeekKey = key => { const [y, m, dd] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, dd - 7).getTime()); };
/* 模試・ミッション期限は date input と同じゼロ埋め形式 */
const isoDate = ts => { const d = new Date(ts); const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
/* その日の hh:mm に置いた時刻(毎日ばらけさせて自然に見せる) */
const at = (daysAgo, h, mi) => { const d = new Date(NOW - daysAgo * DAY); d.setHours(h, mi, 0, 0); return d.getTime(); };

const WEEK = weekKeyFor(NOW);       // 今週(土曜おわり)
const LASTWEEK = prevWeekKey(WEEK); // 先週

/* --- しゅつげき記録。approved は spin(スロット結果)まで入れて「消化ずみ」にする --- */
function sess(o) {
  return { id: o.id, base: o.base, plannedMin: o.plannedMin || o.minutes, startTs: o.start,
    endTs: o.start + o.minutes * 6e4, minutes: o.minutes, subjects: o.subjects, memo: o.memo || '',
    photoId: null, boards: [], focus: o.focus || null,
    status: o.status, spin: o.spin || null, mt: o.start };
}
const tx = (id, ts, delta, reason, ref) => ({ id, ts, delta, reason, ref: ref == null ? null : ref });

/* ============================ そら(小5) ============================ */
const soraSessions = [
  /* きょう: 朝に5分だけ開いた回(記事の「スロットを回したいがために朝5分」) */
  sess({ id: 's-so-01', base: 'home', start: at(0, 7, 20), minutes: 5, subjects: ['算数'], memo: '家を出る前に計算だけ', status: 'pending' }),
  sess({ id: 's-so-02', base: 'lib', start: at(0, 16, 10), minutes: 75, subjects: ['算数', '国語'], memo: '図書館。速さの問題がわかってきた', status: 'pending' }),
  /* ここから承認ずみ(スロット消化ずみ) */
  sess({ id: 's-so-03', base: 'cafe', start: at(1, 15, 30), minutes: 60, subjects: ['理科'], memo: 'きちカフェでてこの問題', status: 'approved', spin: '🍰🍰🍰 +120pt!' }),
  sess({ id: 's-so-04', base: 'lib', start: at(2, 16, 0), minutes: 90, subjects: ['算数'], memo: '予習シリーズ 練習問題', status: 'approved', spin: '🔥⭐⭐⭐ +260pt!' }),
  sess({ id: 's-so-05', base: 'home', start: at(3, 19, 40), minutes: 25, subjects: ['社会'], memo: '', status: 'approved', spin: '🍩🍩🌸 +40pt' }),
  sess({ id: 's-so-06', base: 'school', start: at(4, 16, 20), minutes: 45, subjects: ['国語'], memo: '記述の練習', status: 'approved', spin: '🎁 券があたった!' }),
  sess({ id: 's-so-07', base: 'lib', start: at(5, 14, 0), minutes: 110, subjects: ['算数', '理科'], memo: '土曜は長め', status: 'approved', spin: '⭐⭐⭐ +150pt!' }),
  sess({ id: 's-so-08', base: 'cafe', start: at(6, 15, 0), minutes: 55, subjects: ['国語'], memo: '', status: 'approved', spin: '🍰🌸🍩 +30pt' }),
  sess({ id: 's-so-09', base: 'home', start: at(7, 20, 0), minutes: 30, subjects: ['算数'], memo: '', status: 'approved', spin: '🌸🌸🍩 +25pt' }),
  sess({ id: 's-so-10', base: 'lib', start: at(8, 16, 30), minutes: 80, subjects: ['算数', '社会'], memo: '', status: 'approved', spin: '⭐⭐🍰 +90pt' }),
  sess({ id: 's-so-11', base: 'jido', start: at(9, 17, 0), minutes: 40, subjects: ['理科'], memo: '', status: 'approved', spin: '🍩🍰🌸 +35pt' }),
  sess({ id: 's-so-12', base: 'home', start: at(10, 19, 0), minutes: 20, subjects: ['国語'], memo: '', status: 'approved', spin: '🌸🍩🍰 +20pt' }),
  sess({ id: 's-so-13', base: 'lib', start: at(11, 15, 30), minutes: 95, subjects: ['算数'], memo: '', status: 'approved', spin: '⭐⭐⭐ +150pt!' }),
  /* 12日前は記録なし(連続記録がここで切れる。「毎日やらせない」ための余白) */
  sess({ id: 's-so-14', base: 'cafe', start: at(13, 15, 0), minutes: 65, subjects: ['国語'], memo: '', status: 'approved', spin: '🍰⭐🍩 +80pt' }),
  sess({ id: 's-so-15', base: 'lib', start: at(14, 14, 30), minutes: 100, subjects: ['算数', '理科'], memo: '', status: 'approved', spin: '⭐⭐⭐ +200pt!' }),
  sess({ id: 's-so-16', base: 'home', start: at(15, 19, 20), minutes: 30, subjects: ['社会'], memo: '', status: 'approved', spin: '🌸🍰🍩 +45pt' }),
  sess({ id: 's-so-17', base: 'school', start: at(16, 16, 10), minutes: 50, subjects: ['国語'], memo: '', status: 'approved', spin: '🍰🍰⭐ +120pt' }),
  sess({ id: 's-so-18', base: 'lib', start: at(18, 15, 40), minutes: 70, subjects: ['算数'], memo: '', status: 'approved', spin: '⭐🍩🍰 +90pt' }),
  sess({ id: 's-so-19', base: 'jido', start: at(20, 16, 40), minutes: 45, subjects: ['理科'], memo: '', status: 'approved', spin: '🍰⭐⭐ +145pt' }),
];
/* 台帳: スロットの獲得 → ごほうび券の購入(クッキー2回=記事のインフレ) → ミッション承認 */
const soraLedger = [
  tx('tx-spin-s-so-19', at(20, 17, 30), 145, 'slot', null),
  tx('tx-spin-s-so-18', at(18, 17, 0), 90, 'slot', null),
  tx('tx-spin-s-so-17', at(16, 17, 10), 120, 'slot', null),
  tx('tx-spin-s-so-16', at(15, 20, 0), 45, 'slot', null),
  tx('tx-spin-s-so-15', at(14, 16, 20), 200, 'slot', null),
  tx('tx-spin-s-so-14', at(13, 16, 20), 80, 'slot', null),
  tx('tx-spin-s-so-13', at(11, 16, 0), 150, 'slot', null),
  tx('tx-spin-s-so-12', at(10, 19, 30), 20, 'slot', null),
  tx('tx-spin-s-so-11', at(9, 17, 45), 35, 'slot', null),
  tx('tx-spin-s-so-10', at(8, 18, 0), 90, 'slot', null),
  tx('tx-shop-cookie-1', at(8, 20, 0), -500, 'shop', '蜂蜜＆ゴルゴンゾーラクッキー券 🧀'),
  tx('tx-spin-s-so-09', at(7, 20, 40), 25, 'slot', null),
  tx('tx-spin-s-so-08', at(6, 16, 0), 30, 'slot', null),
  tx('tx-spin-s-so-07', at(5, 16, 0), 150, 'slot', null),
  tx('tx-ms-ms-so-done', at(5, 21, 0), 20, 'mission', '漢字ドリル 1ページ'),
  tx('tx-shop-cookie-2', at(4, 20, 30), -600, 'shop', '蜂蜜＆ゴルゴンゾーラクッキー券 🧀'),
  tx('tx-spin-s-so-05', at(3, 20, 10), 40, 'slot', null),
  tx('tx-spin-s-so-04', at(2, 17, 40), 260, 'slot', null),
  tx('tx-spin-s-so-03', at(1, 16, 40), 120, 'slot', null),
];
const sora = {
  name: 'そら', em: '🌸', grade: '小5', points: 0,
  sessions: soraSessions,
  exams: [
    { id: 'ex-so-1', name: '○○模試', date: isoDate(NOW - 98 * DAY), scores: { 算数: 48, 国語: 55, 理科: 51, 社会: 53, 総合: 51 }, memo: '', mt: NOW - 98 * DAY },
    { id: 'ex-so-2', name: '○○模試', date: isoDate(NOW - 63 * DAY), scores: { 算数: 52, 国語: 54, 理科: 53, 社会: 55, 総合: 53 }, memo: '算数がすこし上がった', mt: NOW - 63 * DAY },
    { id: 'ex-so-3', name: '○○模試', date: isoDate(NOW - 35 * DAY), scores: { 算数: 55, 国語: 53, 理科: 57, 社会: 56, 総合: 55 }, memo: '', mt: NOW - 35 * DAY },
    { id: 'ex-so-4', name: '○○模試', date: isoDate(NOW - 12 * DAY), scores: { 算数: 59, 国語: 54, 理科: 58, 社会: 57, 総合: 57 }, memo: '目標まであと1', mt: NOW - 12 * DAY },
  ],
  chat: [], chatArchive: [],
  aiName: 'そらとも',
  examTarget: { label: '○○模試 総合', value: '58' },
  bigGoals: [
    { title: '模試で偏差値58!', reward: 'すきなレストランへGO 🍽️' },
    { title: '第一志望に ごうかく!!', reward: 'スペシャル旅行 ✈️🌟' },
  ],
  /* 記事のインフレ対応: クッキー券は交換のたびに +100pt(500 → 600 → いま700) */
  pool: [
    { name: '蜂蜜＆ゴルゴンゾーラクッキー券 🧀', price: 700 },
    { name: 'すきなおやつリクエスト券 🍩', price: 400 },
    { name: 'パパ・ママと30分あそぶ券 🎮', price: 300 },
    { name: 'すきなレストランでディナー券 🍽️', price: 800 },
  ],
  tickets: [
    { id: 'tk-so-cookie-1', name: '蜂蜜＆ゴルゴンゾーラクッキー券 🧀', ts: at(8, 20, 0), usedTs: at(6, 18, 0), mt: at(6, 18, 0) },
    { id: 'tk-so-cookie-2', name: '蜂蜜＆ゴルゴンゾーラクッキー券 🧀', ts: at(4, 20, 30), usedTs: null, mt: at(4, 20, 30) },
    { id: 'tk-so-spin-1', name: 'パパ・ママと30分あそぶ券 🎮', ts: at(4, 17, 0), usedTs: null, mt: at(4, 17, 0) },
  ],
  lastGoldenMilestone: 3,
  pin: '1111',
  weeks: {
    [WEEK]: {
      subjects: ['算数', '国語', '理科'], range: '',
      items: [
        { subj: '算数', text: '予習シリーズ 算数(上)', from: 42, to: 51 },
        { subj: '国語', text: '漢字の要', from: 12, to: 18 },
        { subj: '理科', text: '理科メモリーチェック', from: 30, to: 36 },
      ],
      goal: '', planTs: at(6, 10, 0), planMt: at(6, 10, 0),
      test: null, reviews: [], granted: { plan: true }, testMt: 0,
    },
    [LASTWEEK]: {
      subjects: ['算数', '国語', '理科'], range: '',
      items: [
        { subj: '算数', text: '予習シリーズ 算数(上)', from: 32, to: 41 },
        { subj: '国語', text: '漢字の要', from: 5, to: 11 },
        { subj: '理科', text: '理科メモリーチェック', from: 24, to: 29 },
      ],
      goal: '', planTs: at(13, 10, 0), planMt: at(13, 10, 0),
      test: { total: 30, correct: 26, ts: at(7, 11, 0),
        items: [{ subj: '算数', total: 10, correct: 8 }, { subj: '国語', total: 10, correct: 10 }, { subj: '理科', total: 10, correct: 8 }] },
      reviews: [{ text: '算数', done: true }, { text: '理科', done: false }],
      granted: { plan: true, test: true }, testMt: at(7, 11, 0),
    },
  },
  /* 承認まちのボーナス(今週の作戦けってい) */
  bonusSpins: [
    { id: 'bs-' + WEEK + '-plan', reason: '📅作戦けってい ボーナス', golden: false, status: 'pending', mt: at(6, 10, 0) },
    { id: 'bs-' + LASTWEEK + '-plan', reason: '📅作戦けってい ボーナス', golden: false, status: 'approved', mt: at(13, 10, 0) },
    { id: 'bs-' + LASTWEEK + '-test', reason: '⚔️ボスバトル ボーナス', golden: false, status: 'approved', mt: at(7, 11, 0) },
  ],
  books: ['予習シリーズ 算数(上)', '漢字の要', '理科メモリーチェック'],
  theme: 'sakura',
  ownedThemes: ['sky', 'sakura'],
  missions: [
    { id: 'ms-so-open', title: '理科メモリーチェック 2ページ', pts: 20, due: { type: 'week', date: null },
      status: 'open', createdTs: at(2, 9, 0), claimedTs: null, approvedTs: null, ack: false, mt: at(2, 9, 0) },
    { id: 'ms-so-claimed', title: 'お皿ならべ 1週間', pts: 30, due: { type: 'week', date: null },
      status: 'claimed', createdTs: at(6, 9, 0), claimedTs: at(0, 18, 30), approvedTs: null, ack: false, mt: at(0, 18, 30) },
    { id: 'ms-so-done', title: '漢字ドリル 1ページ', pts: 20, due: { type: 'today', date: null },
      status: 'approved', createdTs: at(5, 9, 0), claimedTs: at(5, 20, 0), approvedTs: at(5, 21, 0), ack: true, mt: at(5, 21, 0) },
  ],
  ledger: soraLedger,
  context: { about: '負けずぎらい。算数のひらめき問題が好き。国語の記述に苦手意識がある。ほめられるとぐんと伸びる。', now: '', nowUntil: '' },
  deleted: {}, metaMt: at(6, 10, 0),
};

/* ============================ ふう(小3) ============================ */
const fukaSessions = [
  sess({ id: 's-fu-01', base: 'home', start: at(0, 17, 0), minutes: 20, subjects: ['算数'], memo: 'けいさんドリル', status: 'pending' }),
  sess({ id: 's-fu-02', base: 'jido', start: at(1, 16, 0), minutes: 30, subjects: ['国語'], memo: 'じどうかんで音読', status: 'approved', spin: '🍩🍩🍩 +60pt!' }),
  sess({ id: 's-fu-03', base: 'home', start: at(2, 18, 20), minutes: 15, subjects: ['算数'], memo: '', status: 'approved', spin: '🌸🍰🍩 +15pt' }),
  sess({ id: 's-fu-04', base: 'lib', start: at(4, 15, 0), minutes: 35, subjects: ['国語', '算数'], memo: 'おねえちゃんといっしょ', status: 'approved', spin: '⭐⭐🍩 +70pt' }),
  sess({ id: 's-fu-05', base: 'home', start: at(6, 17, 30), minutes: 25, subjects: ['算数'], memo: '', status: 'approved', spin: '🍰🍰🌸 +30pt' }),
  sess({ id: 's-fu-06', base: 'jido', start: at(8, 16, 30), minutes: 30, subjects: ['国語'], memo: '', status: 'approved', spin: '🍩⭐🌸 +55pt' }),
  sess({ id: 's-fu-07', base: 'lib', start: at(10, 15, 20), minutes: 40, subjects: ['算数'], memo: 'おねえちゃんといっしょ', status: 'approved', spin: '⭐⭐🍰 +80pt' }),
  sess({ id: 's-fu-08', base: 'home', start: at(12, 18, 0), minutes: 20, subjects: ['国語'], memo: '', status: 'approved', spin: '🍰🍩⭐ +70pt' }),
];
const fukaLedger = [
  tx('tx-spin-s-fu-08', at(12, 18, 30), 70, 'slot', null),
  tx('tx-spin-s-fu-07', at(10, 16, 10), 80, 'slot', null),
  tx('tx-spin-s-fu-06', at(8, 17, 10), 55, 'slot', null),
  tx('tx-spin-s-fu-05', at(6, 18, 0), 30, 'slot', null),
  tx('tx-spin-s-fu-04', at(4, 15, 40), 70, 'slot', null),
  tx('tx-spin-s-fu-03', at(2, 18, 40), 15, 'slot', null),
  tx('tx-shop-oyatsu', at(2, 19, 0), -200, 'shop', 'すきなおやつリクエスト券 🍩'),
  tx('tx-spin-s-fu-02', at(1, 16, 40), 60, 'slot', null),
];
const fuka = {
  name: 'ふう', em: '🍃', grade: '小3', points: 0,
  sessions: fukaSessions,
  exams: [], chat: [], chatArchive: [],
  aiName: 'ふうとも',
  examTarget: { label: '次のテストの目標', value: '' },
  bigGoals: [
    { title: 'けいさんドリルを さいごまで!', reward: 'すきなおやつ 🍩' },
    { title: 'かんじテストで まんてん!', reward: 'ゲーム30分 🎮' },
  ],
  pool: [
    { name: 'すきなおやつリクエスト券 🍩', price: 200 },
    { name: 'パパ・ママと30分あそぶ券 🎮', price: 300 },
    { name: 'よみたい本を1さつ 📖', price: 500 },
  ],
  tickets: [{ id: 'tk-fu-1', name: 'すきなおやつリクエスト券 🍩', ts: at(2, 19, 0), usedTs: null, mt: at(2, 19, 0) }],
  lastGoldenMilestone: 0,
  pin: '2222',
  weeks: {},
  bonusSpins: [],
  books: ['けいさんドリル', 'かんじスキル'],
  theme: 'sky',
  ownedThemes: ['sky', 'sakura'],
  missions: [
    { id: 'ms-fu-claimed', title: 'おんどく 3日つづける', pts: 15, due: { type: 'week', date: null },
      status: 'claimed', createdTs: at(5, 9, 0), claimedTs: at(0, 19, 0), approvedTs: null, ack: false, mt: at(0, 19, 0) },
  ],
  ledger: fukaLedger,
  context: { about: 'おねえちゃんのまねをしたがる。ほめると照れるが、そのあとよくがんばる。', now: '', nowUntil: '' },
  deleted: {}, metaMt: at(5, 9, 0),
};

const state = {
  v: 5, tab: 'home', currentProfile: 'sora', parentPin: '1234',
  bases: [
    { id: 'lib', name: 'としょかん', em: '📚' },
    { id: 'school', name: '図書室', em: '🏫' },
    { id: 'jido', name: 'じどうかん', em: '🎨' },
    { id: 'home', name: 'おうち机', em: '🏠' },
    { id: 'cafe', name: 'きちカフェ', em: '☕' },
  ],
  profiles: { sora, fuka },
  activeSession: null,
  deleted: {}, basesMt: 0, pinMt: 0,
  planRemind: { on: 1, day: 0, max: 3 }, planRemindMt: 0,
};
/* gemini は入れない: 復元で既存のAPIキーを空で上書きしないため(それでも復元は全消しなので注意書き必須) */

const out = path.join(__dirname, 'sample-data.json');
fs.writeFileSync(out, JSON.stringify(state, null, 1), 'utf8');
console.log('書き出し:', out);
console.log('今週キー:', WEEK, '/ 先週キー:', LASTWEEK);
