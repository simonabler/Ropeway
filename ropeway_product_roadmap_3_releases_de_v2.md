# Ropeway Produkt-Roadmap (3 Releases)

Stand: 2026-04-18  
Format: Roadmap + umsetzungsreife Issues für AI-Agenten  
Produktthese: **Ropeway sollte als engineering-orientiertes Planungstool positioniert werden**: schnell und im Feld nutzbar wie eine Planungs-PWA, aber technisch glaubwürdiger und entscheidungsorientierter als ein einfacher Spannfeldrechner.

---

## 0. Warum diese Roadmap

Die aktuelle Codebasis hat bereits das richtige Rückgrat:

- einen Projektworkflow mit Gelände, Stützen, Seilkonfiguration, Berechnung, Visualisierung und Export
- einen **Planning**-Pfad mit `parabolic`, `catenary` und `catenary-piecewise`
- einen **Engineering**-Pfad mit `global-elastic-catenary`
- engineering-spezifische Seileingaben wie `elasticModulusKNPerMm2` und `fillFactor`
- Engineering-Designmodi `selected` und `worst-case`
- Engineering-Ergebnismetadaten einschließlich `engineeringMetrics` und optional einer Hüllkurve

Die Positionierung ist aber noch weicher, als sie sein könnte, weil:

- die Solver-Semantik an der Produktoberfläche noch nicht stark genug ausgeprägt ist
- die technische Stationsmodellierung noch schwächer ist als die Mechanik darunter
- Engineering V1 explizit festhält, dass es **keine Sattelreibung** und **keine Mast-/Ankernachgiebigkeit** gibt
- weiterhin kein dedizierter Stationseditor in der aktuellen Produktrichtung vorhanden ist
- `presetModified$` noch unvollständig ist
- die Testabdeckung noch gering ist
- Validierungs- und Kalibrierungs-Workflows noch fehlen

Diese Roadmap optimiert daher **nicht** auf Breite. Sie optimiert auf **Glaubwürdigkeit, technische Klarheit und differenzierte Entscheidungsunterstützung**.

---

## 1. Release-Überblick

## Release 1 — Produkt schärfen und die technische Eingabeschicht härten
**Ziel:** Die App soll sich eindeutig wie ein engineering-orientiertes Planungstool anfühlen und nicht nur wie ein Routen-Sketcher mit Solver.  
**Thema:** Semantik, Eingaben, Vertrauen, Basisqualität.  
**Ergebnis:** Nutzer verstehen Planning vs. Engineering, können technische Endpunktdaten sauber eingeben und sehen vertrauenswürdige Ergebnismetadaten.

### Exit-Kriterien für Release 1
- Planning und Engineering sind in UI, Texten, Exporten und persistierten Ergebnismetadaten klar getrennt.
- Start- und Endstation können als technische Entitäten bearbeitet werden und werden nicht nur aus der Routen-Geometrie abgeleitet.
- Die Preset-Integrität ist verlässlich und nachvollziehbar.
- Es existiert eine minimale Regressions-/Benchmark-Suite für Solver und zustandskritische Pfade.

---

## Release 2 — Engineering-Glaubwürdigkeit in den Ergebnisraum bringen
**Ziel:** Den Engineering-Modus von „gute technische Richtung“ zu einem „glaubwürdigen arbeitsfähigen Engineering-Modus“ weiterentwickeln.  
**Thema:** Hüllkurven, strukturelle Checks, Realismus-Module, Berichtsfähigkeit.  
**Ergebnis:** Engineering-Nutzer sehen maßgebende Lastfälle, strukturelle Konsequenzen und Modellgrenzen direkt in der Ergebnisebene.

### Exit-Kriterien für Release 2
- Der Engineering-Modus zeigt Designmodus, aktiven Fall und Hüllkurvenfall klar an.
- Die strukturellen Ausgaben gehen über Seillinie + Zugkraft hinaus.
- Optionale Realismus-Korrekturen existieren hinter expliziten Annahme-Schaltern.
- Engineering-Berichte sind entscheidungsreif und auditierbar.

---

## Release 3 — Differenzierung durch Entscheidungsunterstützung und Validierung
**Ziel:** Ropeway stärker als einen Rechner machen, indem Nutzer beim Vergleichen, Kalibrieren und Auswählen von Varianten unterstützt werden.  
**Thema:** Assistierte Planung, Szenarienvergleich, Validierung, Unsicherheit.  
**Ergebnis:** Ropeway wird zu einem Nischenwerkzeug für engineering-orientierte Planungsentscheidungen und nicht nur für Einzelfallanalysen.

### Exit-Kriterien für Release 3
- Nutzer können Routen- und Stützenvarianten vergleichen.
- Kalibrierungs- und Benchmark-Workflows existieren.
- Unsicherheit und Szenarienvergleich sind in Berichten und UI sichtbar.
- Mindestens ein Entscheidungsunterstützungs-Workflow erzeugt gerankte Alternativen.

---

## 2. Lieferregeln für alle Issues

Jedes untenstehende Issue ist so formuliert, dass es an einen AI-Coding-Agenten übergeben werden kann.  
Für jede Implementierung muss der Agent diese Projektregeln einhalten:

- Angular **Standalone Components** und lazy `loadComponent()` Routing beibehalten.
- Projektmutationen, wo sinnvoll, über `ProjectStateService` führen.
- Die bestehenden Semantiken des Projektmodells (`startStation`, `endStation`, `supports`, `calculationResult`) **nicht** brechen.
- Berechnungslogik **nicht** vereinfachen, wenn sich dadurch die Ergebnisrelevanz ändert.
- PDF-, DXF- und JSON-Exportpfade erhalten.
- Nach Möglichkeit Rückwärtskompatibilität für bereits gespeicherte Projekte sicherstellen.
- Für jede Verhaltensänderung, die Berechnung, Persistenz oder interpretationskritische UI betrifft, Tests ergänzen oder aktualisieren.

---

# Release 1 — Produktkern schärfen und härten

## Issue R1-01 — Produktsemantik sauber zwischen Planning und Engineering trennen

### Warum das wichtig ist
Das Repo unterstützt bereits `calculationMode = 'planning' | 'engineering'`, und das Ergebnis-Modell speichert `solverFamily`, `method`, `modelAssumptions` und optionale `engineeringMetrics`. Das Produkt wirkt aber noch zu leicht wie ein unscharfer Einzelrechner statt wie zwei klar unterschiedliche Werkzeugmodi.

### Problem
Nutzer können missverstehen:
- was „Planning“-Ergebnisse physikalisch bedeuten
- was „Engineering“-Ergebnisse zusätzlich leisten
- welche Annahmen für welches Ergebnis gelten
- ob ein exportiertes Ergebnis eher für Screening oder für ein Engineering-Review geeignet ist

### Ziel
Die Unterscheidung zwischen **Planning** und **Engineering** explizit machen – in:
- UI-Labels
- Texten im Berechnungspanel
- Ergebnismetadaten
- PDF-Export
- Projekt-Persistenz-Defaults
- Hilfetext / Glossar

### Gewünschtes Verhalten
- Nutzer wählen zuerst eine **Mode Family**: `Planning` oder `Engineering`.
- Planning bietet die Planning-Solver an:
  - `parabolic`
  - `catenary`
  - `catenary-piecewise`
- Engineering bietet an:
  - `global-elastic-catenary`
  - `engineeringDesignMode = selected | worst-case`
- Jede Ergebnis-Karte und jeder Export zeigt sichtbar:
  - Mode Family
  - Methode
  - maßgebenden Lastfall
  - Zusammenfassung der Annahmen
  - Text zum „intended use“

### In Scope
- Calculation-Mode-Selektor in der UI
- bessere Solver-Beschreibungen
- Ergebnis-Badges und Annahmen-Panel
- Export-Metadatenblock
- Glossar-/Hilfetexte
- Migration/Defaulting für Legacy-Projekte ohne expliziten Modus

### Out of Scope
- Änderung der zugrunde liegenden Physik
- Einführung neuer Engineering-Solver über die aktuelle Familie hinaus
- Kalibrierungsfunktionen

### Wahrscheinliche Dateien/Module
- `models/project.model.ts`
- `models/calculation.model.ts`
- `services/state/project-state.service.ts`
- `features/calculation/calculation-results/*`
- `features/cable/cable-config/*`
- `services/export/pdf-export.service.ts`
- `README.md`
- optional `CONTEXT.md`

### Implementierungshinweise
- Bestehende `solverType`-Werte beibehalten.
- Ein stabiles UI-Schichtkonzept einführen:
  - `Planning family`
  - `Engineering family`
- Sicherstellen, dass alte Projekte ohne `calculationMode` auf `planning` defaulten.
- Sicherstellen, dass bestehende Engineering-Projekte korrekt weiter gerendert werden.

### Akzeptanzkriterien
- Nutzer können vor der Berechnung sichtbar erkennen, in welchem Modus sie sich befinden.
- Das Ergebnis-Panel zeigt Mode Family, Methode und Annahmen.
- Der PDF-Report enthält einen klaren Annahmenblock und einen Hinweis zum vorgesehenen Einsatz.
- Legacy-Projekte laden ohne Bruch.
- Unit-Tests decken Defaults und Mode-Switch-Verhalten ab.

### Empfohlene Tests
- Legacy-Projekt ohne `calculationMode` lädt als `planning`
- Wechsel der Family aktualisiert die verfügbaren Solver-Optionen
- Engineering-Ergebnis rendert `engineeringMetrics`
- PDF-Export enthält Modus-/Annahmen-Metadaten

---

## Issue R1-02 — Einen dedizierten technischen Stationseditor für Start- und Endstation ergänzen

### Warum das wichtig ist
Die Codebasis modelliert bereits `startStation` und `endStation`, aber die aktuelle Repo-Richtung weist weiter darauf hin, dass es keine dedizierte Stations-UI gibt und dass der Karten-Endpunkt nicht mit einem technischen Endpunkt identisch ist. Das schwächt die engineering-orientierte Identität.

### Problem
Das Produkt vermischt derzeit:
- geografische Routendefinition
- technische Stationsdefinition

Dadurch entsteht Unklarheit bei:
- Ankergeometrie
- Interpretation der Stationshöhe
- technischen Endpunkteingaben
- Engineering-Review-Fähigkeit

### Ziel
Einen dedizierten Stationseditor einführen, der `startStation` und `endStation` als technische Objekte mit expliziter ingenieurfachlicher Bedeutung behandelt.

### Gewünschtes Verhalten
Nutzer können für jeden Endpunkt bearbeiten:
- Stationslänge
- Referenz-Geländehöhe
- Aufhängungs-/Ankerhöhe über Gelände
- optionale Anker-Metadaten
- Notizen / Kennung
- ob Endpunktwerte automatisch abgeleitet oder manuell überschrieben werden

Die Karte bleibt geografisch, aber der Stationseditor wird zur technischen Source of Truth.

### In Scope
- Stationseditor-UI
- Start-/Endstations-Formulare
- Status-Synchronisierung über `ProjectStateService`
- Validierungsmeldungen
- klare Beziehung zwischen `endPoint` (geografisch) und `endStation` (technisch)

### Out of Scope
- automatische Ankerauslegung
- Bemessung von Ankerbäumen
- strukturelle Stützennachweise

### Wahrscheinliche Dateien/Module
- `models/end-station.model.ts`
- `models/project.model.ts`
- `services/state/project-state.service.ts`
- `features/project/project-detail/*`
- neuer Feature-Ordner, z. B. `features/station/station-editor/*`
- `features/map/map-container/*`
- `features/calculation/calculation-results/*`

### Implementierungshinweise
- Routen-Geometrie nicht entfernen.
- `endPoint` für geografische Routenbearbeitung beibehalten.
- `endStation` als Engineering-Endpunktobjekt beibehalten.
- Eine kleine UI-Erklärung ergänzen:
  - „Map endpoint = geografische Position“
  - „Station editor = technische Endpunktparameter“

### Akzeptanzkriterien
- Nutzer können Start-/Endstationsparameter direkt im Workflow bearbeiten.
- Die Berechnung verwendet Stationseditor-Werte konsistent.
- Die UI unterscheidet klar zwischen geografischem Endpunkt und technischer Station.
- Bestehende Projekte laden mit sinnvollen Defaults.
- Validierung verhindert offensichtlich inkonsistente Endpunktdaten.

### Empfohlene Tests
- Stationsänderungen werden gespeichert und erneut geladen
- Berechnung reagiert auf geänderte Ankerhöhe
- Engineering- und Planning-Modus konsumieren beide Stationseditor-Daten
- Legacy-Projekte füllen Stationsfelder sicher nach

---

## Issue R1-03 — Preset-Integrität abschließen: echtes `presetModified$`, Löschbereinigung und Preset-Versionierung

### Warum das wichtig ist
Preset-Vertrauen ist zentral, weil Ropeway im Feld eingesetzt werden soll. Im aktuellen Repo gibt es noch offene Probleme im Preset-Zustand, einschließlich unvollständigem `presetModified$`, Inkonsistenzen beim Löschen und keinem Migrations-/Versionierungspfad für Updates von System-Presets.

### Problem
Das Preset-Verhalten ist für ein engineering-orientiertes Tool noch nicht stark genug:
- Nutzer wissen möglicherweise nicht, ob die aktive Konfiguration noch zum Preset passt
- gelöschte Presets können veraltete Referenzen hinterlassen
- aktualisierte System-Presets propagieren möglicherweise nicht sauber in bestehende Client-Installationen

### Ziel
Presets deterministisch, inspizierbar und migrationssicher machen.

### Gewünschtes Verhalten
- `presetModified$` wird real und verlässlich
- das Löschen eines ausgewählten Presets bereinigt persistierte Referenzen sicher
- System-Presets werden versioniert und migriert
- die UI zeigt:
  - Preset-Herkunft
  - modifiziert/unmodifiziert-Zustand
  - Preset-Version
  - fehlender/gelöschter Preset-Zustand

### In Scope
- Preset-Vergleichslogik
- Löschbereinigung
- Versionierung/Migration von System-Presets
- UI-Zustandsindikator
- Migrationstests

### Out of Scope
- vollständige Cloud-Synchronisation
- Herstellerbibliotheken
- erweiterter Preset-Import/-Export

### Wahrscheinliche Dateien/Module
- `services/state/project-state.service.ts`
- `services/presets/cable-preset.service.ts`
- `features/cable/cable-config/*`
- `services/storage/indexed-db.service.ts`
- Preset-JSON-Assets

### Implementierungshinweise
- Eine stabile Preset-Version/einen Hash zum Vergleichen speichern.
- Der Vergleich soll irrelevante Formatierungs-/Default-Unterschiede ignorieren.
- Gelöschte Preset-Referenzen robust behandeln:
  - aktuelle Werte erhalten
  - ungültige `cablePresetId` entfernen
  - Warnstatus anzeigen

### Akzeptanzkriterien
- `presetModified$` spiegelt tatsächliche Konfigurationsänderungen wider.
- Das Löschen eines Presets hinterlässt nie eine defekte Referenz.
- Updates von System-Presets können bestehende Installationen migrieren.
- Die Kabelkonfigurations-UI erklärt den Preset-Status klar.

### Empfohlene Tests
- Konfigurationsänderung schaltet den Modifiziert-Zustand um
- Löschen eines ausgewählten Presets entfernt die Projekt-Referenz
- Erhöhung der System-Preset-Version triggert den Migrationspfad
- fehlendes Preset wird als verwaiste Referenz angezeigt, nicht als harter Fehler

---

## Issue R1-04 — Eine minimal tragfähige Benchmark- und Regressions-Suite für Berechnungsvertrauen erstellen

### Warum das wichtig ist
Ein Tool, das als engineering-orientiert positioniert wird, muss sich gegen Regressionen verteidigen können. Der Repo-Kontext nennt die begrenzte Testabdeckung weiterhin als Lücke.

### Problem
Ohne Referenzszenarien können Solver-Änderungen stillschweigend verschieben:
- minimale Bodenfreiheit
- maximale Seilzugkraft
- Stützenreaktionen
- maßgebende Lastpositionen
- Engineering-Hüllkurvenausgaben

### Ziel
Einen Benchmark-Harness schaffen, der die aktuelle Mechanik in ein regressionsgeschütztes System überführt.

### Gewünschtes Verhalten
Einen kleinen Satz kanonischer Szenarien ergänzen:
1. einfaches Einfeld-Planning / parabolic
2. einfaches Einfeld-Planning / catenary
3. belasteter stückweiser Fall mit Last nicht in Feldmitte
4. Mehrfeld-Engineering im `selected`-Modus
5. Mehrfeld-Engineering im `worst-case`-Hüllkurvenmodus

Jeder Fall soll prüfen:
- `isValid`
- `method`
- Bereich für minimale Bodenfreiheit
- Bereich für maximale Zugkraft
- Design-Check-Metadaten
- ausgewählte Warnungen / Annahmen
- wichtige strukturelle Ausgaben, falls vorhanden

### In Scope
- Benchmark-Fixture-Format
- Test-Helper
- deterministische Projekt-Fixtures
- numerische Toleranz-Assertions
- CI-fähige Tests

### Out of Scope
- Import externer Messdaten
- vollständige Validierung gegen Felddaten
- Unsicherheitsanalyse

### Wahrscheinliche Dateien/Module
- `services/calculation/**/*`
- `models/*`
- `tests` oder bestehende Angular/Vitest-Testorte
- ggf. `assets/examples/` oder `test/fixtures/`

### Implementierungshinweise
- Bereiche/Toleranzen statt exakter Floating-Point-Matches bevorzugen.
- „Mechanik-Regressions-Fixtures“ von UI-Tests trennen.
- Fixture-Projekte später als wiederverwendbare Beispielprojekte nutzbar machen.

### Akzeptanzkriterien
- Mindestens 5 Referenzszenarien laufen in automatisierten Tests.
- Solver-Änderungen, die Ergebnisse materiell verschieben, lassen Tests fehlschlagen.
- Der Test-Harness ist lesbar genug für künftige Erweiterungen.
- Die Dokumentation erklärt, welchen Schutz jedes Benchmark-Szenario liefern soll.

### Empfohlene Tests
- kompletter Suite-Lauf unter lokalem Test-Kommando
- Regressions-Fixtures pro Solver
- Engineering-Hüllkurven-Fixture mit gesampelten Lastfällen
- Persistenz-Roundtrip für Benchmark-Projekte

---


## Issue R1-05 — Überfahrbarkeit der Randstützen und aktiv überwachten Bereich fachlich modellieren

### Warum das wichtig ist
Für reale Seiltrassen reicht es nicht, nur Gelände, Stützen und Seillinie zu modellieren. In der Praxis ist zusätzlich entscheidend, **welcher Bereich aktiv überwacht wird** und ob die **erste bzw. letzte Stütze überfahrbar** ist. Diese Information beeinflusst nicht primär die Grundphysik des Seils, aber sehr wohl die **operative Interpretation**, die **Sicherheitsbewertung**, die **Darstellung im Profil**, die **Warnlogik** und die **Berichtsfähigkeit**.

Gerade für ein engineering-orientiertes Planungstool ist das wichtig, weil Nutzer unterscheiden müssen zwischen:
- gesamter geometrischer/technischer Seillinie
- tatsächlich aktiv überwachtem Betriebsbereich
- Randbereichen vor/nach dem überwachten Bereich
- Fällen, in denen die erste oder letzte Stütze vom Fahrbetrieb überfahren werden darf oder nicht

### Problem
Aktuell gibt es im Projektmodell und in der UI keine saubere Fachmodellierung für diese operative Semantik. Dadurch bleiben mehrere Fragen unbeantwortet:
- Ist die erste Stütze nur eine technische Stütze oder darf sie betrieblich überfahren werden?
- Gilt das gleiche für die letzte Stütze?
- Wo beginnt der aktiv überwachte Bereich entlang der Trasse?
- Wo endet er?
- Welche Clearance- oder Warnmeldungen sind innerhalb des überwachten Bereichs kritisch und welche nur informativ?
- Wie soll ein PDF- oder Engineering-Report diese Bereichssemantik dokumentieren?

### Ziel
Eine explizite Fachmodellierung für **überfahrbare Randstützen** und/oder einen **aktiv überwachten Bereich** einführen, die in UI, Persistenz, Visualisierung, Warnlogik und Export sichtbar wird.

Die Lösung soll **nicht** nur als Freitext oder Notiz implementiert werden, sondern als sauberer, auswertbarer Teil des Projektmodells.

### Fachliche Zielrichtung
Die Implementierung soll zwei Nutzungsebenen unterstützen:

1. **Einfache Bedienung**
   - Nutzer können angeben, ob die **erste Stütze** überfahrbar ist
   - Nutzer können angeben, ob die **letzte Stütze** überfahrbar ist

2. **Explizite Engineering-Semantik**
   - Nutzer können einen **aktiv überwachten Bereich** definieren:
     - `activeMonitoredRangeStart`
     - `activeMonitoredRangeEnd`
   - diese Werte sollen entlang der Stationskoordinate/Trassenlänge definiert werden

Die bevorzugte Modellierungsrichtung ist: 
- **expliziter aktiv überwachter Bereich als Source of Truth**
- optionale Convenience-UI für „erste/letzte Stütze überfahrbar“ als abgeleitete oder vereinfachte Bedienform, die die Strecke setzt

### Gewünschtes Verhalten
- Im technischen Workflow gibt es einen Bereich „Betriebs-/Überwachungsbereich“.
- Nutzer können dort entweder:
  - die Überfahrbarkeit der ersten und letzten Stütze festlegen, und/oder
  - Start und Ende des aktiv überwachten Bereichs entlang der Trasse setzen
- Die Profilvisualisierung markiert den aktiv überwachten Bereich klar.
- Ergebnisse und Warnungen unterscheiden sichtbar zwischen:
  - innerhalb des aktiv überwachten Bereichs
  - außerhalb des aktiv überwachten Bereichs
- PDF-Export und JSON-Export enthalten diese Information explizit.
- Falls Randstützen als überfahrbar markiert sind, wird dies im Bericht und in der UI klar ausgewiesen.

### Konkrete Produktwirkung
Diese Funktion stärkt die Positionierung, weil Ropeway damit nicht nur eine mechanische Seillinie zeigt, sondern einen **operativ interpretierbaren Engineering-Korridor**. Das ist für Feldplanung, Sicherheitsdiskussion und Review deutlich wertvoller als reine Kurven- und Kraftausgabe.

### In Scope
- Erweiterung des Projektmodells um überwachten Bereich und/oder Überfahrbarkeits-Semantik
- UI zur Bearbeitung dieser Werte
- Persistenz in IndexedDB / Projekt-JSON
- Visualisierung im Profilchart
- Ergebnis-/Warnlogik mit Bereichsbezug
- Darstellung im PDF-Export
- sinnvolle Legacy-Defaults für bestehende Projekte

### Out of Scope
- Änderung der grundlegenden Seilphysik
- automatische Ableitung betrieblicher Regeln aus Normen
- vollwertige Betriebslogik für Fahrprogramme
- detaillierte Sensor-/Alarm-Integration

### Wahrscheinliche Dateien/Module
- `models/project.model.ts`
- `models/support.model.ts`
- ggf. neues Modell `models/operational-range.model.ts`
- `services/state/project-state.service.ts`
- `features/support/support-placement/*`
- ggf. neuer UI-Bereich im Projektdetail oder Stationseditor
- `features/visualization/profile-chart/*`
- `features/calculation/calculation-results/*`
- `services/export/pdf-export.service.ts`
- `services/export/*` für JSON-Exportpfad

### Implementierungshinweise
- Die Lösung soll **nicht** hart nur an „erste“ und „letzte“ Stütze als Array-Index gekoppelt sein, ohne semantische Absicherung.
- Bevorzugt ein kleines, explizites Fachmodell einführen, zum Beispiel:
  - `operationalEnvelope.activeMonitoredRangeStartStation`
  - `operationalEnvelope.activeMonitoredRangeEndStation`
  - optionale Flags wie `firstSupportTraversable`, `lastSupportTraversable`
- Falls nur die Flags gesetzt werden, kann daraus initial ein Bereich vorgeschlagen oder visualisiert werden.
- Der aktiv überwachte Bereich soll entlang der technischen Stationskoordinate definiert werden, nicht nur grafisch pixelbasiert.
- Warnlogik nicht zerstören: Bestehende physikalische Warnungen bleiben erhalten, erhalten aber optional eine neue Klassifikation, z. B.:
  - `criticalInActiveRange`
  - `outsideActiveRangeInfo`
- Legacy-Projekte ohne diese Daten müssen stabil laden. Ein sinnvoller Default wäre zunächst: aktiver Bereich = gesamter betrieblicher Hauptabschnitt zwischen Start- und Endstation.

### Akzeptanzkriterien
- Nutzer können die Überfahrbarkeit der ersten und letzten Stütze im Workflow explizit angeben oder einen aktiv überwachten Bereich definieren.
- Die Daten werden persistiert und bei erneutem Laden korrekt wiederhergestellt.
- Der Profilchart zeigt den aktiven Bereich sichtbar an.
- Warnungen können erkennbar dem aktiven Bereich zugeordnet werden.
- PDF- und JSON-Export enthalten die Bereichsdefinition und die Überfahrbarkeitsangaben.
- Bestehende Projekte bleiben kompatibel und erhalten sinnvolle Defaults.

### Empfohlene Tests
- Legacy-Projekt lädt mit Default für den aktiven Bereich
- Änderungen an Bereichsstart/-ende werden gespeichert und korrekt erneut geladen
- Profilchart rendert den aktiven Bereich deterministisch
- Warnungen innerhalb und außerhalb des aktiven Bereichs werden unterschiedlich gekennzeichnet
- Export enthält neue Felder für Bereichsdefinition und Randstützen-Semantik

### Zusätzliche Agent-Anweisung
Wenn bei der Implementierung entschieden werden muss, ob **nur Flags auf Randstützen** oder ein **expliziter Bereich** modelliert werden soll, dann den expliziten Bereich bevorzugen und die Randstützen-Flags als Bedienhilfe oder abgeleitete Semantik behandeln. Die Produktpositionierung profitiert stärker von einem klaren Engineering-Modell als von einer rein UI-orientierten Sonderlogik.

---

# Release 2 — Engineering-Glaubwürdigkeit in den Ergebnisraum bringen

## Issue R2-01 — Einen Engineering-Workspace mit Ansichten für ausgewählten Fall vs. Worst-Case-Hüllkurve ergänzen

### Warum das wichtig ist
Der Engineering-Pfad unterstützt bereits `engineeringDesignMode = selected | worst-case` und kann eine Hüllkurve berechnen. Das ist technisch stark, aber das Produkt braucht einen dedizierten Workspace, damit sich der Engineering-Modus wie ein echter Analysemodus anfühlt und nicht nur wie ein anderer Service-Call.

### Problem
Der aktuelle Ergebnisraum kommuniziert vermutlich zu schwach:
- ob die gezeigte Geometrie der ausgewählte Fall oder der maßgebende Fall ist
- wie viele Lastpositionen gesampelt wurden
- welche Station/welches Spannfeld kritisch ist
- ob der Nutzer aktive Geometrie oder ein Hüllkurven-Artefakt betrachtet

### Ziel
Einen dedizierten Engineering-Workspace in der UI ergänzen.

### Gewünschtes Verhalten
Engineering-Ergebnisse zeigen:
- Designmodus-Selektor (`selected`, `worst-case`)
- Zusammenfassung des aktiven Falls
- Zusammenfassung des maßgebenden Lastfalls
- Hüllkurven-Zusammenfassung
- Anzahl der gesampelten Lastfälle
- gelöste Horizontalkraft
- Tabelle zur Spannfeldverlängerung
- Umschalter zwischen:
  - aktiver belasteter Geometrie
  - Worst-Case-Hüllkurvengeometrie (falls verfügbar)

### In Scope
- Engineering-Ergebnispanel
- Engineering-Metrik-Tabelle
- Hüllkurven-Visualisierung
- Designmodus-Steuerung
- Bereinigung von Warn-/Info-Messages

### Out of Scope
- neue Physik ergänzen
- Kalibrierung
- Routenoptimierung

### Wahrscheinliche Dateien/Module
- `models/calculation.model.ts`
- `services/calculation/engineering/global-engineering-calculator.service.ts`
- `features/calculation/calculation-results/*`
- `features/visualization/profile-chart/*`
- `services/export/pdf-export.service.ts`

### Implementierungshinweise
- Planning-UI einfach halten; diesen Workspace nur im Engineering-Modus zeigen.
- Zuerst bestehende `engineeringMetrics` und `designCheck` nutzen, bevor neue Datenstrukturen erfunden werden.
- Sicherstellen, dass die Hüllkurvengeometrie nicht mit einer realen Einzelfall-Seilform verwechselt werden kann.

### Akzeptanzkriterien
- Engineering-Modus hat einen sichtbar anderen Ergebnis-Workspace.
- Nutzer können ausgewählten Fall und Worst-Case-Hüllkurve unterscheiden.
- Hüllkurven-Metadaten enthalten Anzahl gesampelter Lastfälle und Ort der kritischen Bodenfreiheit.
- Export enthält dieselben Unterscheidungen.

### Empfohlene Tests
- Engineering-Ergebnis im `selected`-Modus rendert ohne Hüllkurve
- Engineering-Ergebnis im `worst-case`-Modus rendert Hüllkurven-Zusammenfassung
- Umschalten zwischen aktiv/Hüllkurve beschädigt das persistierte Ergebnis nicht
- PDF-Export enthält Engineering-Workspace-Metadaten

---

## Issue R2-02 — Strukturelle Ausgaben erweitern: Knickwinkel, Sattelprüfungen, Abhebe-/Kontaktzustand

### Warum das wichtig ist
Für ein engineering-orientiertes Planungstool reicht „Seillinie + maximale Zugkraft“ nicht. Die nächste Ebene praktischen Ingenieurwerts ist die Interpretation von Stützen und Sätteln.

### Problem
Strukturelle Konsequenzen an Stützen sind noch unterrepräsentiert:
- Knickwinkel an der Stütze
- Sattel-Kontakt-/Abhebezustand
- reichhaltigere Reaktionskraftinterpretation
- stützenbezogene maßgebende Checks

### Ziel
Strukturelle Ausgaben ergänzen, die die Ergebnisse für praktische Reviews nützlicher und die Planung sicherer machen.

### Gewünschtes Verhalten
Für jede Stütze berechnen und anzeigen:
- eingehender Seilwinkel
- ausgehender Seilwinkel
- Knickwinkel
- Aufschlüsselung der Stützenreaktionen in Komponenten
- Sattel-Kontaktzustand:
  - Kontakt
  - Warnung „geringer Kontakt“
  - Abheberisiko
- optionales Stützen-Governing-Flag

### In Scope
- strukturelles Post-Processing
- stützenbezogene UI-Tabelle
- Overlay-Marker im Profil-Chart
- Exportsektion für strukturelle Checks

### Out of Scope
- vollständige FE-Mastanalyse
- detaillierte Sattel-Hardware-Auslegung
- dynamische Schwingungssimulation

### Wahrscheinliche Dateien/Module
- `models/calculation.model.ts`
- `services/calculation/engine/*`
- `services/calculation/engineering/global-engineering-calculator.service.ts`
- `features/calculation/calculation-results/*`
- `features/visualization/profile-chart/*`
- `services/export/pdf-export.service.ts`

### Implementierungshinweise
- Mit statischen, aus Geometrie/Kräften abgeleiteten Checks starten.
- Formeln in Code-Kommentaren dokumentieren.
- Konservative Schwellen verwenden, wenn keine detaillierten Hardwaredaten vorliegen.
- Explizite Annahmen in Warnungen/Export aufnehmen.

### Akzeptanzkriterien
- Jede Stütze hat strukturelle Ausgabefelder.
- Das Ergebnis-Panel zeigt Knickwinkel und Stützenzustand.
- Das Profil-Chart kann die maßgebende Stütze hervorheben.
- Das PDF enthält eine Tabelle mit strukturellen Checks.

### Empfohlene Tests
- Stützenergebnis enthält Knickwinkel
- Abhebe-/Kontaktstatus ändert sich unter unterschiedlichen Lastpositionen
- exportierte Struktursektion entspricht den UI-Werten
- Randfälle ohne Stütze und mit nur einer Stütze verhalten sich sicher

---

## Issue R2-03 — Optionale Realismus-Module ergänzen: Sattelreibung, Ankernachgiebigkeit, Mastnachgiebigkeit

### Warum das wichtig ist
Der Engineering-Service warnt bereits explizit, dass V1 keine Sattelreibung und keine Mast-/Ankernachgiebigkeit besitzt. Diese Auslassungen sind für V1 akzeptabel, sollten aber die nächste Realismus-Stufe sein.

### Problem
Der Engineering-Modus bleibt sichtbar unvollständig, solange er optionale Korrekturen für Folgendes nicht modellieren kann:
- Sattelreibung
- Ankernachgiebigkeit
- Mast-/Stützennachgiebigkeit

### Ziel
Optionale Realismus-Module als explizite, dokumentierte Modifikatoren des Engineering-Solvers ergänzen.

### Gewünschtes Verhalten
Nutzer können optionale Realismus-Korrekturen aktivieren/deaktivieren:
- Sattelreibungskoeffizient
- axiale Ankersteifigkeit / Nachgiebigkeit
- Mast-/Stützennachgiebigkeit oder effektive Kopfverformungssteifigkeit

Das Ergebnis:
- protokolliert aktive Realismus-Toggles
- nimmt sie in `modelAssumptions` auf
- aktualisiert Engineering-Metriken und strukturelle Ausgaben
- zeigt einen Warnhinweis, dass Realismus-Module die physikalische Treue erhöhen, aber weiterhin Modellannahmen bleiben

### In Scope
- Modelleingaben
- Integration in den Engineering-Solver
- Annahmen-Metadaten
- Berichtsausgabe
- Tests

### Out of Scope
- vollständige nichtlineare Strukturanalyse
- Zeitbereichsdynamik
- Seil-auf-Seilscheibe-Rollmechanik über einfache Reibungsmodellierung hinaus

### Wahrscheinliche Dateien/Module
- `models/cable.model.ts`
- Stations-/Stützenmodelle, falls nötig
- `models/calculation.model.ts`
- `services/calculation/engineering/global-engineering-calculator.service.ts`
- Engineering-UI-Komponenten
- Export-Service

### Implementierungshinweise
- Modulare Flags und Parameterobjekte bevorzugen.
- Defaults aus Rückwärtskompatibilitätsgründen deaktiviert lassen.
- Klaren Warntext anzeigen, wenn Realismus-Module ausgeschaltet sind.
- Späteren Vergleich zwischen Baseline- und Realismus-Ergebnis ermöglichen.

### Akzeptanzkriterien
- Nutzer können mindestens eine Realismus-Korrektur aktivieren, ohne alte Projekte zu brechen.
- Ergebnisannahmen listen aktive Realismus-Module explizit auf.
- Engineering-Ausgaben ändern sich deterministisch, wenn Korrekturen aktiviert werden.
- Tests decken aktivierte und deaktivierte Zustände ab.

### Empfohlene Tests
- Baseline-Engineering-Lauf vs. Reibungs-Lauf unterscheiden sich vorhersagbar
- Ankernachgiebigkeit ändert gelöste Kraft-/Verlängerungsausgaben
- deaktivierter Default bewahrt aktuelles Verhalten
- exportierte Annahmenliste enthält Realismus-Toggles

---

## Issue R2-04 — Den PDF-Report vom Export zum Engineering-Report aufwerten

### Warum das wichtig ist
Die engineering-orientierte Positionierung ist am stärksten, wenn der Bericht als technisches Kommunikationsartefakt genutzt werden kann und nicht nur als Datendump.

### Problem
Die aktuelle Exportfähigkeit ist gut, muss aber zu einem stärkeren Engineering-Report mit interpretationsfähiger Struktur weiterentwickelt werden.

### Ziel
Zwei Berichtmodi bereitstellen:
- **Kurzer Planning-Report**
- **Detaillierter Engineering-Report**

### Gewünschtes Verhalten
Der detaillierte Engineering-Report enthält:
- Projektmetadaten
- Mode Family und Methode
- Modellannahmen
- aktiven Lastfall
- maßgebenden Lastfall
- Hüllkurven-Zusammenfassung
- strukturelle Checks
- Seilkapazitätsnachweis
- nach Schweregrad gruppierte Warnungen
- Szenario-/Override-Metadaten
- Versionsstempel / Berechnungszeitpunkt

### In Scope
- Redesign des Report-Layouts
- Engineering-only-Abschnitte
- Annahmen- und Warnungstabellen
- Zusammenfassungsseite
- struktureller Abschnitt
- Szenario-Metadaten

### Out of Scope
- Mehrsprachigkeit
- Custom-Branding-Engine
- Cloud-Sharing

### Wahrscheinliche Dateien/Module
- `services/export/pdf-export.service.ts`
- Calculation-Result-UI zur Konsistenz
- Modelle, falls zusätzliche Report-Metadaten benötigt werden

### Implementierungshinweise
- Bestehenden PDF-Pfad nicht brechen.
- Vorhandenen Screenshot-/Profil-Export dort nutzen, wo er hilft, aber technische Tabellen priorisieren.
- Berichtmodus-Selektor ergänzen.

### Akzeptanzkriterien
- Nutzer können kurze Planning- und detaillierte Engineering-PDF-Modi erzeugen.
- Der detaillierte Modus enthält Annahmen, maßgebenden Fall und strukturelle Checks.
- Planning- und Engineering-Berichte unterscheiden sich klar in Ton und Inhalt.
- Alte Projekte können weiterhin exportiert werden.

### Empfohlene Tests
- Berichtmodus-Selektor wählt unterschiedliche Abschnittsmengen
- Engineering-Report enthält Annahmen und Metriken
- Warnschweregrade werden korrekt gerendert
- Export funktioniert weiterhin ohne optionales Plotbild

---

# Release 3 — Differenzierung durch Entscheidungsunterstützung und Validierung

## Issue R3-01 — Vorschläge zur Stützenplatzierung und Variantenbewertung ergänzen

### Warum das wichtig ist
Manuelle Stützenplatzierung ist nützlich, aber ein differenzierendes Planungstool sollte Nutzern helfen, schneller bessere Varianten zu finden.

### Problem
Heute kann die App ein gewähltes Layout analysieren, unterstützt Nutzer aber noch nicht bei der Erzeugung oder Rangfolge von Alternativen.

### Ziel
Assistierte Vorschläge zur Stützenplatzierung mit einfacher Variantenbewertung einführen.

### Gewünschtes Verhalten
Ausgehend von Route und Geländeprofil kann die App Kandidatenlayouts für Stützen vorschlagen, basierend auf konfigurierbaren Zielen:
- weniger Stützen
- geringere maximale Zugkraft
- bessere Bodenfreiheitsreserve
- geringere strukturelle Schwere
- ausgewogener Trade-off

Nutzer können:
- Kandidatenlayouts erzeugen
- 2–5 Varianten vergleichen
- eine Variante ins Projekt übernehmen

### In Scope
- heuristische Kandidatengenerierung
- Varianten-Score-Zusammenfassung
- Vergleichstabelle
- Aktion „Variante übernehmen“
- Persistenz nur der übernommenen Variante

### Out of Scope
- vollständige mathematische Optimierungs-Engine
- GIS-Korridorsuche
- automatisierte Eignungsanalyse von Bäumen

### Wahrscheinliche Dateien/Module
- `services/calculation/*`
- Terrain-/Support-Feature-Komponenten
- `ProjectStateService`
- neue Variantenvergleichs-UI
- Export-/Report-Integration (nur Zusammenfassung)

### Implementierungshinweise
- Mit deterministischen Heuristiken beginnen, nicht mit Black-Box-Optimierung.
- Bestehende Stützen-Constraints (Abstand, Höhenplausibilität) nutzen.
- Generierte Varianten erklärbar halten.

### Akzeptanzkriterien
- Nutzer können mindestens 2 Kandidatenlayouts erzeugen.
- Varianten werden mit sichtbaren Kriterien bewertet.
- Eine Variante kann auf das Projekt angewendet werden.
- Der Ergebnisvergleich ist für gleiche Eingabe reproduzierbar.

### Empfohlene Tests
- deterministische Kandidatengenerierung für feste Eingaben
- Scoring ändert sich, wenn sich das Optimierungsziel ändert
- übernommene Variante überschreibt Stützen korrekt
- ungültige Gelände-/Profilbedingungen schlagen sicher fehl

---

## Issue R3-02 — Szenarienvergleich und Unsicherheitsansicht ergänzen

### Warum das wichtig ist
Engineering-orientierte Entscheidungen basieren selten auf nur einem nominalen Fall. Nutzer müssen Szenarien vergleichen und sehen können, was das Risiko treibt.

### Problem
Das aktuelle Produkt erlaubt interaktive Overrides, aber keinen strukturierten Szenarienvergleich und keine Unsicherheitsansicht.

### Ziel
Mehrszenarienvergleich und eine einfache Sensitivitäts-/Unsicherheitsdarstellung ergänzen.

### Gewünschtes Verhalten
Nutzer können Szenarien speichern und vergleichen, z. B.:
- Basisfall
- hohe Last
- geringe Vorspannung
- alternatives Seil
- Realismus-Module an/aus

Für jedes Szenario vergleichen:
- minimale Bodenfreiheit
- maximale Zugkraft
- gelöstes H
- maßgebendes Spannfeld
- strukturelle Schwere
- Seilausnutzung

Eine grundlegende Sensitivitätsansicht ergänzen:
- welcher Parameter geändert wurde
- wie stark sich die Schlüsselausgaben verschoben haben

### In Scope
- Szenario speichern/umbenennen/löschen
- Szenarienvergleichstabelle
- Unsicherheits-/Sensitivitätszusammenfassung
- Kompatibilität mit Engineering und Planning

### Out of Scope
- probabilistisches Monte Carlo
- fortgeschrittene Statistik
- Cloud-Kollaboration

### Wahrscheinliche Dateien/Module
- `ProjectStateService`
- `models/project.model.ts`
- `models/calculation.model.ts`
- Profil-/Berechnungs-Features
- Export-Service

### Implementierungshinweise
- Wo möglich, den aktuellen Override-Mechanismus wiederverwenden.
- Szenarien als explizite benannte Parametersätze speichern, nicht nur als Diffs.
- Sicherstellen, dass Nutzer sehen können, welches Szenario gerade aktiv ist.

### Akzeptanzkriterien
- Nutzer können mehrere Szenarien pro Projekt speichern.
- Die Szenarienvergleichstabelle hebt beste/schlechteste Werte hervor.
- Die Sensitivitätszusammenfassung ist verständlich, ohne nur rohe Zahlen lesen zu müssen.
- Export kann einen Szenarienvergleichsabschnitt enthalten.

### Empfohlene Tests
- Szenario-Save/Load-Roundtrip
- Vergleichstabelle berechnet konsistente Deltas
- Löschen eines Szenarios beeinflusst das Basisprojekt nicht
- Sensitivitätszusammenfassung spiegelt Parameteränderungen korrekt wider

---

## Issue R3-03 — Benchmark-Import und Kalibrierungs-Workflow ergänzen

### Warum das wichtig ist
Der stärkste Glaubwürdigkeitsgewinn nach guter Engineering-Mechanik ist ein Workflow, der Modell und Messung vergleicht.

### Problem
Es gibt noch keinen Pfad, um:
- gemessene Fälle zu importieren
- Simulation vs. gemessene Geometrie/Kräfte zu vergleichen
- Vorspannung oder Seilparameter zu kalibrieren

### Ziel
Einen Benchmark-/Kalibrierungsmodus für bekannte oder gemessene Fälle ergänzen.

### Gewünschtes Verhalten
Nutzer können:
- ein Benchmark-Projekt oder einen gemessenen Fall laden
- Messwerte eingeben, z. B.:
  - Laufwagen-/Lastposition
  - gemessene Bodenfreiheit / Sag-Punkt
  - gemessene Ankerkrafte, falls verfügbar
- gemessene vs. simulierte Werte vergleichen
- eine geführte Kalibrierung ausführen für:
  - Vorspannung / Horizontalkraft
  - Elastizitätsmodul
  - Füllfaktor
  - optionale Realismus-Parameter, falls aktiviert

### In Scope
- Benchmark-Beispielprojekte
- UI für Messwerteingabe
- Vergleichspanel
- einfacher Kalibrierungsassistent
- Report-Abschnitt mit kalibrierten Parametern und verbleibender Abweichung

### Out of Scope
- automatisches Fitting gegen große Sensordatensätze
- ML-basierte Parameterschätzung
- Live-Telemetrie-Integration

### Wahrscheinliche Dateien/Module
- Calculation-/Engineering-Services
- neues Benchmark-/Kalibrierungs-Feature-UI
- Modelle für Messfalleingaben
- Beispielprojekt-Assets
- Export-/Report-Service

### Implementierungshinweise
- Mit manueller Eingabe gemessener Punkte starten, nicht mit komplexem Dateimport.
- Kalibrierung begrenzt und erklärbar halten.
- Immer Vorher-/Nachher-Kalibrierungswerte anzeigen.

### Akzeptanzkriterien
- Mindestens ein Benchmark-Beispielprojekt wird mit der App ausgeliefert.
- Nutzer können Messwerte eingeben und die Simulationsabweichung sehen.
- Kalibrierung aktualisiert nur erlaubte Parameter und zeigt verbleibende Abweichung an.
- Reports enthalten kalibrierte Annahmen und eine Zusammenfassung der Anpassungsgüte.

### Empfohlene Tests
- Benchmark-Projekt lädt
- Messwerteingaben werden persistiert
- Kalibrierung passt nur erlaubte Parameter an
- Vorher-/Nachher-Kalibrierungsvergleich ist reproduzierbar

---

## Issue R3-04 — Korridor- und Kandidaten-Overlay-Planung als ersten GIS-Differenziator ergänzen

### Warum das wichtig ist
Der langfristige Differenziator ist nicht nur bessere Mechanik. Es sind bessere Planungsentscheidungen im Kontext. Eine erste Version der korridorgeführten Routenplanung würde Ropeway stärker wie ein Nischen-Feldplanungssystem wirken lassen.

### Problem
Die App arbeitet aktuell hauptsächlich auf einer gewählten Route. Sie unterstützt den Nutzer noch nicht dabei, alternative Korridore oder potenzielle Anker-/Stützengelegenheiten auf Planungsebene zu erkunden.

### Ziel
Eine erste korridorbasierte Planungsschicht ergänzen, ohne das Produkt in eine vollständige GIS-Plattform zu verwandeln.

### Gewünschtes Verhalten
Nutzer können:
- einen Planungskorridor um eine Route definieren
- Marker oder Zonen für potenzielle Anker-/Stützengelegenheiten sehen
- Routenalternativen auf leichtgewichtiger Ebene vergleichen
- Alternativen ranken nach:
  - Länge
  - Anzahl der Stützen
  - Bodenfreiheitsrisiko
  - Zugkraft-Schwere
  - geschätztem Konstruktions-/Bau-Score

### In Scope
- Korridor-Eingabekonzept
- Objektmodell für Routenalternativen
- einfaches Ranking
- Kandidaten-Overlay-UI
- Handoff von Routenalternative zu voller Projektberechnung

### Out of Scope
- vollständige LiDAR-Engine
- Enterprise-GIS-Integration
- automatisierte Vegetationsklassifikation

### Wahrscheinliche Dateien/Module
- Map-Feature-Module
- Projekt-State
- neue Routenalternativen-Modelle
- Integration in Support-Placement- und Calculation-Pipeline

### Implementierungshinweise
- In V1 bewusst leichtgewichtig halten.
- Routenalternativen können zunächst manuell angepasste Linien innerhalb eines Korridors sein.
- Hauptwert ist Compare-and-Choose, nicht autonome GIS-Optimierung.

### Akzeptanzkriterien
- Nutzer können mindestens einen Korridor definieren und mehrere Routenalternativen erstellen.
- Alternativen können mit transparenten Scoring-Kriterien gerankt werden.
- Eine Alternative kann in das aktive Engineering-/Planning-Projekt übernommen werden.
- Der Workflow bricht die bestehende Single-Project-Calculation-Pipeline nicht.

### Empfohlene Tests
- Korridor-Save/Load-Roundtrip
- Alternativen-Ranking ist deterministisch
- Übernahme ins aktive Projekt erhält gültige Berechnungseingaben
- Kartenzustand und Projektzustand bleiben synchronisiert

---

## 3. Empfohlene Umsetzungsreihenfolge innerhalb jedes Releases

## Empfohlene Reihenfolge für Release 1
1. R1-01 Produktsemantik sauber zwischen Planning und Engineering trennen  
2. R1-02 Dedizierten technischen Stationseditor ergänzen  
3. R1-03 Preset-Integrität abschließen  
4. R1-04 Benchmark- und Regressions-Suite erstellen  

Warum: Zuerst das Produkt verständlich machen, dann Eingaben härten, dann Vertrauen stabilisieren.

## Empfohlene Reihenfolge für Release 2
1. R2-01 Engineering-Workspace  
2. R2-02 Strukturelle Ausgaben erweitern  
3. R2-04 PDF zum Engineering-Report aufwerten  
4. R2-03 Optionale Realismus-Module  

Warum: Zuerst den Engineering-Wert klar sichtbar machen, dann anreichern, dann die Physik vertiefen.

## Empfohlene Reihenfolge für Release 3
1. R3-02 Szenarienvergleich und Unsicherheit  
2. R3-03 Benchmark-Import und Kalibrierung  
3. R3-01 Vorschläge zur Stützenplatzierung und Variantenbewertung  
4. R3-04 Korridor- und Kandidaten-Overlay-Planung  

Warum: Zuerst Entscheidungsqualität und Vertrauen verbessern, dann differenzierende Planungsintelligenz ergänzen.

---

## 4. Was bewusst zurückgestellt werden sollte

Um die Positionierung scharf zu halten, sollten diese Themen nicht priorisiert werden, bevor die obige Roadmap abgeschlossen ist:

- generische Kollaborationsfeatures
- große Dokumentenmanagement-Funktionen
- Ambitionen einer vollständigen GIS-Plattform
- rein ästhetische Chart-Arbeiten
- übermäßige Erweiterung von Exportformaten
- zu viele Solver-Namen ohne stärkere Semantik und Testabdeckung

---

## 5. Strategische Zusammenfassung

Wenn Ropeway als **engineering-orientiertes Planungstool** wahrgenommen werden will, ist der stärkste Pfad:

1. **klar machen, was das Tool ist**  
2. **die technischen Eingaben explizit und vertrauenswürdig machen**  
3. **Engineering-Konsequenzen zeigen, nicht nur Seilkurven**  
4. **Kalibrierung und Vergleich ergänzen, damit Entscheidungen belastbar werden**  
5. **danach Planungsintelligenz ergänzen, die bei besseren Varianten hilft**

Diese Reihenfolge hält das Produkt schmal, glaubwürdig und differenziert.
