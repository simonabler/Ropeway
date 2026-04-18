# TODO

## Open Findings

### UI / UX
- `Medium`: The preset list still contains a `button` inside another `button`. This is invalid HTML and can cause focus, click, and accessibility issues, especially when deleting a user preset. [cable-config.html](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/cable/cable-config/cable-config.html#L7) [cable-config.html](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/cable/cable-config/cable-config.html#L25)
- `Medium`: `Locate me` still adds new GPS markers and accuracy circles on every use without clearing the previous ones. The map can become visually cluttered very quickly. [map-container.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/map/map-container/map-container.ts#L98) [leaflet-map.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/geo/leaflet-map.service.ts#L329)

### State / Architecture
- `Medium`: `presetModified$` is still exposed as public state API, but it always returns `false` because the comparison logic is still missing. Any future consumer will receive an incorrect state. [project-state.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/state/project-state.service.ts#L48)
- `Medium`: Deleting a selected user preset still clears only the local signal, not the persisted `cablePresetId` in project state. After reload, the project can still reference a preset that no longer exists. [cable-config.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/cable/cable-config/cable-config.ts#L423) [cable-config.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/cable/cable-config/cable-config.ts#L426) [project-state.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/state/project-state.service.ts#L302) [cable-config.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/cable/cable-config/cable-config.ts#L310)
- `Medium`: System presets are only written to IndexedDB on first install. Changes in `system-cable-presets.json` are not migrated to existing installs, so preset fixes can remain stuck on client devices. [cable-preset.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/presets/cable-preset.service.ts#L47) [cable-preset.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/presets/cable-preset.service.ts#L49)

## Recently Completed

### Calculation / Solver
- `Done`: Payload is no longer ignored in `parabolic` and `catenary` result generation. The active load case now feeds the real calculation pipeline instead of affecting only `catenary-piecewise`. [cable-calculator.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/cable-calculator.service.ts) [parabolic-approximation.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/engine/physics/parabolic-approximation.ts) [catenary-approximation.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/engine/physics/catenary-approximation.ts)
- `Done`: The piecewise solver is no longer locked to a hardcoded mid-span point load. The active load position now comes from central state. [cable-calculator.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/cable-calculator.service.ts) [cable.model.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/models/cable.model.ts)
- `Done`: `maxTension` in the loaded piecewise case now considers support points and load-adjacent critical points instead of support points only. [piecewise-catenary.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/engine/physics/piecewise-catenary.ts)
- `Done`: Final result geometry, cable line, and clearance now use the active loaded design case instead of the unloaded baseline. [cable-calculator.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/cable-calculator.service.ts)
- `Done`: `catenary-piecewise` is now used as real result geometry for the loaded span instead of being limited to a force-only check. [cable-calculator.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/cable-calculator.service.ts)
- `Done`: Anchor-force direction was normalized to signed global components, and support reactions now use a signed vector balance instead of absolute-value summation. [calculation.model.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/models/calculation.model.ts) [cable-calculator.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/calculation/cable-calculator.service.ts) [calculation-results.html](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/calculation/calculation-results/calculation-results.html)

### Route Persistence
- `Done`: The project now persists a real geographic `endPoint` in addition to `startPoint`, and `azimuth` is kept in sync from route geometry. [project.model.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/models/project.model.ts) [project-state.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/state/project-state.service.ts)
- `Done`: Legacy projects without `endPoint` are backfilled from `startPoint + azimuth + terrain length`. [project-state.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/state/project-state.service.ts)
- `Done`: The map now works with a real end marker and immediately persists completed route edits. [map-container.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/map/map-container/map-container.ts) [leaflet-map.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/geo/leaflet-map.service.ts)

### Calculation Controls
- `Done`: The three profile sliders now drive the actual calculation state instead of a chart-only simulation state. [profile-chart.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/visualization/profile-chart/profile-chart.ts) [project-state.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/state/project-state.service.ts)
- `Done`: `CableConfiguration` now includes `loadPositionRatio`, with legacy fallback to `0.5`. [cable.model.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/models/cable.model.ts) [project-state.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/state/project-state.service.ts)
- `Done`: Temporary `calculationOverrides` were added so slider edits affect the current calculation without permanently overwriting the saved base configuration. [project-state.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/state/project-state.service.ts)
- `Done`: The profile panel now has a real reset flow that clears active overrides and restores the saved project parameters. [profile-chart.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/visualization/profile-chart/profile-chart.ts) [profile-chart.html](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/visualization/profile-chart/profile-chart.html)
- `Done`: Exports and calculation metadata now reflect the active load case and active slider overrides. [calculation.model.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/models/calculation.model.ts) [pdf-export.service.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/services/export/pdf-export.service.ts)

### UI / Safety
- `Done`: Calculation is no longer enabled with terrain alone; the UI now requires supports before the calculation can run. [calculation-results.ts](C:/Users/ematric/Desktop/Seilbahn/seilbahn-app/src/app/features/calculation/calculation-results/calculation-results.ts)

## Recommended Next Steps
1. Fix the invalid nested `button` structure in the preset picker.
2. Clean up repeated GPS marker / accuracy-circle creation in `Locate me`.
3. Implement real `presetModified$` comparison logic.
4. Clear persisted `cablePresetId` when a selected user preset is deleted.
5. Add migration or versioning for system preset updates in existing installations.

## Verification Note
- TypeScript compile passed with `node .\\node_modules\\typescript\\lib\\tsc.js -p tsconfig.app.json --noEmit`.
- Vitest could not be executed successfully in this environment because the worker process startup failed with `spawn EPERM`.
