'use strict';
/* Lädt die DOM-freie Engine direkt aus ../index.html (Abschnitt zwischen
   der ersten Konstante und dem Marker ENGINE END), damit die Tests immer
   gegen den tatsächlichen Quellcode der App laufen. */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const start = html.indexOf('const ALL = ');
const endMarker = html.indexOf('ENGINE END');
if (start < 0 || endMarker < 0) throw new Error('Engine-Marker in index.html nicht gefunden');
const end = html.lastIndexOf('/*', endMarker);
const code = html.slice(start, end);

// eval liefert den Wert des letzten Ausdrucks zurück; so werden die
// mit const deklarierten Engine-Funktionen exportiert.
module.exports = eval(code + `
;({ ALL, bit, popcount, digitsOf, rowOf, colOf, boxOf, UNITS, PEERS, cellName, unitName, sees,
    fmtElims, combinations, shuffle, computeCands, findConflicts, solveFast, generateFullGrid,
    TECH, ORDER, LEVELS, FINDERS, firstStep, allSteps, applyStepToCtx, rateLevel, carveSync,
    gridToString, parseGrid, propagateSingles })`);
module.exports.htmlPath = htmlPath;
module.exports.html = html;
