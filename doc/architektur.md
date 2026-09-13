# Sudoku-Trainer: Architektur und Entwurfsentscheidungen

Stand: September 2026. Die gesamte App liegt in `index.html`. Dieses Dokument beschreibt den inneren Aufbau, die Lösungstechniken, die Schwierigkeitsbewertung, die Erzeugung und das Trainer-Konzept sowie die Messungen, die die Stufeneinteilung begründen.

## 1. Aufbau der Datei

| Abschnitt | Inhalt |
|---|---|
| `<style>` | Layout (Raster links, Panel mit Reitern rechts, ab 900 px untereinander), helles und dunkles Farbschema über `prefers-color-scheme`. |
| `<body>` | Kopfzeile, Raster, Ziffernblock, Werkzeugleiste, Statuszeile, Panel mit den Reitern Spiel, Hinweis, Trainer, Eingabe, Hilfe. |
| Script, Abschnitt **ENGINE START … ENGINE END** | Reine Logik ohne DOM-Zugriff. Wird von den Tests direkt aus der HTML-Datei extrahiert (`tests/load-engine.js`). |
| Script, `RUNGS` | Regelleiter des Trainers (neun Regelgruppen mit Frage- und Prüftexten). |
| Script, `S` und Aktionen | Spielzustand, Undo/Redo, Speicherung, Hinweise, Erzeugung, Eingabemodus, Trainer. |
| Script, Rendering und Ereignisse | Aufbau des Rasters, `render()`, Klick- und Tastaturbehandlung, Start. |

## 2. Datenmodell

- Zellen sind mit 0 bis 80 indiziert (`rowOf`, `colOf`, `boxOf`). `UNITS` enthält 27 Einheiten (9 Zeilen, 9 Spalten, 9 Blöcke), `PEERS[i]` die 20 Zellen, die Zelle `i` «sieht».
- Kandidaten sind Bitmasken: Bit `d` gesetzt bedeutet Ziffer `d` möglich (`ALL = 0b1111111110`).
- Spielzustand `S`: `givens` (Vorgabe ja/nein), `vals` (Werte 0–9), `marks` (manuelle Notizen), `elim` (eigene Streichungen im Automatikmodus), `auto`, `solution`, `unique`, `level`, Historie `hist`/`fut`, aktueller Hinweis `hint`, Trainerzustand `trainer`.
- **Angezeigte Kandidaten**: im Automatikmodus «alle möglichen minus eigene Streichungen», sonst die Notizen. Hinweis-Engine und Trainer arbeiten auf den angezeigten Kandidaten; in Zellen ohne Notizen werden alle möglichen Ziffern angenommen (`effectiveCands`). Dadurch schlägt die Engine keine Streichung erneut vor, die die spielende Person schon gemacht hat.
- Zellbezeichnung in Texten: `Z3S5` = Zeile 3, Spalte 5.

## 3. Löser

### 3.1 Schneller Löser (`solveFast`)
Backtracking mit Bitmasken je Zeile, Spalte, Block und «kleinste Kandidatenmenge zuerst». Zählt Lösungen bis zu einer Obergrenze (Eindeutigkeitsprüfung mit Grenze 2) und erzeugt mit zufälliger Ziffernreihenfolge volle Raster (`generateFullGrid`). Ein Raster mit doppelten Ziffern liefert sofort 0 Lösungen.

### 3.2 Logischer Löser
`firstStep(ctx)` durchläuft die Techniken in der Reihenfolge `ORDER` (nach Stufe sortiert) und liefert den ersten gefundenen Schritt. Jede Technik ist ein Generator, damit der Trainer mit `allSteps` auch alle Fundstellen einer Regelgruppe erhalten kann.

Ein **Schritt** enthält: `tech`, `name`, `level`, `cells` (Musterzellen), `regionCells` (Bereich für Hinweisstufe 2), `digits`, `placements`, `eliminations`, `hint2` (Bereichs-Hinweis) und `explain` (vollständige Begründung auf Deutsch).

| Technik | Stufe | Kern der Implementierung |
|---|---|---|
| Letzte freie Zelle | 1 | Einheit mit genau einer leeren Zelle. |
| Nackter Einer | 1 | Zelle mit genau einem Kandidaten; Begründung nennt, welche Ziffern durch Zeile, Spalte, Block ausgeschlossen sind. |
| Versteckter Einer | 2 | Ziffer mit genau einer möglichen Zelle in einer Einheit; Begründung nennt die blockierenden Zellen. |
| Zeigendes Paar/Tripel | 3 | Kandidaten einer Ziffer im Block liegen in einer Linie. |
| Linie-Block-Reduktion | 3 | Kandidaten einer Ziffer in einer Linie liegen in einem Block. |
| Nacktes Paar / Tripel / Quadrupel | 3 / 4 / 5 | k Zellen mit Vereinigung von genau k Kandidaten (Kombinationen über Zellen mit 2..k Kandidaten). |
| Verstecktes Paar / Tripel / Quadrupel | 3 / 4 / 5 | k Ziffern mit Vereinigung von genau k Zellen. |
| X-Wing / Schwertfisch / Qualle | 4 / 5 / 5 | Basisfische über Zeilen und Spalten: k Linien, deren Kandidatenpositionen genau k Querlinien abdecken. |
| XY-Wing / XYZ-Wing | 4 | Pivot mit 2 bzw. 3 Kandidaten und zwei passende Flügelzellen; Streichung in Zellen, die beide (bzw. alle drei) sehen. |
| Einfache Färbung | 5 | Graph der starken Paare je Ziffer, Zweifärbung je Komponente; Regel «Farbe sieht sich selbst» und «Zelle sieht beide Farben». |
| Versuch und Irrtum | 6 | Zelle mit wenigsten Kandidaten; der falsche Kandidat wird gestrichen. Die Begründung verfolgt die Annahme über Einer bis zum Widerspruch (`propagateSingles`); gelingt das nicht, wird auf tieferes Ausprobieren verwiesen. Braucht die bekannte Lösung. |

Nicht implementiert: Unique Rectangle, Ketten (X-Chain, XY-Chain, AIC), Finned Fish. Sudokus, die nur damit lösbar wären, werden als Stufe 6 bewertet.

### 3.3 Fehlerbehandlung vor Hinweisen (`analyze`)
Bevor ein Schritt gesucht wird, werden geprüft: doppelte Ziffern in einer Einheit, Einträge, die von der Lösung abweichen, und gestrichene Kandidaten, die die Lösungsziffer wären. Jeder Fehler wird wie ein Hinweis in vier Stufen dargestellt (allgemein, Bereich, Zellen, Begründung).

## 4. Schwierigkeitsbewertung (`rateLevel`)
Das Sudoku wird mit dem logischen Löser gelöst; die Stufe ist die höchste Stufe einer benötigten Technik. Weil `ORDER` nach Stufe sortiert ist, wählt der Löser stets die einfachste anwendbare Technik. Die Bewertung ist damit pfadabhängig, aber reproduzierbar. Mit `maxLevel` bricht die Bewertung ab, sobald die Zielstufe überschritten wird (wichtig für die Erzeugung).

## 5. Erzeugung (`generate`, `carveAsync`)
1. Volles Raster zufällig erzeugen.
2. Punktsymmetrisch ausdünnen: Zellenpaare (i, 80−i) in zufälliger Reihenfolge entfernen. Eine Entfernung bleibt nur, wenn das Sudoku eindeutig bleibt und (für Zielstufen 1–5) die Bewertung die Zielstufe nicht überschreitet.
3. Ergebnis bewerten. Stimmt die Stufe, fertig; sonst neuer Versuch. Nach 20 s wird das am nächsten liegende Sudoku geliefert und die tatsächliche Stufe angezeigt.

Die Erzeugung läuft kooperativ (kurze `setTimeout`-Pausen), damit die Oberfläche reagiert und den Versuchszähler anzeigt.

### 5.1 Messungen zur Stufeneinteilung
Verteilung der schwersten Technik in 839 zufälligen, minimalen, punktsymmetrischen Sudokus (nur Eindeutigkeit gefordert):

| Schwerste Technik | Anteil |
|---|---|
| Versteckter Einer | 60 % |
| Versuch und Irrtum | 15 % |
| nur Einer | 8 % |
| Block-Linie (zeigend/Reduktion) | 7 % |
| XY-Wing, XYZ-Wing | 4 % |
| Einfache Färbung (auch mit Wings/Schwertfisch) | 4 % |
| Paare | 1,5 % |
| X-Wing, Tripel | 0,1 % |

Folgerung: Mit X-Wing und Tripeln allein war Stufe 4 praktisch unerreichbar (0 von 150 Versuchen). XY-Wing und XYZ-Wing wurden deshalb Stufe 4 zugeordnet; Quadrupel, Schwertfisch, Qualle und Färbung bilden Stufe 5.

Trefferquote der gezielten Erzeugung (Zielstufe als Obergrenze beim Ausdünnen, je 2 s pro Stufe, Node 24, ungestörtes System):

| Stufe | Versuche | Treffer | ms/Versuch | Wartezeit median | Wartezeit max |
|---|---|---|---|---|---|
| 1 | 917 | 100 % | 2 | sofort | 0,03 s |
| 2 | 778 | 90 % | 3 | sofort | 0,02 s |
| 3 | 741 | 14 % | 3 | 0,01 s | 0,09 s |
| 4 | 732 | 6 % | 3 | 0,03 s | 0,2 s |
| 5 | 641 | 7 % | 3 | 0,03 s | 0,1 s |
| 6 | 1187 | 14 % | 2 | 0,01 s | 0,05 s |

Im Browser kommen die kooperativen Pausen (`setTimeout`) hinzu, so dass die Erzeugung typischerweise unter einer Sekunde dauert. Ein früherer Messlauf unter Last (mehrere Node-Prozesse gleichzeitig) ergab zehnfach höhere Zeiten pro Versuch bei gleichen Trefferquoten; die Trefferquoten sind die robuste Kennzahl.

Freies (nicht symmetrisches) Ausdünnen erhöht die Trefferquote, kostet aber etwa dreimal so viel pro Versuch und ist pro Treffer teurer; deshalb wurde die symmetrische Variante beibehalten. Reproduzierbar mit `cd tests && node bench.js`.

## 6. Hinweise in vier Stufen
`S.hint = { step, level }`. Jeder Klick auf «Hinweis» erhöht `level`:
1. nur Technikname und allgemeine Beschreibung,
2. zusätzlich `hint2` und leichte Hervorhebung von `regionCells`,
3. zusätzlich gelbe Markierung der Musterzellen und fette Kandidaten,
4. vollständige Begründung, Vorschau der Platzierung (grün) bzw. rot durchgestrichene Streichungen, Knopf «Anwenden».

Jede Änderung am Brett verwirft den aktuellen Hinweis, ausser sie stammt aus «Anwenden».

## 7. Trainer-Konzept
Ziel ist das Einüben einer systematischen Prüfreihenfolge. Die Regelleiter `RUNGS` fasst die Techniken in neun Gruppen (Einer, versteckter Einer, Block-Linie, nackte Gruppen, versteckte Gruppen, Fische, Wings, Färbung, Versuch und Irrtum).

Ablauf pro Regel: Frage «Ist die Regel anwendbar?»
- **Nein** und tatsächlich keine Fundstelle: bestätigt, nächste Regel. Sonst Korrektur mit Bereichs-Tipp (Hinweisstufe 2).
- **Ja**: Zelle anklicken. Treffer werden gegen alle Fundstellen der Gruppe geprüft. Bei Platzierungsregeln folgt die Zifferneingabe, bei Streichregeln die Begründung mit «Anwenden» oder manuellem Streichen (der Trainer erkennt, wenn alle Streichungen erfolgt sind).
- **Zeigen** deckt die erste Fundstelle mit vollständiger Begründung auf und zählt als «gezeigt».

Im Trainer werden falsche Ziffern abgelehnt und begründet (Konflikt mit sichtbarer Zelle oder Abweichung von der Lösung). Nach jeder Änderung des Bretts springt die Leiter auf Regel 1 zurück, weil sich durch jede Platzierung neue einfache Schritte ergeben können. Beim Start werden automatische Kandidaten eingeschaltet.

## 8. Eingabemodus und Validierung
Im Eingabemodus setzen Ziffern Vorgaben. `validatePuzzle` prüft Widersprüche, mindestens 17 Vorgaben, Lösungsanzahl (0, 1, ≥2) und bewertet eindeutige Sudokus. Mehrdeutige Sudokus dürfen gespielt werden, dann ohne Lösungsabgleich und ohne Versuch-und-Irrtum-Hinweise (`S.unique = false`, `S.solution = null`). Jede Änderung nach einer Prüfung verwirft das Prüfergebnis, damit kein veralteter Lösungsstand übernommen wird.

## 9. Speicherung
Der Zustand wird bei jeder Änderung als JSON unter dem Schlüssel `sudoku-trainer-v1` im `localStorage` gespeichert und beim Laden wiederhergestellt. Es werden keine Daten übertragen.

## 10. Tests
Siehe `tests/`:
- `engine.test.js`: Parser, Konflikte, schneller Löser, Bewertung bekannter Sudokus, Soundness aller Schritte gegen die Lösung in zufälligen Sudokus, synthetische Quadrupel, Einhaltung der Zielstufe beim Ausdünnen.
- `ui.test.js`: Headless-Tests der Oberfläche mit jsdom (Eingabe, Kandidaten, Prüfen, Hinweisstufen, Eingabemodus, Trainerabläufe, Erzeugung, Tastatur, Speicherung).
- `bench.js`: Messungen aus Abschnitt 5.1.

Während der Entwicklung wurden über 22 000 Lösungsschritte in mehr als 400 zufälligen Sudokus geprüft, ohne eine falsche Platzierung oder Streichung. Schwertfisch trat dabei viermal auf und war korrekt; Quadrupel kommen in Zufallssudokus praktisch nicht vor und wurden synthetisch getestet.

## 11. Bekannte Grenzen
- Die Bewertung ist die «greedy»-Bewertung eines Lösungspfads, keine Minimalbewertung über alle Pfade.
- Stufe 6 bedeutet «mit den implementierten Techniken nicht lösbar», nicht «nur durch Raten lösbar»: Ketten-Techniken fehlen.
- Die Erzeugung der Stufen 3 bis 6 hat eine Zufallskomponente; selten wird nach 20 s eine Nachbarstufe geliefert (wird angezeigt).
- Die Erklärung bei Versuch und Irrtum ist nur dann eine vollständige Kette, wenn die Annahme über Einer zum Widerspruch führt.
