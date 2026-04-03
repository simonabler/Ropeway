**UI/UX Findings**
- `High`: Die Berechnung ist in der UI schon freigeschaltet, sobald nur Terrain vorhanden ist, obwohl der Rechner ohne mindestens eine Stütze garantiert in einen Fehler läuft. Das erzeugt einen vermeidbaren Dead-End-Flow für den Nutzer. [calculation-results.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/calculation/calculation-results/calculation-results.ts#L89) [calculation-results.html](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/calculation/calculation-results/calculation-results.html#L22) [cable-calculator.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/cable-calculator.service.ts#L50)
- `Medium`: In der Preset-Liste liegt ein `button` innerhalb eines anderen `button`. Das ist ungültiges HTML und führt regelmäßig zu Fokus-, Klick- und Accessibility-Problemen, gerade beim Löschen eines User-Presets. [cable-config.html](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/cable/cable-config/cable-config.html#L7) [cable-config.html](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/cable/cable-config/cable-config.html#L25)
- `Medium`: `Locate me` legt bei jedem Aufruf neue GPS-Marker und Accuracy-Circles an, ohne die alten zu entfernen. Die Karte kann dadurch schnell visuell zugemüllt werden. [map-container.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/map/map-container/map-container.ts#L98) [leaflet-map.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/geo/leaflet-map.service.ts#L329)

**Berechnungs-Findings**
- `High`: Die konfigurierte Nutzlast wird bei `parabolic` und `catenary` faktisch ignoriert. `pointLoadN` wird zwar aus `maxLoad` berechnet, aber nur in den `catenary-piecewise`-Solver eingespeist. Damit ändern Lastwerte in zwei von drei Solvern die Statik nicht. [cable-calculator.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/cable-calculator.service.ts#L60) [cable-calculator.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/cable-calculator.service.ts#L83) [parabolic-approximation.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/engine/physics/parabolic-approximation.ts#L50) [catenary-approximation.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/engine/physics/catenary-approximation.ts#L26)
- `High`: Der `catenary-piecewise`-Solver ist inhaltlich nicht mit der UI konsistent. Die Berechnung setzt die Punktlast immer starr in Feldmitte (`0.5`), obwohl die Anwendung an anderer Stelle eine variable Lastposition vermittelt. [cable-calculator.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/cable-calculator.service.ts#L66) [cable-calculator.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/cable-calculator.service.ts#L86)
- `High`: Im Piecewise-Solver wird `maxTension` nur an den Auflagerpunkten berechnet. Bei einer Punktlast kann das Spannungmaximum aber direkt links oder rechts der Last liegen. Dadurch kann auch die spätere Kapazitätsprüfung zu optimistisch ausfallen. [piecewise-catenary.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/engine/physics/piecewise-catenary.ts#L70) [piecewise-catenary.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/engine/physics/piecewise-catenary.ts#L77) [cable-calculator.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/cable-calculator.service.ts#L181)

**Allgemeine Aufbaufehler**
- `Medium`: `presetModified$` ist ein öffentliches State-API, liefert aber immer `false`, weil die eigentliche Vergleichslogik nur als `TODO` existiert. Jeder spätere Consumer bekommt damit falsche Zustände. [project-state.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/state/project-state.service.ts#L48)
- `Medium`: Beim Löschen eines ausgewählten User-Presets wird nur das lokale Signal geleert, nicht aber die persistierte `cablePresetId` im Projektstate. Nach Reload verweist das Projekt damit auf ein nicht mehr existentes Preset. [cable-config.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/cable/cable-config/cable-config.ts#L423) [cable-config.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/cable/cable-config/cable-config.ts#L426) [project-state.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/state/project-state.service.ts#L302) [cable-config.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/cable/cable-config/cable-config.ts#L310)
- `Medium`: System-Presets werden nur beim ersten Anlegen in IndexedDB geschrieben. Änderungen an `system-cable-presets.json` werden bei bestehenden Installationen nicht nachgezogen, wodurch Preset-Fixes oder Korrekturen beim Nutzer hängenbleiben. [cable-preset.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/presets/cable-preset.service.ts#L47) [cable-preset.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/presets/cable-preset.service.ts#L49)

---

## Plan: Slider mit echter Berechnung vereinheitlichen

### Summary
- Die drei Slider in der Profilansicht dürfen keine rein lokale Simulation mehr steuern.
- Änderungen an `Seilzug`, `Punktlast` und `Lastposition` müssen den effektiven Berechnungszustand des Projekts definieren.
- Mit `Reset` werden die temporären Slider-Overrides verworfen und die gespeicherten Einstellparameter wieder aktiv.

### Gewähltes Modell
- Gespeicherte Basiswerte bleiben in `project.cableConfig`
- Slider-Änderungen werden als temporäre `calculationOverrides` im zentralen State gehalten
- `Reset` entfernt die Overrides vollständig
- `CableConfiguration` wird um `loadPositionRatio` erweitert, Default `0.5`

### Wichtige Änderungen

#### Datenmodell und State
- `CableConfiguration` um `loadPositionRatio: number` im Bereich `0..1` erweitern
- In `ProjectStateService` temporäre `calculationOverrides` ergänzen für:
  - `horizontalTensionKN`
  - `maxLoadKg`
  - `loadPositionRatio`
- Einen zentralen effektiven Kabelzustand bilden:
  - Basis = `project.cableConfig`
  - Override = aktive Slider-Werte
- Legacy-Projekte ohne `loadPositionRatio` mit `0.5` laden

#### Berechnung
- `CalculationResults` und der Auto-Recalc dürfen nicht mehr direkt nur `project.cableConfig` lesen
- Stattdessen muss die Berechnung immer mit der effektiven Konfiguration laufen
- Der Auto-Calc-Key muss Slider-Overrides berücksichtigen, damit Änderungen sofort neu rechnen
- `CableCalculatorService` muss effektive Werte für:
  - `horizontalTensionKN`
  - `maxLoad`
  - `loadPositionRatio`
  bekommen
- Die lokale Lastpositionslogik im Chart darf nicht mehr von der eigentlichen Berechnung getrennt laufen

#### Profilansicht
- `horizontalTension`, `pointLoad` und `loadPositionPercent` dürfen nicht mehr nur lokaler Chart-State sein
- Die Slider lesen:
  - Override-Wert, falls aktiv
  - sonst den gespeicherten Basiswert
- Slider schreiben direkt in den zentralen Override-State
- `pointLoadDirty` und die aktuelle partielle Sync-Logik entfernen
- Einen echten `Reset`-Button im Slider-Panel ergänzen:
  - löscht alle drei Overrides
  - setzt Chart, Berechnung und Ausgaben auf die gespeicherten Projektwerte zurück
- Texte im Panel anpassen, damit nicht mehr von einer getrennten Simulation gesprochen wird

#### Basiswerte und Reset-Verhalten
- `Seilzug (H)` reset auf `project.cableConfig.horizontalTensionKN`
- `Punktlast (P)` reset auf `project.cableConfig.maxLoad`
- `Lastposition` reset auf `project.cableConfig.loadPositionRatio`
- Preset-Anwendung und Änderungen in `cable-config` aktualisieren die Basiswerte
- Wenn neue Basiswerte gesetzt werden, bleiben aktive Overrides bestehen, bis `Reset` gedrückt wird

#### Export und Konsistenz
- Wenn Overrides aktiv sind, muss Export kenntlich machen, dass mit temporären Slider-Werten gerechnet wurde
- Exportierte Werte müssen exakt zur effektiven Konfiguration der aktuellen Berechnung passen
- README / CONTEXT / CLAUDE müssen danach die Slider als aktive Lastfall-Steuerung beschreiben, nicht als getrennte Simulation

### Öffentliche Interface-Änderungen
- `CableConfiguration`
  - neues Feld `loadPositionRatio: number`
- `ProjectStateService`
  - Override-State für Berechnungsparameter
  - Methoden wie:
    - `setCalculationOverride(...)`
    - `clearCalculationOverrides()`
    - effektiver Projekt-/Kabelzustand
- `CalculationResult`
  - optional aktive Lastfall-Metadaten ergänzen, falls für Export/UI nötig

### Tests
- Unit-Test: jeder Slider ändert die effektive Konfiguration und triggert Berechnung
- Unit-Test: `Reset` entfernt Overrides und stellt gespeicherte Basisparameter wieder her
- Unit-Test: Legacy-Projekte ohne `loadPositionRatio` bekommen `0.5`
- Unit-Test: Preset-/Kabeländerungen aktualisieren Basiswerte, ohne aktive Overrides sofort zu verlieren
- Integrationstest: Slider-Änderung im Profil aktualisiert Berechnungspanel im selben Zustand
- Integrationstest: `T_max`, Auslastung und Kräfte folgen den Slider-Werten
- Integrationstest: `Reset` stellt Chart und Berechnung auf Projektwerte zurück
- Export-Test: aktive Overrides werden ausgewiesen und stimmen mit dem aktuellen Rechenergebnis überein

### Annahmen
- Slider-Werte sind temporäre Session-Overrides und keine permanenten Kabelparameter
- `loadPositionRatio` wird trotzdem als echter Basisparameter ins Projektmodell aufgenommen
- Die bisherige Trennung zwischen Simulation und Berechnung wird in der UI entfernt oder klar neu formuliert
