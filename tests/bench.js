'use strict';
/* Benchmark der Sudoku-Erzeugung. Ausführen mit:  cd tests && node bench.js [Sekunden pro Stufe]
   Misst pro Stufe Trefferquote und Wartezeit der Erzeugung sowie die Verteilung
   der schwersten Technik in zufälligen minimalen Sudokus. Diese Zahlen haben die
   Stufeneinteilung in doc/architektur.md begründet. */
const E = require('./load-engine');

const seconds = Number(process.argv[2]) || 10;
const order = () => E.shuffle(Array.from({ length: 41 }, (_, i) => i));

console.log(`Erzeugung pro Stufe (je ${seconds} s):`);
for (const level of [1, 2, 3, 4, 5, 6]) {
  const t0 = performance.now(); let attempts = 0, hits = 0; const dist = {}; const waits = []; let last = t0;
  while (performance.now() - t0 < seconds * 1000) {
    attempts++;
    const full = E.generateFullGrid();
    const p = E.carveSync(full, level, order());
    const r = E.rateLevel(p, full, 6).level;
    dist[r] = (dist[r] || 0) + 1;
    if (r === level) { hits++; const now = performance.now(); waits.push(now - last); last = now; }
  }
  const dt = performance.now() - t0; waits.sort((a, b) => a - b);
  const med = waits.length ? waits[Math.floor(waits.length / 2)].toFixed(0) : '-';
  const max = waits.length ? waits[waits.length - 1].toFixed(0) : '-';
  console.log(`  Stufe ${level}: Treffer ${hits}/${attempts} (${(100 * hits / attempts).toFixed(1)} %), ${(dt / attempts).toFixed(0)} ms/Versuch, Wartezeit median ${med} ms, max ${max} ms, Verteilung ${JSON.stringify(dist)}`);
}

console.log(`\nSchwerste Technik in zufälligen minimalen Sudokus (${seconds} s):`);
const hardest = {}; const contains = {}; let n = 0; const t0 = performance.now();
while (performance.now() - t0 < seconds * 1000) {
  n++;
  const full = E.generateFullGrid();
  const p = E.carveSync(full, 6, order());
  const r = E.rateLevel(p, full, 6);
  const techs = Object.keys(r.used);
  const maxL = Math.max(...techs.map(t => E.TECH[t].level));
  const top = techs.filter(t => E.TECH[t].level === maxL).sort().join('+');
  hardest[top] = (hardest[top] || 0) + 1;
  for (const t of techs) contains[t] = (contains[t] || 0) + 1;
}
console.log(`  ${n} Sudokus`);
for (const [k, v] of Object.entries(hardest).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(34)} ${String(v).padStart(4)}  ${(100 * v / n).toFixed(1)} %`);
console.log('\nAnteil der Sudokus, in denen eine Technik vorkommt:');
for (const [k, v] of Object.entries(contains).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${String(v).padStart(4)}  ${(100 * v / n).toFixed(1)} %`);
