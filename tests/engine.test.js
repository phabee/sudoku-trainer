'use strict';
/* Tests der Löser-Engine. Ausführen mit:  cd tests && node --test */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./load-engine');

const WIKI = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const INKALA = '8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..';
const XWING = '1.....569492.561.8.561.924...964.8.1.64.1....218.356.4.4.5...169.5.614.2621.....5';

/* Löst ein Sudoku mit dem logischen Löser und prüft jeden Schritt gegen die Lösung. */
function solveLogically(puzzle, solution) {
  const vals = Uint8Array.from(puzzle);
  const ctx = { vals, cands: E.computeCands(vals), solution };
  const used = {}; const steps = []; const bad = [];
  for (let guard = 0; guard < 600; guard++) {
    if (vals.every(v => v)) break;
    const st = E.firstStep(ctx);
    if (!st) { bad.push('kein Schritt gefunden'); break; }
    steps.push(st); used[st.tech] = (used[st.tech] || 0) + 1;
    for (const p of st.placements) if (solution[p.cell] !== p.digit) bad.push(`${st.tech}: falsche Platzierung ${E.cellName(p.cell)}=${p.digit}`);
    for (const e of st.eliminations) if (solution[e.cell] === e.digit) bad.push(`${st.tech}: Lösungsziffer gestrichen ${E.cellName(e.cell)} ${e.digit}`);
    if (!st.placements.length && !st.eliminations.length) bad.push(`${st.tech}: leerer Schritt`);
    E.applyStepToCtx(ctx, st);
  }
  return { steps, used, bad, solved: vals.every(v => v) };
}
function mask(...ds) { let m = 0; for (const d of ds) m |= E.bit(d); return m; }

test('parseGrid und gridToString', () => {
  const g = E.parseGrid(WIKI);
  assert.equal(g.length, 81);
  assert.equal(E.gridToString(g), WIKI);
  assert.equal(E.parseGrid(WIKI.replace(/\./g, '0')).join(''), g.join(''));
  assert.equal(E.parseGrid('53..7\n....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79').join(''), g.join(''), 'Zeilenumbrüche werden ignoriert');
  assert.equal(E.parseGrid(WIKI.slice(1)), null, 'zu kurz');
});

test('findConflicts erkennt doppelte Ziffern', () => {
  const g = E.parseGrid(WIKI);
  assert.equal(E.findConflicts(g).cells.size, 0);
  g[1] = 5; // zweite 5 in Zeile 1 (Z1S1 ist 5)
  const c = E.findConflicts(g);
  assert.ok(c.cells.has(0) && c.cells.has(1));
  assert.equal(c.details[0].digit, 5);
});

test('solveFast: eindeutig, widersprüchlich, mehrdeutig', () => {
  assert.equal(E.solveFast(E.parseGrid(WIKI), 2).count, 1);
  const bad = E.parseGrid(WIKI); bad[1] = 5;
  assert.equal(E.solveFast(bad, 2).count, 0);
  assert.equal(E.solveFast(new Uint8Array(81), 2).count, 2, 'leeres Raster hat mehrere Lösungen');
  const full = E.generateFullGrid();
  assert.ok(full.every(v => v >= 1 && v <= 9));
  assert.equal(E.findConflicts(full).cells.size, 0);
});

test('bekannte Sudokus werden richtig bewertet', () => {
  const wiki = E.parseGrid(WIKI); const ws = E.solveFast(wiki, 2).solution;
  assert.equal(E.rateLevel(wiki, ws, 6).level, 1, 'Wikipedia-Beispiel: nur nackte Einer');

  const xw = E.parseGrid(XWING); const xs = E.solveFast(xw, 2).solution;
  const rx = E.rateLevel(xw, xs, 6);
  assert.equal(rx.level, 4, 'X-Wing-Beispiel ist Stufe 4');
  assert.ok(rx.used.xWing >= 1, 'X-Wing wird benutzt');

  const ink = E.parseGrid(INKALA); const is = E.solveFast(ink, 2).solution;
  const ri = E.rateLevel(ink, is, 6);
  assert.equal(ri.level, 6, 'Inkala-Sudoku braucht Versuch und Irrtum');
  assert.ok(ri.used.bifurcation >= 1);
});

test('rateLevel bricht bei Überschreiten der Zielstufe ab', () => {
  const ink = E.parseGrid(INKALA); const is = E.solveFast(ink, 2).solution;
  assert.equal(E.rateLevel(ink, is, 3).exceeded, true);
  const wiki = E.parseGrid(WIKI); const ws = E.solveFast(wiki, 2).solution;
  assert.equal(E.rateLevel(wiki, ws, 1).exceeded, false);
});

test('Soundness: alle Schritte stimmen mit der Lösung überein (zufällige Sudokus)', () => {
  let total = 0; const allBad = [];
  for (let n = 0; n < 40; n++) {
    const full = E.generateFullGrid();
    const p = E.carveSync(full, 6, E.shuffle(Array.from({ length: 41 }, (_, i) => i)));
    assert.equal(E.solveFast(p, 2).count, 1, 'erzeugtes Sudoku ist eindeutig');
    const r = solveLogically(p, full);
    total += r.steps.length; allBad.push(...r.bad);
    assert.ok(r.solved, 'logischer Löser (mit Bifurkation) löst vollständig');
  }
  assert.deepEqual(allBad, []);
  assert.ok(total > 1000, `genügend Schritte geprüft (${total})`);
});

test('jeder Schritt liefert Erklärtexte und Zellen', () => {
  const xw = E.parseGrid(XWING); const xs = E.solveFast(xw, 2).solution;
  for (const st of solveLogically(xw, xs).steps) {
    assert.ok(st.name && st.level >= 1 && st.level <= 6, st.tech);
    assert.ok(st.cells.length >= 1, `${st.tech}: Zellen`);
    assert.ok(st.hint2.length > 10, `${st.tech}: Hinweis Stufe 2`);
    assert.ok(st.explain.length > 20, `${st.tech}: Begründung`);
  }
});

test('Bifurkation erklärt die Annahme', () => {
  const ink = E.parseGrid(INKALA); const is = E.solveFast(ink, 2).solution;
  const st = solveLogically(ink, is).steps.find(s => s.tech === 'bifurcation');
  assert.ok(st);
  assert.match(st.explain, /Angenommen/);
  assert.equal(st.eliminations.length, 1);
  assert.notEqual(is[st.eliminations[0].cell], st.eliminations[0].digit);
});

test('nacktes und verstecktes Quadrupel (synthetisch)', () => {
  // Nacktes Quadrupel in Zeile 1: Z1S1..Z1S4 enthalten zusammen nur {1,2,3,4}
  let vals = new Uint8Array(81); let cands = new Int16Array(81).fill(E.ALL);
  cands[0] = mask(1, 2); cands[1] = mask(2, 3); cands[2] = mask(3, 4); cands[3] = mask(1, 4); cands[4] = mask(1, 5, 6);
  let steps = [...E.FINDERS.nakedQuad({ vals, cands })];
  let s = steps.find(x => x.cells.join() === '0,1,2,3');
  assert.ok(s, 'nacktes Quadrupel gefunden');
  assert.ok(s.eliminations.every(e => e.cell >= 4 && e.cell <= 8 && e.digit <= 4));
  assert.ok(s.eliminations.some(e => e.cell === 4 && e.digit === 1));

  // Kein Quadrupel, wenn die Vereinigung 5 Ziffern hat
  cands[3] = mask(1, 5);
  assert.equal([...E.FINDERS.nakedQuad({ vals, cands })].filter(x => x.cells.join() === '0,1,2,3').length, 0);

  // Verstecktes Quadrupel: 1..4 kommen in Zeile 1 nur in Z1S1..Z1S4 vor
  vals = new Uint8Array(81); cands = new Int16Array(81).fill(E.ALL);
  for (let c = 4; c <= 8; c++) cands[c] = mask(5, 6, 7, 8, 9);
  steps = [...E.FINDERS.hiddenQuad({ vals, cands })];
  s = steps.find(x => x.cells.join() === '0,1,2,3');
  assert.ok(s, 'verstecktes Quadrupel gefunden');
  assert.deepEqual(s.digits, [1, 2, 3, 4]);
  assert.equal(s.eliminations.length, 20);
  assert.ok(s.eliminations.every(e => e.cell <= 3 && e.digit >= 5));
});

test('carveSync hält die Zielstufe ein und bleibt eindeutig', () => {
  for (const level of [1, 2, 3, 4, 5]) {
    const full = E.generateFullGrid();
    const p = E.carveSync(full, level, E.shuffle(Array.from({ length: 41 }, (_, i) => i)));
    assert.equal(E.solveFast(p, 2).count, 1, `Stufe ${level}: eindeutig`);
    const r = E.rateLevel(p, full, 6);
    assert.ok(r.level <= level, `Stufe ${level}: Bewertung ${r.level} nicht höher als Ziel`);
    assert.ok(p.filter(v => v).length >= 17);
    // Symmetrie: Zelle i und 80-i sind beide gesetzt oder beide leer
    for (let i = 0; i < 81; i++) assert.equal(!!p[i], !!p[80 - i], 'punktsymmetrisch');
  }
});

test('Stufe 1 lässt sich mit Einern allein lösen', () => {
  const full = E.generateFullGrid();
  const p = E.carveSync(full, 1, E.shuffle(Array.from({ length: 41 }, (_, i) => i)));
  const r = E.rateLevel(p, full, 6);
  assert.equal(r.level, 1);
  assert.deepEqual(Object.keys(r.used).sort(), ['fullHouse', 'nakedSingle']);
});
