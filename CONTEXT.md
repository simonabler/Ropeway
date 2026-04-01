# Context (Seilbahn)

Stand: 2026-04-01

## Repo
- Root: `C:\Users\ematric\Desktop\Seilbahn`
- Hauptanwendung: `seilbahn-app`
- Stack: Angular 21 PWA, Standalone Components, RxJS + Signals, Dexie, D3, Leaflet

## Starten

Aus `seilbahn-app/`:

- `npm start`
- `npm run build`
- `npm test`

## Einstiegspunkte

- Bootstrap: `seilbahn-app/src/main.ts`
- App-Konfiguration: `seilbahn-app/src/app/app.config.ts`
- Routing: `seilbahn-app/src/app/app.routes.ts`

## Hauptseiten

- `projects`: Projektliste
- `project/create`: neues Projekt
- `project/:id`: gesamter Arbeitsworkflow

## Workflow auf der Detailseite

`ProjectDetail` setzt den aktuellen Projektstand aus diesen Komponenten zusammen:

1. `map-container`: Startpunkt + Azimut
2. `terrain-input`: Terrain-Segmente
3. `support-placement`: Stuetzen
4. `cable-config`: Presets + manuelle Seilparameter
5. `calculation-results`: Solver-Auswahl + Ergebnisdarstellung
6. `profile-chart`: D3-Visualisierung + Lastsimulation
7. `export-panel`: PDF, DXF, JSON

## Zentrale Services

- `services/state/project-state.service.ts`
  - zentraler Projekt-State
  - Autosave
  - Updates fuer Terrain, Stuetzen, Kabeldaten, Solver und Berechnung
- `services/storage/indexed-db.service.ts`
  - Dexie-Wrapper fuer `projects` und `cablePresets`
- `services/calculation/cable-calculator.service.ts`
  - Orchestrierung der Berechnung
- `services/presets/cable-preset.service.ts`
  - System- und User-Presets
- `services/geo/leaflet-map.service.ts`
  - Leaflet-Map-State
- `services/geo/geolocation.service.ts`
  - GPS-Zugriff
- `services/export/pdf-export.service.ts`
- `services/export/dxf-export.service.ts`

## Fachmodell

- `Project` enthaelt weiterhin `startStation` und `endStation`.
- Im UI gibt es derzeit keine eigene Stationsmaske.
- `endStation` wird vor der Berechnung aus dem letzten Terrain-Punkt aktualisiert.
- `solverType` ist aktuell:
  - `parabolic`
  - `catenary`
  - `catenary-piecewise`

## Was aktuell wirklich umgesetzt ist

- Lokale Projektverwaltung in IndexedDB
- Kartenbasierter Startpunkt und Richtungsdefinition
- Manuelle Terrain- und Stuetzenerfassung
- Seilberechnung mit Kapazitaetspruefung
- Anzeige von Ankerkraeften und Stuetzenauflagen
- Interaktives D3-Profil mit Fullscreen, Zoom/Pan und Punktlastsimulation
- Export nach PDF, DXF und JSON
- Production-Service-Worker

## Wichtige Einschraenkungen

- Kein expliziter Endpunkt auf der Karte
- Keine dedizierte UI fuer Stationsparameter
- `presetModified$` im State-Service ist noch nicht implementiert
- Testabdeckung ist klein
