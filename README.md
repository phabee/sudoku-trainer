# Sudoku-Trainer

Eigenständige Einzelseiten-App (eine HTML-Datei, kein Server, keine externen Abhängigkeiten) zum Lösen, Erzeugen und vor allem zum **Erlernen** von Sudoku-Strategien.

Öffnen: `index.html` im Browser (Doppelklick genügt). Der Spielstand wird lokal im Browser gespeichert, es werden keine Daten übertragen.

## Funktionen

- **Sudokus erzeugen** in sechs Schwierigkeitsstufen, beliebig viele. Die Stufe wird aus der schwersten Technik bestimmt, die ein menschlicher Löser benötigt.
- **Eigene Sudokus eingeben**, direkt im Raster oder als Text mit 81 Zeichen (`.`, `0` oder `_` für leere Felder).
- **Gültigkeit prüfen**: Widersprüche, Mindestzahl an Vorgaben, Anzahl Lösungen (keine, genau eine, mehrere) und geschätzte Schwierigkeit.
- **Eingaben prüfen**: Doppelte Ziffern werden sofort rot markiert, optional auch Abweichungen von der Lösung.
- **Kandidaten** (Notizen) manuell setzen oder automatisch berechnen lassen; eigene Streichungen bleiben im Automatikmodus erhalten.
- **Schrittweise Hinweise** in vier Stufen: 1) welche Technik, 2) in welchem Bereich, 3) welche Zellen, 4) vollständige Begründung mit Ergebnis und «Anwenden».
- **Trainer-Modus**: führt durch eine feste Regelleiter von einfach bis schwierig. Bei jeder Regel entscheidet die lernende Person selbst, ob sie anwendbar ist, zeigt die Zelle und trägt die Ziffer ein. Der Trainer bestätigt, korrigiert mit Begründung oder zeigt den Fund. Nach jeder Änderung beginnt die Prüfung wieder bei Regel 1.
- **Lösen**: nächsten logischen Schritt ausführen, alle Einer eintragen oder das ganze Sudoku lösen.
- Rückgängig/Wiederholen, Tastatursteuerung, Export als Text, Zeitmessung, dunkles Farbschema.

## Schwierigkeitsstufen

| Stufe | Name | Schwerste benötigte Technik |
|---|---|---|
| 1 | Sehr leicht | Letzte freie Zelle, nackter Einer |
| 2 | Leicht | Versteckter Einer |
| 3 | Mittel | Block-Linie-Wechselwirkung, nacktes/verstecktes Paar |
| 4 | Schwer | Nacktes/verstecktes Tripel, X-Wing, XY-Wing, XYZ-Wing |
| 5 | Sehr schwer | Quadrupel, Schwertfisch, Qualle, einfache Färbung |
| 6 | Extrem | Versuch und Irrtum (keine der obigen Techniken reicht) |

Die Erzeugung dauert je nach Stufe meist unter einer Sekunde, bei Stufe 4 und 5 gelegentlich einige Sekunden. Nach 20 Sekunden wird das am nächsten liegende gefundene Sudoku geliefert und die tatsächliche Stufe angezeigt.

## Bedienung

| Aktion | Eingabe |
|---|---|
| Zelle wählen | Klick oder Pfeiltasten |
| Ziffer setzen | `1`–`9` oder Ziffernblock unter dem Raster |
| Löschen | `Entf`, `Backspace`, `0` |
| Kandidat umschalten | `Shift`+Ziffer oder Kandidaten-Modus (`N`) |
| Hinweis (nächste Stufe) | `H` |
| Rückgängig / Wiederholen | `Ctrl`+`Z` / `Ctrl`+`Y` |
| Auswahl und Markierungen aufheben | `Esc` |

Hinweise und Trainer beziehen sich auf die angezeigten Kandidaten. In Zellen ohne Notizen werden alle noch möglichen Ziffern angenommen.

## Aufbau

Alles liegt in `index.html`:

- **Engine** (Abschnitt `ENGINE START` bis `ENGINE END`, ohne DOM-Zugriff): Bitmasken-Backtracking-Löser zum Zählen der Lösungen und Erzeugen voller Raster; logischer Löser mit 18 Techniken, der pro Schritt Zellen, Streichungen, Platzierungen und deutsche Erklärtexte liefert; Schwierigkeitsbewertung; symmetrisches Ausdünnen unter Einhaltung der Zielstufe.
- **Trainer-Regelleiter**: neun Regelgruppen mit Frage- und Prüftexten.
- **Zustand und UI**: Spielzustand, Undo-Historie, Speicherung im `localStorage`, Rendering des Rasters, Hinweis- und Trainer-Panels, Eingabemodus.

Die Engine lässt sich isoliert in Node testen, indem man den Abschnitt zwischen den Markern extrahiert und lädt. So wurde die Korrektheit aller Techniken gegen bekannte Lösungen über mehr als 20 000 Lösungsschritte geprüft.

## Tests und Dokumentation

Die Engine wird von den Tests direkt aus `index.html` geladen, es gibt keine Kopie des Quellcodes.

```
cd tests
npm install        # einmalig, installiert jsdom für die UI-Tests
npm test           # Engine- und UI-Tests (Node ab Version 20)
npm run bench      # Trefferquote und Wartezeit der Erzeugung pro Stufe
```

- [tests/engine.test.js](tests/engine.test.js): Löser, Bewertung bekannter Sudokus, Korrektheit aller Schritte gegen die Lösung, synthetische Quadrupel, Einhaltung der Zielstufe.
- [tests/ui.test.js](tests/ui.test.js): Headless-Tests der Oberfläche (Eingabe, Kandidaten, Hinweisstufen, Trainer, Eingabemodus, Erzeugung).
- [doc/architektur.md](doc/architektur.md): Aufbau, Techniken, Bewertung, Erzeugung, Trainer-Konzept und die Messungen, die die Stufeneinteilung begründen.

## Lizenz und Herkunft

Dieses Projekt steht unter der [MIT-Lizenz](LICENSE). Eigenentwicklung ohne Fremdcode und ohne externe Bibliotheken in der App selbst; die Technikbezeichnungen folgen der gängigen Sudoku-Literatur. Die Tests verwenden [jsdom](https://github.com/jsdom/jsdom) (MIT-Lizenz) als reine Entwicklungsabhängigkeit, die nicht mit der App ausgeliefert wird.
