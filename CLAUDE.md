# Seilbahn PWA

Stand: 2026-04-01

## Projektuebersicht

Mobile-first Angular-PWA fuer die Vorplanung von Materialseilbahnen. Die App ist heute keine lineare 8-Schritt-Maske mehr, sondern ein einzelner Projekt-Workflow auf der Detailseite mit diesen Bereichen:

1. Startpunkt und Richtung auf der Leaflet-Karte
2. Gelaendeprofil erfassen
3. Stuetzen platzieren
4. Seilparameter und Presets konfigurieren
5. Berechnung mit waehlbarem Solver
6. Profil-Visualisierung und Lastsimulation
7. Export als PDF, DXF oder JSON

Wichtig: Im Datenmodell existieren weiterhin `startStation` und `endStation`, aber es gibt aktuell keine eigene UI fuer Stationskonfiguration. Die `endStation` wird vor der Berechnung aus dem letzten Terrain-Punkt abgeleitet, die Karte speichert nur `startPoint` plus `azimuth`.

## Aktueller Funktionsstand

### Projektverwaltung
- Projektliste mit Status, Sortierung nach `modifiedAt` und Delete
- Projekterstellung mit Name und optionalen Notizen
- Speicherung lokal in IndexedDB via Dexie

### Karten- und Geo-Funktionen
- Leaflet-Karte mit OpenStreetMap-Tiles
- Auswahl eines Startpunkts
- Richtungs-Handle zur Definition des Azimuts
- GPS-Lokalisierung und Uebernahme des aktuellen Standorts als Startpunkt
- Keine explizite Endpunkt-Auswahl mehr

### Gelaende und Stuetzen
- Manuelle Erfassung von Terrain-Segmenten
- Berechnung von `totalLength` und `elevationChange`
- Manuelle Stuetzenplatzierung entlang der Strecke
- Stuetzenkraefte werden nach der Berechnung mit ausgewiesen

### Seilkonfiguration
- System-Presets aus `src/assets/presets/system-cable-presets.json`
- Benutzerdefinierte Presets in IndexedDB
- Manuelle Parametrisierung von:
  - Seilgewicht
  - Horizontalzug `H`
  - Sicherheitsfaktor
  - Nutzlast
  - Mindestbodenfreiheit
  - Seildurchmesser
  - Festigkeitsklasse
  - Material
- Automatisches Speichern bei gueltigen Eingaben

### Berechnung
- Solver-Auswahl:
  - `parabolic`
  - `catenary`
  - `catenary-piecewise`
- Automatische Neuberechnung bei relevanten Aenderungen
- Berechnung von:
  - Spannfeldern
  - globalem `T_max`
  - Horizontalkraeften
  - Mindestbodenfreiheit
  - Ankerkraeften
  - Stuetzenauflagen
  - Seilkapazitaetspruefung

### Visualisierung
- D3-Profilchart fuer Terrain, Seil und Stuetzen
- Zoom/Pan und Fullscreen
- Interaktive Lastsimulation mit:
  - Horizontalzug
  - Punktlast
  - Lastposition
  - Seilgewicht
- Darstellung von:
  - Leerseil
  - belastetem Seil
  - kritischem Punkt
  - Ankerpunkten
  - Kraftpfeilen
  - Live-Auslastung des gewaelten Seils

### Export
- PDF-Bericht mit jsPDF und optionalem Plot-Screenshot via html2canvas
- DXF-R12-Export fuer CAD
- JSON-Export der Projektdaten

## Technologie-Stack

- Angular 21.1.x mit Standalone Components
- Angular Router
- RxJS BehaviorSubjects im zentralen Projekt-State
- Angular Signals und `toSignal()` in den Components
- Dexie.js fuer IndexedDB
- D3.js fuer Profil-Visualisierung
- Leaflet fuer Karte und Azimut
- jsPDF + html2canvas fuer PDF-Export
- Angular Service Worker fuer Production-Builds

## Relevante Struktur

```text
seilbahn-app/
|- src/app/app.routes.ts
|- src/app/models/
|- src/app/services/
|  |- state/project-state.service.ts
|  |- storage/indexed-db.service.ts
|  |- calculation/
|  |- geo/
|  |- export/
|  `- presets/
`- src/app/features/
   |- project/
   |- terrain/terrain-input/
   |- support/support-placement/
   |- cable/cable-config/
   |- calculation/calculation-results/
   |- visualization/profile-chart/
   |- map/map-container/
   `- export/export-panel/
```

## Architekturhinweise

### State
- `ProjectStateService` ist die zentrale Schreibstelle fuer das aktive Projekt.
- Der Service haelt `project$`, `terrain$`, `supports$`, `calculation$`, `selectedPresetId$` und `isDirty$`.
- Autosave laeuft debounced ueber IndexedDB.

### Persistenz
- Datenbankname: `SeilbahnDatabase`
- Tabellen:
  - `projects`
  - `cablePresets`

### Berechnungslogik
- `CableCalculatorService` orchestriert Geometrie, Solver, Clearance und Kapazitaetscheck.
- Spannfelder werden aus `startStation`, Stuetzen und `endStation` aufgebaut.
- `T_max` wird nicht mehr fuer einen geschaetzten Durchmesser genutzt, sondern gegen den explizit konfigurierten Seildurchmesser geprueft.

## Bekannte Luecken und technische Schulden

1. Es gibt aktuell keine eigene UI fuer Start-/Endstationen, obwohl das Datenmodell diese Objekte weiterfuehrt.
2. Die Karte modelliert nur Startpunkt und Azimut, nicht Start- und Endpunkt.
3. In `project-state.service.ts` ist `presetModified$` noch ein Platzhalter mit `TODO`.
4. Die Testabdeckung ist gering; vorhanden sind nur wenige Specs.
5. Der Service Worker ist eingebunden, aber Offline-Karten oder eine tiefergehende Offline-Strategie sind nicht umgesetzt.

## Entwicklung

Aus `seilbahn-app/`:

```bash
npm start
npm run build
npm test
```

## Deployment-Hinweise

Im Repo liegen bereits `Dockerfile`, `docker-compose.yml` und `nginx.conf`. Die App ist damit auf statisches Hosting bzw. Container-Deployment ausgelegt.
