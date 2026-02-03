# Context (Seilbahn)

## Repo
- Root: c:\Users\ematric\Desktop\Seilbahn
- Main app: seilbahn-app (Angular 21 PWA, standalone components)

## Run (from seilbahn-app)
- npm start
- npm run build
- npm test

## Entry + Routing
- Bootstrap: seilbahn-app/src/main.ts
- App config + service worker: seilbahn-app/src/app/app.config.ts
- Routes: seilbahn-app/src/app/app.routes.ts (projects list, create, detail)

## Core Domain
- Models: seilbahn-app/src/app/models (Project, TerrainSegment, Support, EndStation, CableConfiguration, CalculationResult, etc.)
- State: seilbahn-app/src/app/services/state/project-state.service.ts (BehaviorSubjects + auto-save)
- Storage: seilbahn-app/src/app/services/storage/indexed-db.service.ts (Dexie, projects + cable presets)

## Calculation
- Orchestrator: seilbahn-app/src/app/services/calculation/cable-calculator.service.ts
- Terrain: seilbahn-app/src/app/services/calculation/terrain-calculator.service.ts
- Engine: seilbahn-app/src/app/services/calculation/engine (geometry + physics)

## Map + Geo
- Geolocation: seilbahn-app/src/app/services/geo/geolocation.service.ts
- Leaflet wrapper: seilbahn-app/src/app/services/geo/leaflet-map.service.ts

## Export
- PDF: seilbahn-app/src/app/services/export/pdf-export.service.ts
- DXF: seilbahn-app/src/app/services/export/dxf-export.service.ts

## UI Features
- Project list/create/detail: seilbahn-app/src/app/features/project
- Terrain input: seilbahn-app/src/app/features/terrain/terrain-input
- Support placement: seilbahn-app/src/app/features/support/support-placement
- Cable config: seilbahn-app/src/app/features/cable/cable-config
- Calculation results: seilbahn-app/src/app/features/calculation/calculation-results
- D3 profile chart: seilbahn-app/src/app/features/visualization/profile-chart
- Map container: seilbahn-app/src/app/features/map/map-container
- Export panel: seilbahn-app/src/app/features/export/export-panel
- Stations: seilbahn-app/src/app/features/stations

## Assets
- Cable presets: seilbahn-app/src/assets/presets/system-cable-presets.json
- PWA config: seilbahn-app/ngsw-config.json
