# Seilbahn PWA

Seilbahn PWA is a mobile-first Angular Progressive Web App for early-stage planning of material ropeways. It is designed for field use on phones and tablets and combines route orientation, terrain capture, support placement, cable configuration, structural calculation, visualization, and export in one workflow.

## Current Status

The application currently provides a single project detail workflow with these sections:

1. Start point and direction on a Leaflet map
2. Terrain profile capture
3. Support placement
4. Cable presets and manual cable configuration
5. Calculation with selectable solver
6. D3 profile visualization and load simulation
7. Export to PDF, DXF, and JSON

The data model still contains `startStation` and `endStation`, but there is no dedicated station editor in the UI at the moment. The map stores a start point and azimuth only. Before calculation, the app derives the end station position and terrain height from the last terrain point.

## Key Features

### Project management
- Create, open, list, and delete projects
- Local persistence via IndexedDB
- Auto-save through the central project state service

### Map and geo
- Leaflet map with OpenStreetMap tiles
- Start point selection
- Direction handle for azimuth definition
- GPS locate and "use current position as start" support

### Terrain and supports
- Manual terrain segment entry
- Automatic total length and elevation change updates
- Manual support placement along the route

### Cable configuration
- Built-in system presets from JSON
- User-defined presets stored in IndexedDB
- Manual configuration of cable weight, horizontal tension, safety factor, load, clearance, diameter, strength class, and material

### Calculation
- Solver selection:
  - `parabolic`
  - `catenary`
  - `catenary-piecewise`
- Automatic recalculation when relevant project data changes
- Span geometry, tension, clearance, anchor forces, support reactions, and cable capacity checks

### Visualization
- Interactive D3 chart for terrain, cable line, supports, and clearance
- Zoom, pan, and fullscreen mode
- Live load simulation with adjustable:
  - horizontal tension
  - point load
  - load position
  - cable weight
- Anchor force overlays and live cable utilization feedback

### Export
- Multi-page PDF report with project data and calculation results
- DXF R12 export for CAD workflows
- JSON export for backup or transfer

## Tech Stack

- Angular 21.1.x
- Standalone Components
- Angular Router
- Angular Service Worker
- RxJS + Angular Signals
- Dexie.js for IndexedDB
- D3.js for profile visualization
- Leaflet for map interaction
- jsPDF and html2canvas for PDF export
- Vitest via Angular test command

## Calculation Solvers

The application supports three solver modes for cable shape and force calculation. All three use the same project inputs, span geometry, clearance checks, and cable capacity validation, but they differ in their physical model and intended use.

### Shared calculation model

Before a solver runs, the app:

- builds spans from start station, supports, and end station
- reads cable weight, horizontal tension, safety factor, load, and clearance target from the project
- derives a per-span sag value from the configured horizontal tension using:

```text
f = (w * L^2) / (8 * H)
```

Where:

- `f` = sag
- `w` = cable weight per meter
- `L` = span length
- `H` = horizontal cable force

After the solver computes the cable line, the app performs:

- minimum clearance checks against the terrain profile
- maximum tension aggregation
- anchor force calculation
- support reaction calculation
- cable capacity check against the selected diameter and strength class

### 1. Parabolic

The `parabolic` solver is the fastest and simplest model. It assumes a uniformly loaded cable and approximates the cable shape as a parabola.

Use it when:

- you want a quick pre-planning estimate
- spans are moderate and a simplified model is acceptable
- speed matters more than geometric fidelity

Characteristics:

- cable line is modeled as a parabola below the chord between supports
- horizontal force is treated as constant over the span
- good for early-stage screening and fast iteration

Tradeoffs:

- it is an approximation, not the exact self-weight cable curve
- it becomes less trustworthy when long spans or more exact force behavior matter

### 2. Catenary

The `catenary` solver computes the cable as a true catenary under self-weight. This is the more physically correct model for an unloaded cable with distributed weight.

Use it when:

- you want a more realistic cable shape than the parabolic approximation
- self-weight behavior is the main concern
- geometric accuracy is more important than raw speed

Characteristics:

- uses a catenary function instead of a parabola
- still uses the configured horizontal tension as the primary project input
- better represents the actual cable curve under distributed load

Tradeoffs:

- more computationally involved than the parabolic solver
- still does not model a moving concentrated payload within the standard solver path

### 3. Piecewise Catenary

The `catenary-piecewise` solver extends the catenary approach with a concentrated point load. It models the cable as two catenary segments with a slope discontinuity at the load point.

Use it when:

- you want to approximate the effect of a payload suspended on the cable
- support and anchor forces under loaded conditions matter more than unloaded shape only

Characteristics:

- based on catenary geometry
- introduces a point load into the span calculation
- useful for loaded-case estimation beyond pure self-weight

Current implementation note:

- in the current calculation pipeline, the point load is assumed at mid-span for each span

Tradeoffs:

- more realistic for loaded scenarios than the other two modes
- still simplified and not a full moving-load or full ropeway simulation model

### Solver selection guidance

- Choose `parabolic` for fast first-pass planning.
- Choose `catenary` when you want the best unloaded cable shape from the current solvers.
- Choose `catenary-piecewise` when the payload effect should be included, knowing that the current implementation assumes a centered point load.

## Repository Layout

```text
.
|- CLAUDE.md
|- CONTEXT.md
|- README.md
`- seilbahn-app/
   |- package.json
   |- angular.json
   |- Dockerfile
   |- docker-compose.yml
   |- nginx.conf
   |- ngsw-config.json
   `- src/
      |- app/
      |  |- app.config.ts
      |  |- app.routes.ts
      |  |- models/
      |  |- services/
      |  `- features/
      |- assets/
      `- styles/
```

## Main Application Areas

### Routing
- `/projects`: project list
- `/project/create`: create a new project
- `/project/:id`: full planning workflow

### Core services
- `src/app/services/state/project-state.service.ts`
  - central project state
  - auto-save
  - updates for terrain, supports, cable config, solver, and calculation result
- `src/app/services/storage/indexed-db.service.ts`
  - Dexie wrapper for projects and cable presets
- `src/app/services/calculation/cable-calculator.service.ts`
  - main calculation orchestration
- `src/app/services/presets/cable-preset.service.ts`
  - system and user presets
- `src/app/services/geo/leaflet-map.service.ts`
  - map state and azimuth handling
- `src/app/services/geo/geolocation.service.ts`
  - browser geolocation access
- `src/app/services/export/pdf-export.service.ts`
- `src/app/services/export/dxf-export.service.ts`

### Main feature components
- `src/app/features/project/project-list`
- `src/app/features/project/project-create`
- `src/app/features/project/project-detail`
- `src/app/features/map/map-container`
- `src/app/features/terrain/terrain-input`
- `src/app/features/support/support-placement`
- `src/app/features/cable/cable-config`
- `src/app/features/calculation/calculation-results`
- `src/app/features/visualization/profile-chart`
- `src/app/features/export/export-panel`

## Getting Started

### Prerequisites
- Node.js 24 or compatible modern Node.js runtime
- npm

### Install

```bash
cd seilbahn-app
npm ci
```

### Run locally

```bash
cd seilbahn-app
npm start
```

The Angular dev server runs on `http://localhost:4200/` by default.

### Production build

```bash
cd seilbahn-app
npm run build
```

### Tests

```bash
cd seilbahn-app
npm test
```

## Docker Deployment

The repository already includes a multi-stage Docker build and an nginx runtime image.

### Build and run with Docker

```bash
cd seilbahn-app
docker build -t seilbahn-app .
docker run --rm -p 8080:80 seilbahn-app
```

### Run with docker compose

```bash
cd seilbahn-app
docker compose up --build
```

The included compose file is prepared for Traefik-based deployment.

## PWA and Offline Behavior

- Angular Service Worker is registered in production builds only
- The app stores projects and cable presets locally in IndexedDB
- There is no offline map tile caching implementation yet

## Domain Notes

- Cable presets are loaded from `src/assets/presets/system-cable-presets.json`
- User presets are persisted locally
- Cable capacity is checked against the explicitly selected cable diameter and strength class
- The chart includes a separate simulation layer that can visualize empty cable, loaded cable, critical clearance, anchor points, and live force feedback

## Known Gaps

- No dedicated UI for editing start station and end station parameters
- No explicit end point selection on the map
- `presetModified$` in the state service is still a placeholder
- Limited automated test coverage
- No offline map caching or advanced field sync strategy yet

## Documentation

- `CLAUDE.md` contains the current project-oriented technical overview
- `CONTEXT.md` contains a shorter working summary of the codebase
