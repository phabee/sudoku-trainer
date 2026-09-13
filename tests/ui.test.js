'use strict';
/* Headless-Tests der Oberfläche mit jsdom. Ausführen mit:  cd tests && npm install && node --test
   Die Tests laufen nacheinander auf derselben Seite und bauen aufeinander auf. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const { html } = require('./load-engine');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail && e.detail.stack || e.message || e)));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window, d = w.document;
w.confirm = () => true;

const g = expr => w.eval(expr);
const key = (k, opts = {}) => d.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, opts)));
const act = name => { const el = d.querySelector(`[data-act="${name}"]`); assert.ok(el, `Element data-act=${name} vorhanden`); el.click(); };
const cell = i => d.querySelectorAll('#grid .cell')[i];
const text = id => d.getElementById(id).textContent;
const WIKI = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

test('Seite lädt mit Startsudoku', async () => {
  await new Promise(r => setTimeout(r, 30));
  assert.equal(d.querySelectorAll('#grid .cell').length, 81);
  assert.equal(g('S.givens').filter(x => x).length, 30);
  assert.equal(g('S.level'), 1);
  assert.equal(d.title, 'Sudoku-Trainer');
});

test('Ziffern eingeben, löschen, rückgängig, wiederholen', () => {
  const empty = [...Array(81).keys()].find(i => !g('S.vals')[i]);
  cell(empty).click(); assert.equal(g('S.sel'), empty);
  const sol = g('S.solution')[empty];
  key(String(sol)); assert.equal(g('S.vals')[empty], sol);
  assert.ok(cell(empty).textContent.trim().startsWith(String(sol)), 'Ziffer im DOM sichtbar');
  act('undo'); assert.equal(g('S.vals')[empty], 0);
  act('redo'); assert.equal(g('S.vals')[empty], sol);
  key('Delete'); assert.equal(g('S.vals')[empty], 0);
  const given = [...Array(81).keys()].find(i => g('S.givens')[i]);
  cell(given).click(); key('1'); assert.equal(g('S.vals')[given], g('S.givens')[given] && g('S.solution')[given], 'Vorgabe bleibt unverändert');
});

test('Kandidaten: Shift, Kandidaten-Modus, Automatik', () => {
  const empty = [...Array(81).keys()].find(i => !g('S.vals')[i]);
  cell(empty).click();
  key('7', { shiftKey: true }); assert.ok(g('S.marks')[empty] & (1 << 7));
  key('7', { shiftKey: true }); assert.equal(g('S.marks')[empty], 0);
  key('Digit4', { code: 'Digit4', shiftKey: true }); assert.ok(g('S.marks')[empty] & (1 << 4), 'Shift+Ziffer über e.code (z. B. Schweizer Tastatur)');
  act('pencil'); assert.equal(g('S.pencil'), true);
  key('3'); assert.ok(g('S.marks')[empty] & (1 << 3));
  act('pencil'); assert.equal(g('S.pencil'), false);
  act('autoToggle'); assert.equal(g('S.auto'), true);
  assert.ok(d.querySelectorAll('#grid .cand.on').length > 50, 'Kandidaten werden angezeigt');
  // eigene Streichung im Automatikmodus
  const comp = g('computedCands')();
  act('fillCands'); assert.equal(g('S.elim').every(x => x === 0), true, 'Kandidaten füllen setzt Streichungen zurück');
  const dgt = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(x => g('displayCands')(empty, comp) & (1 << x));
  cell(empty).click(); key(String(dgt), { shiftKey: true });
  assert.ok(g('S.elim')[empty] & (1 << dgt), 'Streichung gespeichert');
  assert.equal(g('displayCands')(empty, comp) & (1 << dgt), 0, 'gestrichener Kandidat nicht mehr angezeigt');
  key(String(dgt), { shiftKey: true });
});

test('Prüfen meldet Fehler, Hinweis meldet Fehler zuerst', () => {
  const empty = [...Array(81).keys()].find(i => !g('S.vals')[i]);
  const sol = g('S.solution')[empty]; const wrong = sol === 1 ? 2 : 1;
  cell(empty).click(); key(String(wrong)); assert.equal(g('S.vals')[empty], wrong);
  act('check'); assert.match(text('status'), /nicht mit der Lösung|Widerspr/);
  act('hint'); assert.match(text('hintBox'), /Fehler|Widerspruch|falsch/i);
  act('hintClear'); key('Delete');
  act('check'); assert.match(text('status'), /korrekt/);
});

test('Hinweis eskaliert in vier Stufen und lässt sich anwenden', () => {
  act('hint'); assert.equal(g('S.hint.level'), 1);
  act('hint'); assert.equal(g('S.hint.level'), 2);
  act('hint'); assert.equal(g('S.hint.level'), 3);
  assert.ok(d.querySelectorAll('#grid .cell.hint').length >= 1, 'beteiligte Zellen markiert');
  act('hint'); assert.equal(g('S.hint.level'), 4);
  assert.equal(d.getElementById('hintApplyBtn').disabled, false);
  const before = g('S.vals').filter(x => x).length;
  act('hintApply'); assert.equal(g('S.vals').filter(x => x).length, before + 1);
  act('hintFull'); assert.equal(g('S.hint.level'), 4, 'Schritt komplett zeigen springt zu Stufe 4');
  act('hintClear'); assert.equal(g('S.hint'), null);
});

test('Nächster Schritt, alle Einer, Lösung erkannt', () => {
  act('stepSolve'); assert.match(text('status'), /ausgeführt/);
  act('singlesSolve');
  assert.ok(g('S.vals').every(x => x), 'Stufe-1-Sudoku ist mit Einern gelöst');
  assert.equal(g('S.done'), true);
});

test('Eingabemodus: importieren, validieren, übernehmen', () => {
  act('enterEmpty'); assert.equal(g('S.mode'), 'enter');
  d.getElementById('importText').value = WIKI; act('importText');
  assert.equal(g('S.vals').filter(x => x).length, 30);
  act('validate'); assert.match(text('validateBox'), /Gültig: genau eine Lösung/);
  // Änderung nach Prüfung verwirft das Ergebnis
  const empty = [...Array(81).keys()].find(i => !g('S.vals')[i]);
  cell(empty).click(); key('9');
  assert.equal(g('S.validated'), null); assert.match(text('validateBox'), /erneut prüfen/);
  key('Delete');
  act('validate'); act('adopt');
  assert.equal(g('S.mode'), 'play'); assert.equal(g('S.unique'), true); assert.equal(g('S.level'), 1);
});

test('Eingabemodus: Widerspruch und Abbruch', () => {
  act('enterEmpty');
  d.getElementById('importText').value = '55' + WIKI.slice(2); act('importText'); act('validate');
  assert.match(text('validateBox'), /Widerspr/); assert.match(text('validateBox'), /Ungültig/);
  d.getElementById('importText').value = '.'.repeat(81); act('importText'); act('validate');
  assert.match(text('validateBox'), /mindestens 17/);
  act('cancelEnter'); assert.equal(g('S.mode'), 'play');
  assert.equal(g('S.givens').filter(x => x).length, 30, 'vorheriges Spiel wiederhergestellt');
});

test('Trainer: Nein/Ja, Zelle, falsche und richtige Ziffer, Leiter zurück auf Regel 1', () => {
  act('trainerToggle'); assert.equal(g('S.trainer.on'), true); assert.equal(g('S.auto'), true);
  act('tNo'); assert.equal(g('S.trainer.msgKind'), 'bad', 'falsches Nein wird korrigiert');
  act('tYes'); assert.equal(g('S.trainer.phase'), 'locate');
  const st = g('S.trainer.steps')[0]; const target = st.placements[0].cell;
  const other = [...Array(81).keys()].find(i => !g('S.vals')[i] && !g('S.trainer.steps').some(s => s.placements.some(p => p.cell === i) || s.cells.includes(i)));
  if (other !== undefined) { cell(other).click(); assert.equal(g('S.trainer.msgKind'), 'bad'); assert.equal(g('S.trainer.phase'), 'locate'); }
  cell(target).click(); assert.equal(g('S.trainer.phase'), 'digit');
  const wrong = st.placements[0].digit === 9 ? 1 : 9;
  key(String(wrong)); assert.equal(g('S.vals')[target], 0, 'falsche Ziffer abgelehnt');
  assert.equal(g('S.trainer.msgKind'), 'bad');
  key(String(st.placements[0].digit)); assert.equal(g('S.vals')[target], st.placements[0].digit);
  assert.equal(g('S.trainer.rung'), 0); assert.equal(g('S.trainer.phase'), 'ask');
  act('tShow'); assert.equal(g('S.trainer.phase'), 'reveal'); act('tApply'); assert.equal(g('S.trainer.phase'), 'ask');
  act('tSkip'); assert.equal(g('S.trainer.rung'), 1);
  act('tHow'); assert.equal(g('S.trainer.showHow'), true); assert.match(text('trainerPanel'), /So prüfst du das/);
  act('trainerToggle'); assert.equal(g('S.trainer.on'), false);
});

test('Erzeugen: Stufen 1, 3 und 4 treffen die Zielstufe', async () => {
  for (const lvl of [1, 3, 4]) {
    g(`S.genLevel=${lvl}`);
    await g('generate')(lvl);
    assert.equal(g('S.level'), lvl, `Stufe ${lvl}: ${text('genInfo')}`);
    assert.ok(g('S.givens').filter(x => x).length >= 17);
    const r = g('rateLevel')(g('S.vals'), g('S.solution'), 6);
    assert.equal(r.level, lvl, 'Bewertung bestätigt Stufe');
  }
});

test('Trainer mit Streichregel auf Stufe-3-Sudoku', async () => {
  g('S.genLevel=3'); await g('generate')(3);
  act('trainerToggle');
  // Einer so lange über den Trainer ausführen, bis eine Streichtechnik nötig ist
  for (let guard = 0; guard < 200; guard++) {
    const a = g('analyze')(); if (a.kind !== 'step' || a.step.level > 2) break;
    let k = 0; while (k++ < 9 && !g('trainerFindSteps')().length) act('tNo');
    act('tShow'); act('tApply');
  }
  const a = g('analyze')();
  assert.equal(a.kind, 'step'); assert.ok(a.step.level >= 3, 'Streichtechnik erforderlich');
  for (let k = 0; k < 8 && !g('trainerFindSteps')().length; k++) { act('tNo'); assert.equal(g('S.trainer.msgKind'), 'good', 'korrektes Nein'); }
  act('tYes'); assert.equal(g('S.trainer.phase'), 'locate');
  const st = g('S.trainer.steps')[0]; cell(st.cells[0]).click();
  assert.ok(['elim', 'digit'].includes(g('S.trainer.phase')));
  if (g('S.trainer.phase') === 'elim') { act('tApply'); assert.equal(g('S.trainer.rung'), 0); assert.equal(g('S.trainer.phase'), 'ask'); }
  act('trainerToggle');
});

test('Komplett lösen, zurücksetzen, Tastaturnavigation, Speicherung', () => {
  act('solveAll'); assert.ok(g('S.vals').every(x => x)); assert.equal(g('S.done'), true);
  act('reset'); assert.equal(g('S.vals').filter(x => x).length, g('S.givens').filter(x => x).length);
  cell(0).click(); key('ArrowRight'); assert.equal(g('S.sel'), 1); key('ArrowDown'); assert.equal(g('S.sel'), 10);
  key('ArrowLeft'); assert.equal(g('S.sel'), 9); key('ArrowUp'); assert.equal(g('S.sel'), 0);
  key('Escape'); assert.equal(g('S.sel'), -1);
  const saved = JSON.parse(w.localStorage.getItem('sudoku-trainer-v1'));
  assert.equal(saved.vals.length, 81); assert.equal(saved.level, g('S.level'));
});

test.after(() => dom.window.close());

test('keine Skriptfehler während der Tests', () => {
  assert.deepEqual(errors, []);
});
