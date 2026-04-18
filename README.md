# Seilbahn PWA

Seilbahn PWA is a mobile-first Angular Progressive Web App for planning and engineering-oriented review of material ropeways. It is designed for field use on phones and tablets and combines route orientation, terrain capture, technical station editing, support placement, cable configuration, structural calculation, visualization, and export in one workflow.

## Current Status

The application currently provides a single project detail workflow with these sections:

1. Start point and end point on a Leaflet map
2. Dedicated technical station editor for start and end station
3. Terrain profile capture
4. Support placement
5. Cable presets and manual cable configuration
6. Calculation with explicit `Planning` and `Engineering` families
7. D3 profile visualization with active load-case controls
8. Export to PDF, DXF, and JSON

The map stores a geographic route with `startPoint`, `endPoint`, and synchronized `azimuth`. The technical station editor stores `startStation` and `endStation` as engineering endpoint objects. In `auto` mode their station length and terrain elevation are synchronized from the terrain profile; in `manual` mode the user can override them directly.

## Key Features

### Project management
- Create, open, list, and delete projects
- Local persistence via IndexedDB
- Auto-save through the central project state service

### Map and geo
- Leaflet map with OpenStreetMap tiles
- Start point and end point selection
- Azimuth derived from the stored route geometry
- GPS locate and "use current position as start" support

### Terrain and supports
- Manual terrain segment entry
- Automatic total length and elevation change updates
- Manual support placement along the route
- Dedicated technical station editor with:
  - identifier and notes
  - auto/manual derivation mode
  - station length
  - terrain elevation
  - anchor height above terrain
  - anchor metadata

### Cable configuration
- Built-in system presets from JSON
- User-defined presets stored in IndexedDB
- Manual configuration of cable weight, horizontal tension, safety factor, load, clearance, diameter, strength class, and material
- Engineering expert inputs:
  - `elasticModulusKNPerMm2`
  - `fillFactor`
- Preset integrity metadata in the UI:
  - preset origin
  - preset version
  - modified / aligned state
  - missing preset reference cleanup

### Calculation
- Calculation family selection:
  - `planning`
  - `engineering`
- Planning solvers:
  - `parabolic`
  - `catenary`
  - `catenary-piecewise`
- Engineering solver:
  - `global-elastic-catenary`
- Engineering design modes:
  - `selected`
  - `worst-case`
- Automatic recalculation when relevant project data changes
- Span geometry, tension, clearance, anchor forces, support reactions, and cable capacity checks
- Engineering metrics such as solved `H`, reference length, loaded length, unstretched length, and per-span extension

### Visualization
- Interactive D3 chart for terrain, cable line, supports, and clearance
- Zoom, pan, and fullscreen mode
- Session-level active load-case controls with adjustable:
  - horizontal tension
  - point load
  - load position
- Reset back to the saved project parameters
- Anchor force overlays and live cable utilization feedback
- Engineering-mode visualization of the selected case or the worst-case envelope

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

## Calculation Families and Solvers

The application now exposes two product families with intentionally different semantics.

### Planning family

Planning mode is for fast route screening and early feasibility checks. It keeps the configured horizontal pretension as the primary input and uses simplified span-based mechanics.

Available planning solvers:

- `parabolic`
- `catenary`
- `catenary-piecewise`

### Engineering family

Engineering mode is for stricter technical review and scenario discussion. It uses the `global-elastic-catenary` solver, accepts rope elasticity inputs, and can evaluate either the active load case or a worst-case envelope across sampled payload positions.

Engineering design modes:

- `selected`
- `worst-case`

### Shared calculation pipeline

Both families use the same project workflow, terrain profile, technical stations, support topology, cable capacity checks, and export pipeline. The meaning of the results differs by family, and both the UI and PDF export now show:

- family
- method
- intended use
- governing load case
- model assumptions

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

Tradeoffs:

- more realistic for loaded scenarios than the other two modes
- still simplified and not a full moving-load or full ropeway simulation model

### Solver selection guidance

- Choose `parabolic` for fast first-pass planning.
- Choose `catenary` when you want a better unloaded planning curve than the parabolic approximation.
- Choose `catenary-piecewise` when the payload effect should be included in the planning family.
- Choose `global-elastic-catenary` in engineering mode when you need a global multi-span response with elastic rope inputs and optional worst-case envelope scanning.

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
  - updates for terrain, supports, route geometry, technical stations, cable config, solver, and calculation result
- `src/app/services/storage/indexed-db.service.ts`
  - Dexie wrapper for projects and cable presets
- `src/app/services/calculation/cable-calculator.service.ts`
  - main calculation orchestration
- `src/app/services/calculation/engineering/global-engineering-calculator.service.ts`
  - global elastic multi-span engineering solver
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
- `src/app/features/station/station-editor`
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
- User presets are persisted locally and system presets carry schema version metadata
- Cable capacity is checked against the explicitly selected cable diameter and strength class
- The profile chart drives the active load case used by the current calculation result
- Geographic route editing and technical station editing are intentionally separate concepts

## Known Gaps

- Engineering mode is still a V1 solver without saddle friction, mast compliance, or anchor compliance
- Benchmark coverage exists for core solver paths but is still a minimum viable regression suite
- No offline map caching or advanced field sync strategy yet

## Documentation

- `CLAUDE.md` contains the current project-oriented technical overview
- `CONTEXT.md` contains a shorter working summary of the codebase
