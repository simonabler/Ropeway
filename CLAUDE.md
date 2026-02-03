# Seilbahn PWA - Materialseilbahn Vorplanungs-App

## Projektübersicht

Mobile-first Progressive Web Application (PWA) für die Vorplanung von Materialseilbahnen.
Zielgruppe: Feldarbeiter mit Smartphones/Tablets für Terrain-Erfassung mit Laser-Messungen.

### 8-Schritt Workflow
1. **Projekt erstellen** - Name, Metadaten ✅
2. **Karte** - Startpunkt auswählen (Leaflet) ✅
3. **Geländeprofil** - Terrain mit Laser erfassen ✅
4. **Stützen platzieren** - Positionen definieren ✅
5. **Endstationen** - Tal- und Bergstation konfigurieren ⏳
6. **Seilparameter** - Kabel-Konfiguration mit M4.5 Presets ✅
7. **Berechnung** - Seilstatik berechnen ✅
8. **Export** - PDF/DXF/JSON Export ✅

---

## Technologie-Stack

- **Framework**: Angular 21 (Standalone Components)
- **State Management**: RxJS BehaviorSubjects + Angular Signals
- **Offline Storage**: IndexedDB via Dexie.js
- **Styling**: SCSS (Mobile-First)
- **Maps**: Leaflet ✅
- **Visualisierung**: D3.js ✅
- **Export**: jsPDF, DXF ✅
- **PWA**: @angular/pwa

### Angular 21 Patterns
- Neue Control Flow Syntax: `@if`, `@for`, `@switch`
- Standalone Components ohne NgModules
- Signals für reaktive State-Verwaltung
- `toSignal()` für Observable-zu-Signal Konvertierung

---

## Projektstruktur

```
seilbahn-app/
├── src/
│   ├── app/
│   │   ├── models/                    # Datenmodelle
│   │   │   ├── geo.model.ts
│   │   │   ├── terrain.model.ts
│   │   │   ├── support.model.ts
│   │   │   ├── end-station.model.ts
│   │   │   ├── cable.model.ts
│   │   │   ├── cable-preset.model.ts  # M4.5
│   │   │   ├── calculation.model.ts
│   │   │   ├── project.model.ts
│   │   │   └── index.ts
│   │   ├── services/
│   │   │   ├── state/
│   │   │   │   └── project-state.service.ts    # Zentraler State
│   │   │   ├── storage/
│   │   │   │   └── indexed-db.service.ts       # Dexie.js
│   │   │   ├── calculation/
│   │   │   │   ├── terrain-calculator.service.ts
│   │   │   │   ├── cable-preset.service.ts     # M4.5
│   │   │   │   ├── cable-calculator.service.ts
│   │   │   │   └── engine/
│   │   │   │       └── physics/
│   │   │   │           ├── span-geometry.ts
│   │   │   │           ├── parabolic-approximation.ts
│   │   │   │           └── clearance-checker.ts
│   │   │   ├── export/                         ✅
│   │   │   │   ├── pdf-export.service.ts      # jsPDF Multi-Page Reports
│   │   │   │   └── dxf-export.service.ts      # DXF R12 CAD Export
│   │   │   └── geo/                           ✅
│   │   │       ├── geolocation.service.ts     # GPS Access
│   │   │       └── leaflet-map.service.ts     # Map Wrapper
│   │   └── features/
│   │       ├── project/
│   │       │   ├── project-list/       ✅
│   │       │   ├── project-create/     ✅
│   │       │   └── project-detail/     ✅
│   │       ├── terrain/
│   │       │   └── terrain-input/      ✅
│   │       ├── support/
│   │       │   └── support-placement/  ✅
│   │       ├── cable/
│   │       │   └── cable-config/       ✅
│   │       ├── calculation/
│   │       │   └── calculation-results/ ✅
│   │       ├── visualization/
│   │       │   └── profile-chart/      ✅
│   │       ├── map/                    ✅
│   │       │   └── map-container/      # Leaflet Map Component
│   │       └── export/                 ✅
│   │           └── export-panel/       # PDF/DXF/JSON Export UI
│   ├── assets/
│   │   └── presets/
│   │       └── system-cable-presets.json  # M4.5 System-Presets
│   └── styles/
│       ├── _variables.scss
│       ├── _breakpoints.scss
│       └── _mobile.scss
```

---

## Erledigte Schritte

### Phase 1 - Foundation ✅
- [x] Angular 21 Projekt initialisiert
- [x] Dependencies installiert (Material, PWA, Leaflet, D3, Dexie, jsPDF)
- [x] Alle Datenmodelle erstellt (8 Dateien)
- [x] IndexedDbService mit Dexie.js implementiert
- [x] ProjectStateService mit RxJS BehaviorSubjects
- [x] SCSS Setup (Variables, Breakpoints, Mobile-First)
- [x] Basic UI Shell (AppComponent mit Header + Bottom Nav)

### Phase 2 - Services & Components ✅
- [x] System-Cable-Presets JSON (4 realistische Presets)
- [x] CablePresetService (CRUD, Apply, Compare)
- [x] TerrainCalculatorService (Kumulative Berechnungen, Interpolation)
- [x] ProjectList Component (Angular 21 Control Flow)
- [x] ProjectCreate Component (Form Validation)

### Phase 2.5 - Calculation Engine ✅
- [x] span-geometry.ts (Spannfeld-Geometrien)
- [x] parabolic-approximation.ts (Parabel-Physik: H = w·L²/8f)
- [x] clearance-checker.ts (Bodenfreiheit-Validierung)
- [x] cable-calculator.service.ts (Orchestrierung)

### Phase 3 - UI Components ✅
- [x] TerrainInput Component (Mobile-optimiert, +/- Buttons)
- [x] TerrainInput Edit-Funktion (Segment bearbeiten, Update, Cancel)
- [x] ProjectDetail Container (Angular Signals, toSignal())
- [x] SupportPlacement Component (Position/Höhe, Edit/Delete)
- [x] Race Condition Fix (Signals statt Subscriptions)
- [x] Routing für alle Components

### Phase 4 - Cable Configuration ✅
- [x] CableConfig Component (cable-config.ts/html/scss)
- [x] M4.5 Preset-Auswahl (Grid mit System-Presets)
- [x] Manuelle Parameter-Eingabe (Seilgewicht, Durchhang, Sicherheit, Last, Bodenfreiheit)
- [x] Preset-Vergleich (Abweichungs-Warnung + Reset)
- [x] Auto-Save bei Änderungen
- [x] Integration in ProjectDetail

### Phase 5 - Calculation & Results ✅
- [x] CalculationResults Component (calculation-results.ts/html/scss)
- [x] Calculation Trigger Button (mit Spinner-Animation)
- [x] Results Display (Tmax, Horizontalkraft, Seildurchmesser)
- [x] Spannfeld-Details (pro Span: T, H, Clearance)
- [x] Minimale Bodenfreiheit Anzeige
- [x] Fehler/Warnungen/Info-Messages
- [x] Integration in ProjectDetail

### Phase 6 - D3.js Profile Visualization ✅
- [x] ProfileChart Component (profile-chart.ts/html/scss)
- [x] D3.js SVG-basiertes Chart
- [x] **Terrain Layer** - Geländelinie mit Füllung
- [x] **Cable Layer** - Seillinie (aus Berechnung)
- [x] **Support Layer** - Stützen als vertikale Linien mit Labels
- [x] **Clearance Layer** - Min. Bodenfreiheit (gestrichelte Linie)
- [x] **Achsen** - X: Station (m), Y: Höhe (m) mit Grid
- [x] **Zoom/Pan** - d3.zoom mit Pinch-Gesten
- [x] **Tooltips** - Hover-Info für Terrain-Punkte und Stützen
- [x] **Responsive** - ResizeObserver für Container-Größe
- [x] **Legende** - Farbkodierung der Elemente
- [x] Integration in ProjectDetail

### Phase 6.1 - Cable Simulation & Anchor Forces ✅

- [x] **Interaktive Seilsimulation**
  - Horizontalzug (H) einstellbar (5-50 kN)
  - Punktlast (P) einstellbar (0-20 kN)
  - Lastposition (5-95% der Strecke)
  - Seilgewicht (N/m) einstellbar
- [x] **Leerseil** (grün, gestrichelt) - nur Eigengewicht
- [x] **Belastetes Seil** (pink) - mit Punktlast
- [x] **Kritischer Punkt** (orange) - minimale Bodenfreiheit
- [x] **Ankerpunkte** (gelb)
  - Tal-Anker und Berg-Anker Visualisierung
  - Kraft-Berechnung: H, V, Resultierend, Winkel
  - Leerseil vs. belasteter Zustand
  - Kraft-Pfeile mit Werten
- [x] **Toggle-Buttons** für alle Anzeigen
- [x] **Fullscreen-Modus** für D3 Chart

### Phase 7 - Map Integration (Leaflet) ✅

- [x] **MapContainer Component** - Leaflet-basierte Karte
- [x] **LeafletMapService** - Map-Wrapper mit OSM-Tiles
- [x] **GeolocationService** - GPS-Zugriff mit Accuracy-Monitoring
- [x] **Start-/Endpunkt-Auswahl** - Tap auf Karte
- [x] **Marker** - Draggable Start/End-Marker (S/E)
- [x] **Route-Linie** - Gestrichelte Verbindungslinie
- [x] **Azimut-Berechnung** - Automatische Bearing-Berechnung
- [x] **Distanz-Anzeige** - Entfernung in m/km
- [x] **GPS-Position** - "Mein Standort" mit Accuracy-Circle
- [x] **Touch-optimiert** - Große Buttons, scroll-zoom disabled

### Phase 8 - Export ✅

- [x] **PdfExportService** - Mehrseitige PDF-Berichte mit jsPDF
  - Cover & Zusammenfassung (KPIs)
  - Geländeprofil-Tabelle
  - Stützen-Tabelle
  - Berechnungsergebnisse
  - Seilparameter
- [x] **DxfExportService** - DXF R12 Export für CAD
  - Layer: TERRAIN, CABLE, SUPPORTS, ANNOTATIONS
  - Koordinaten: X=Station, Y=Höhe
- [x] **JSON Export** - Vollständiger Projektexport
- [x] **ExportPanel Component** - Export-UI mit Status-Feedback

---

## Nächste Schritte (TODO)

### Phase 9 - Erweiterte Features (Future)

- [ ] **Offline-Karten** - Tile-Caching für Feldarbeit
- [ ] **GPS-Terrain-Aufnahme** - Continuous GPS Tracking
- [ ] **Kettenlinie** - Catenary Exact Calculation
- [ ] **Stützen-Optimierung** - Auto-Placement
- [ ] **Mehrsprachigkeit** - i18n (DE/EN/FR)

---

## Wichtige Code-Referenzen

### State Management
```typescript
// project-state.service.ts - Zentrale State-Verwaltung
projectStateService.project$        // Observable<Project | null>
projectStateService.terrain$        // Observable<TerrainSegment[]>
projectStateService.supports$       // Observable<Support[]>
projectStateService.currentProject  // Getter für aktuellen Wert
```

### Angular Signals Pattern
```typescript
// In Components - toSignal() im Constructor
constructor(private service: MyService) {
  this.data = toSignal(service.data$, { initialValue: [] });
}

// Template - Signals als Funktionen aufrufen
@if (data().length > 0) { ... }
{{ data()[0].name }}
```

### Physik-Engine
```typescript
// parabolic-approximation.ts
H = (w * L²) / (8 * f)     // Horizontalkraft
T_max = √(H² + V²)          // Max. Seilzugkraft
y(x) = -a*x*(L-x) + chord   // Parabel-Gleichung
```

### Terrain-Interpolation

```typescript
// terrain-calculator.service.ts
interpolateHeight(segments, stationLength): number
// Liefert interpolierte Geländehöhe an beliebiger Position
```

### D3.js Profile Chart

```typescript
// profile-chart.ts - D3.js Visualisierung
// Layers: terrain, cable, supports, clearance, grid
// Features: zoom/pan, tooltips, responsive resize
// Scales: xScale (Station m), yScale (Höhe m)
```

---

## Bundle-Größen (aktuell)

| Chunk | Größe | Gzipped |
|-------|-------|---------|
| Initial | 361.08 kB | 79.08 kB |
| project-detail | 794.04 kB | 200.75 kB |
| html2canvas | 202.84 kB | 38.52 kB |
| jsPDF | 158.71 kB | 46.89 kB |
| project-list | 7.48 kB | 2.25 kB |
| project-create | 6.25 kB | 2.08 kB |

project-detail enthält D3.js, Leaflet, jsPDF und html2canvas für Visualisierung und Export.

---

## M4.5 Cable Parameter Sets

System-Presets in `/assets/presets/system-cable-presets.json`:

1. **Leichtes Forstseil** - kleine Last (3kN)
2. **Mittleres Forstseil** - Standard (5kN)
3. **Schweres Forstseil** - große Last (8kN)
4. **Bauseil** - schwere Lasten (15kN)

### Preset-Struktur
```typescript
interface CableParameterSet {
  id: string;
  name: string;
  carrier: {
    wNPerM: number;      // Seilgewicht N/m
    sagFM: number;       // Durchhang m
    safetyFactor: number;
    kCoeff: number;
  };
  load: { PN: number };  // Nutzlast N
  limits: {
    minClearanceM: number;
    maxTmaxKN?: number;
  };
  isSystemPreset: boolean;
}
```

---

## Bekannte Issues

1. **Sass @import Deprecation** - Warnings bei Build, nicht kritisch
   - Migration zu `@use` empfohlen für Dart Sass 3.0

2. **Offline-Funktionalität** - PWA Service Worker noch nicht vollständig konfiguriert

---

## Entwicklung

```bash
cd seilbahn-app

# Development Server
npm start

# Build
npm run build

# Tests
npm test
```

---

## Letzte Änderung

**Datum**: 2026-02-03
**Status**: Phase 7 + 8 abgeschlossen (Map + Export)
**Nächster Schritt**: Phase 9 - Erweiterte Features (optional)

### Neue Features in Phase 7 & 8

- **Leaflet Map**: Interaktive Karte mit Start-/Endpunkt-Auswahl und GPS
- **PDF Export**: Mehrseitige Projektberichte mit KPIs, Tabellen und Parametern
- **DXF Export**: CAD-kompatibles Längsprofil (Layer: TERRAIN, CABLE, SUPPORTS)
- **JSON Export**: Vollständiger Datenexport für Backup/Import
- **Fullscreen**: D3 Chart kann im Vollbildmodus angezeigt werden
