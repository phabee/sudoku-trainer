'use strict';
/* Tests der Löser-Engine. Ausführen mit:  cd tests && node --test */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./load-engine');

/* Referenz-Sudokus, mit der eigenen Engine erzeugt (keine Fremdquellen). */
const EASY = '...841.72.1.....46.3......9..3..8..41...7...36..3..5..3......6.45.....8.78.126...';   // Stufe 1, identisch mit dem Startsudoku der App
const XWING = '...6..45.....549.3...1.3.6.42....1....12.83....6....78.9.4.5...2.487.....65..9...';  // Stufe 4, Lösungsweg enthält einen X-Wing
const HARD = '.413...5..8.......2...15..4.1.6.28.5.2.....3.8.41.3.2.5..96...3.......9..9...851.';   // Stufe 6

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
  const g = E.parseGrid(EASY);
  assert.equal(g.length, 81);
  assert.equal(E.gridToString(g), EASY);
  assert.equal(E.parseGrid(EASY.replace(/\./g, '0')).join(''), g.join(''));
  assert.equal(E.parseGrid(EASY.slice(0, 5) + '\n' + EASY.slice(5)).join(''), g.join(''), 'Zeilenumbrüche werden ignoriert');
  assert.equal(E.parseGrid(EASY.slice(1)), null, 'zu kurz');
});

test('findConflicts erkennt doppelte Ziffern', () => {
  const g = E.parseGrid(EASY);
  assert.equal(E.findConflicts(g).cells.size, 0);
  const dup = g[3]; g[0] = dup; // Ziffer aus Z1S4 zusätzlich in Z1S1
  const c = E.findConflicts(g);
  assert.ok(c.cells.has(0) && c.cells.has(3));
  assert.equal(c.details[0].digit, dup);
});

test('solveFast: eindeutig, widersprüchlich, mehrdeutig', () => {
  assert.equal(E.solveFast(E.parseGrid(EASY), 2).count, 1);
  const bad = E.parseGrid(EASY); bad[0] = bad[3];
  assert.equal(E.solveFast(bad, 2).count, 0);
  assert.equal(E.solveFast(new Uint8Array(81), 2).count, 2, 'leeres Raster hat mehrere Lösungen');
  const full = E.generateFullGrid();
  assert.ok(full.every(v => v >= 1 && v <= 9));
  assert.equal(E.findConflicts(full).cells.size, 0);
});

test('bekannte Sudokus werden richtig bewertet', () => {
  const easy = E.parseGrid(EASY); const ws = E.solveFast(easy, 2).solution;
  assert.equal(E.rateLevel(easy, ws, 6).level, 1, 'Referenz Stufe 1: nur nackte Einer');

  const xw = E.parseGrid(XWING); const xs = E.solveFast(xw, 2).solution;
  const rx = E.rateLevel(xw, xs, 6);
  assert.equal(rx.level, 4, 'Referenz Stufe 4');
  assert.ok(rx.used.xWing >= 1, 'X-Wing wird benutzt');

  const hard = E.parseGrid(HARD); const is = E.solveFast(hard, 2).solution;
  const ri = E.rateLevel(hard, is, 6);
  assert.equal(ri.level, 6, 'Referenz Stufe 6 braucht Versuch und Irrtum');
  assert.ok(ri.used.bifurcation >= 1);
});

test('rateLevel bricht bei Überschreiten der Zielstufe ab', () => {
  const hard = E.parseGrid(HARD); const is = E.solveFast(hard, 2).solution;
  assert.equal(E.rateLevel(hard, is, 3).exceeded, true);
  const easy = E.parseGrid(EASY); const ws = E.solveFast(easy, 2).solution;
  assert.equal(E.rateLevel(easy, ws, 1).exceeded, false);
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
  const hard = E.parseGrid(HARD); const is = E.solveFast(hard, 2).solution;
  const st = solveLogically(hard, is).steps.find(s => s.tech === 'bifurcation');
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
