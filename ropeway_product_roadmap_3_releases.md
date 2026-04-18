
# Ropeway Product Roadmap (3 Releases)

Stand: 2026-04-18  
Format: roadmap + implementation-ready issues for AI agents  
Product thesis: **Ropeway should be positioned as an engineering-oriented planning tool**: faster and field-usable like a planning PWA, but technically more credible and decision-oriented than a simple span calculator.

---

## 0. Why this roadmap

The current codebase already has the right backbone:

- a project workflow with terrain, supports, cable config, calculation, visualization, and export
- a **planning** path with `parabolic`, `catenary`, and `catenary-piecewise`
- an **engineering** path with `global-elastic-catenary`
- engineering-specific rope inputs such as `elasticModulusKNPerMm2` and `fillFactor`
- engineering design modes `selected` and `worst-case`
- engineering result metadata including `engineeringMetrics` and an optional envelope

But the positioning is still softer than it could be because:

- solver semantics are not yet strong enough in the product surface
- technical station modeling is still weaker than the mechanics underneath
- engineering V1 explicitly states that it has **no saddle friction** and **no mast/anchor compliance**
- there is still no dedicated station editor in the current product direction
- `presetModified$` is still incomplete
- test coverage is still small
- validation/calibration workflows are still missing

This roadmap therefore does **not** optimize for breadth. It optimizes for **credibility, technical clarity, and differentiated decision support**.

---

## 1. Release overview

## Release 1 — Clarify the product and harden the technical input layer
**Goal:** make the app unmistakably feel like an engineering-oriented planning tool, not just a route sketcher with a solver.  
**Theme:** semantics, inputs, trust, baseline quality.  
**Outcome:** users understand what is planning vs engineering, can enter technical endpoint data cleanly, and see trustworthy result metadata.

### Release 1 exit criteria
- Planning and Engineering are clearly separated in UI, copy, exports, and persisted result metadata.
- Start/end stations can be edited as technical entities, not only inferred from route geometry.
- Preset integrity is reliable and explainable.
- A minimal regression/benchmark suite exists for solver and state-critical paths.

---

## Release 2 — Build engineering credibility into the result space
**Goal:** move the engineering mode from “good technical direction” to “credible working engineering mode.”  
**Theme:** envelopes, structural checks, realism modules, reportability.  
**Outcome:** engineering users can see governing load cases, structural consequences, and model limitations directly in the result layer.

### Release 2 exit criteria
- Engineering mode exposes design mode, active case, and envelope case clearly.
- Structural outputs go beyond cable line + tension.
- Optional realism corrections exist behind explicit assumptions toggles.
- Engineering reports are decision-ready and auditable.

---

## Release 3 — Differentiate with decision support and validation
**Goal:** make Ropeway stronger than a calculator by helping users compare, calibrate, and choose variants.  
**Theme:** assisted planning, scenario comparison, validation, uncertainty.  
**Outcome:** Ropeway becomes a niche tool for engineering-oriented planning decisions, not only for single-case analysis.

### Release 3 exit criteria
- Users can compare route/support variants.
- Calibration and benchmark workflows exist.
- Uncertainty and scenario comparison are visible in reports and UI.
- At least one decision-support workflow produces ranked alternatives.

---

## 2. Delivery rules for all issues

Every issue below is written so it can be handed to an AI coding agent.  
For every implementation, the agent must respect these project rules:

- Keep Angular **Standalone Components** and lazy `loadComponent()` routing.
- Route project mutations through `ProjectStateService` where appropriate.
- Do **not** break the existing project model semantics (`startStation`, `endStation`, `supports`, `calculationResult`).
- Do **not** simplify calculation logic where it changes result relevance.
- Preserve PDF, DXF, and JSON export paths.
- Keep backward compatibility for existing saved projects whenever possible.
- Add or update tests for every behavior change that touches calculations, persistence, or interpretation-critical UI.

---

# Release 1 — Clarify and harden the product core

## Issue R1-01 — Split product semantics cleanly between Planning and Engineering

### Why this matters
The repo now already supports both `calculationMode = 'planning' | 'engineering'`, and the result model stores `solverFamily`, `method`, `modelAssumptions`, and optional `engineeringMetrics`. However, the product still risks feeling like one fuzzy calculator instead of two clearly different tool modes.

### Problem
Users can misunderstand:
- what “planning” results mean physically
- what “engineering” results add
- which assumptions apply to each result
- whether a given exported result is suitable for screening or engineering review

### Goal
Make the distinction between **Planning** and **Engineering** explicit across:
- UI labels
- calculation panel text
- result metadata
- PDF export
- project persistence defaults
- help text / glossary

### Desired behavior
- Users select a **mode family** first: `Planning` or `Engineering`.
- Planning exposes the planning solvers:
  - `parabolic`
  - `catenary`
  - `catenary-piecewise`
- Engineering exposes:
  - `global-elastic-catenary`
  - `engineeringDesignMode = selected | worst-case`
- Every result card and export visibly shows:
  - mode family
  - method
  - governing load case
  - assumption summary
  - “intended use” text

### In scope
- calculation mode selector in UI
- better solver descriptions
- result badges and assumption panel
- export metadata block
- glossary/help copy
- migration/defaulting for legacy projects without explicit mode

### Out of scope
- changing the underlying physics
- introducing new engineering solvers beyond the current family
- calibration features

### Likely files/modules
- `models/project.model.ts`
- `models/calculation.model.ts`
- `services/state/project-state.service.ts`
- `features/calculation/calculation-results/*`
- `features/cable/cable-config/*`
- `services/export/pdf-export.service.ts`
- `README.md`
- optionally `CONTEXT.md`

### Implementation notes
- Preserve existing `solverType` values.
- Introduce a stable UI layer concept:
  - `Planning family`
  - `Engineering family`
- Ensure old projects without `calculationMode` default to `planning`.
- Ensure existing engineering projects still render correctly.

### Acceptance criteria
- Users can visibly tell which mode they are in before calculation.
- The results panel shows mode family, method, and assumptions.
- The PDF report includes a clear assumptions block and intended-use note.
- Legacy projects load without breaking.
- Unit tests cover defaults and mode switch behavior.

### Suggested tests
- legacy project without `calculationMode` loads as `planning`
- switching family updates available solver options
- engineering result renders `engineeringMetrics`
- PDF export contains mode/assumption metadata

---

## Issue R1-02 — Add a dedicated technical station editor for start and end station

### Why this matters
The codebase already models `startStation` and `endStation`, but the repo direction still notes that there is no dedicated station UI and that the map endpoint is not the same as a technical endpoint. This weakens the engineering-oriented identity.

### Problem
The product currently mixes:
- geographic route definition
- technical station definition

That causes ambiguity around:
- anchor geometry
- station elevation interpretation
- technical endpoint inputs
- engineering reviewability

### Goal
Introduce a dedicated station editor that treats `startStation` and `endStation` as technical objects with explicit engineering meaning.

### Desired behavior
Users can edit for each endpoint:
- station length
- terrain elevation reference
- attachment/anchor height above terrain
- optional anchor metadata
- notes / identifier
- whether endpoint values are auto-derived or manually overridden

The map remains geographic, but the station editor becomes the technical source of truth.

### In scope
- station editor UI
- start/end station forms
- state synchronization via `ProjectStateService`
- validation messages
- clear relationship between `endPoint` (geographic) and `endStation` (technical)

### Out of scope
- automatic anchor design
- anchor tree sizing
- structural support checks

### Likely files/modules
- `models/end-station.model.ts`
- `models/project.model.ts`
- `services/state/project-state.service.ts`
- `features/project/project-detail/*`
- new feature folder e.g. `features/station/station-editor/*`
- `features/map/map-container/*`
- `features/calculation/calculation-results/*`

### Implementation notes
- Do not remove route geometry.
- Keep `endPoint` for geographic route editing.
- Keep `endStation` as the engineering endpoint object.
- Add a small UI explanation:
  - “Map endpoint = geographic position”
  - “Station editor = technical endpoint parameters”

### Acceptance criteria
- Users can edit start/end station parameters directly in the workflow.
- Calculation uses station editor values consistently.
- The UI clearly distinguishes geographic endpoint vs technical station.
- Existing projects load with sensible defaults.
- Validation prevents obviously inconsistent endpoint data.

### Suggested tests
- station edits persist and reload
- calculation responds to changed anchor height
- engineering and planning modes both consume station editor data
- legacy projects backfill station fields safely

---

## Issue R1-03 — Finish preset integrity: real `presetModified$`, deletion cleanup, and preset versioning

### Why this matters
Preset trust is central because Ropeway is meant to be used in the field. The current repo still has open preset-state problems, including incomplete `presetModified$`, deletion inconsistency, and no migration/versioning path for system preset updates.

### Problem
Preset behavior is currently not strong enough for an engineering-oriented tool:
- users may not know whether the active config still matches the preset
- deleted presets can leave stale references
- updated system presets may not propagate into existing client installs cleanly

### Goal
Make presets deterministic, inspectable, and migration-safe.

### Desired behavior
- `presetModified$` becomes real and reliable
- deleting a selected preset clears persisted references safely
- system presets are versioned and migrated
- UI shows:
  - preset origin
  - modified/unmodified state
  - preset version
  - missing/deleted preset state

### In scope
- preset comparison logic
- delete cleanup
- system preset versioning/migration
- UI state indicator
- migration tests

### Out of scope
- full cloud sync
- manufacturer libraries
- advanced preset import/export

### Likely files/modules
- `services/state/project-state.service.ts`
- `services/presets/cable-preset.service.ts`
- `features/cable/cable-config/*`
- `services/storage/indexed-db.service.ts`
- preset JSON assets

### Implementation notes
- Store a stable preset version/hash for comparison.
- Comparison should ignore irrelevant formatting/default differences.
- Handle deleted preset references gracefully:
  - preserve current values
  - remove invalid `cablePresetId`
  - show warning state

### Acceptance criteria
- `presetModified$` reflects actual config changes.
- Deleting a preset never leaves a broken reference behind.
- System preset updates can migrate existing installs.
- The cable config UI clearly explains preset status.

### Suggested tests
- config change toggles modified state
- delete selected preset clears project reference
- system preset version bump triggers migration path
- missing preset is displayed as orphaned reference, not as hard failure

---

## Issue R1-04 — Create a minimum viable benchmark and regression suite for calculation trust

### Why this matters
A tool positioned as engineering-oriented must be able to defend itself against regressions. The repo context still identifies limited test coverage as a gap.

### Problem
Without reference scenarios, solver changes can silently shift:
- min clearance
- max tension
- support reactions
- governing load positions
- engineering envelope outputs

### Goal
Create a benchmark harness that turns the current mechanics into a regression-protected system.

### Desired behavior
Add a small set of canonical scenarios:
1. simple single-span planning / parabolic
2. simple single-span planning / catenary
3. loaded piecewise case with non-midspan load
4. multi-span engineering selected mode
5. multi-span engineering worst-case envelope mode

Each case should assert:
- `isValid`
- `method`
- min clearance range
- max tension range
- design check metadata
- selected warnings / assumptions
- key structural outputs if present

### In scope
- benchmark fixture format
- test helpers
- deterministic project fixtures
- numeric tolerance assertions
- CI-friendly tests

### Out of scope
- external measurement import
- full validation against field data
- uncertainty analysis

### Likely files/modules
- `services/calculation/**/*`
- `models/*`
- `tests` or existing Angular/Vitest test locations
- maybe `assets/examples/` or `test/fixtures/`

### Implementation notes
- Prefer range/tolerance assertions over exact floating-point matches.
- Separate “mechanics regression fixtures” from UI tests.
- Expose fixture projects as reusable sample projects later.

### Acceptance criteria
- At least 5 reference scenarios run in automated tests.
- Solver changes that materially shift results fail tests.
- The test harness is readable enough for future extensions.
- Documentation explains what each benchmark is intended to protect.

### Suggested tests
- full suite run under local test command
- per-solver regression fixtures
- engineering envelope fixture with sampled load cases
- persistence round-trip for benchmark projects

---

# Release 2 — Build engineering credibility into the result space

## Issue R2-01 — Add an Engineering Workspace with selected-case vs worst-case envelope views

### Why this matters
The engineering path already supports `engineeringDesignMode = selected | worst-case` and can compute an envelope. That is technically strong, but the product needs a dedicated workspace so engineering mode feels like a real analysis mode, not just a different service call.

### Problem
The current result space likely under-communicates:
- whether the shown geometry is selected-case or governing case
- how many load positions were sampled
- which station/span is critical
- whether the user is looking at active geometry or an envelope artifact

### Goal
Add a dedicated Engineering Workspace in the UI.

### Desired behavior
Engineering results show:
- design mode selector (`selected`, `worst-case`)
- active case summary
- governing load case summary
- envelope summary
- sampled load case count
- solved horizontal force
- span extension table
- toggle between:
  - active loaded geometry
  - worst-case envelope geometry (if available)

### In scope
- engineering result panel
- engineering metrics table
- envelope visualization
- design mode controls
- warnings/info messages cleanup

### Out of scope
- adding new physics
- calibration
- route optimization

### Likely files/modules
- `models/calculation.model.ts`
- `services/calculation/engineering/global-engineering-calculator.service.ts`
- `features/calculation/calculation-results/*`
- `features/visualization/profile-chart/*`
- `services/export/pdf-export.service.ts`

### Implementation notes
- Keep planning UI simple; only show this workspace in engineering mode.
- Use existing `engineeringMetrics` and `designCheck` first before inventing new data structures.
- Make sure envelope geometry cannot be mistaken for a real single-case cable shape.

### Acceptance criteria
- Engineering mode has a visibly different result workspace.
- Users can distinguish selected case from worst-case envelope.
- Envelope metadata includes sampled load case count and critical clearance location.
- Export includes the same distinctions.

### Suggested tests
- engineering result with `selected` mode renders without envelope
- engineering result with `worst-case` mode renders envelope summary
- toggling active/envelope view does not corrupt the persisted result
- PDF export includes engineering workspace metadata

---

## Issue R2-02 — Expand structural outputs: kink angles, saddle checks, uplift/contact state

### Why this matters
For an engineering-oriented planning tool, “cable line + max tension” is not enough. The next layer of practical engineering value is support and saddle interpretation.

### Problem
Structural consequences at supports are still underrepresented:
- kink angle at support
- saddle contact/uplift condition
- richer reaction interpretation
- support-level governing checks

### Goal
Add structural outputs that make the results more useful for practical review and safer planning.

### Desired behavior
For each support, calculate and show:
- incoming cable angle
- outgoing cable angle
- kink angle
- support reaction component breakdown
- saddle contact state:
  - contact
  - low-contact warning
  - uplift risk
- optional support governing flag

### In scope
- structural post-processing
- support-level UI table
- overlay markers in profile chart
- export section for structural checks

### Out of scope
- full FE mast analysis
- detailed saddle hardware design
- dynamic oscillation simulation

### Likely files/modules
- `models/calculation.model.ts`
- `services/calculation/engine/*`
- `services/calculation/engineering/global-engineering-calculator.service.ts`
- `features/calculation/calculation-results/*`
- `features/visualization/profile-chart/*`
- `services/export/pdf-export.service.ts`

### Implementation notes
- Start with static geometric/force-derived checks.
- Keep formulas documented in code comments.
- Use conservative thresholds where detailed hardware data is not available.
- Include explicit assumptions in warnings/export.

### Acceptance criteria
- Each support has structural output fields.
- Results panel shows kink angle and support state.
- Profile chart can highlight governing support.
- PDF includes a structural check table.

### Suggested tests
- support result includes kink angle
- uplift/contact status changes under different load positions
- exported structural section matches UI values
- no-support and one-support edge cases behave safely

---

## Issue R2-03 — Add optional realism modules: saddle friction, anchor compliance, mast compliance

### Why this matters
The engineering service already explicitly warns that V1 has no saddle friction and no mast/anchor compliance. Those omissions are acceptable for V1 but should be the next realism upgrade.

### Problem
Engineering mode will remain visibly incomplete unless it can model optional corrections for:
- saddle friction
- anchor compliance
- mast/support compliance

### Goal
Add optional realism modules as explicit, documented modifiers to the engineering solver.

### Desired behavior
Users can enable/disable optional realism corrections:
- saddle friction coefficient
- anchor axial stiffness / compliance
- mast/support compliance or effective head deflection stiffness

The result then:
- records active realism toggles
- includes them in `modelAssumptions`
- updates engineering metrics and structural outputs
- shows a warning that realism modules increase physical fidelity but remain model assumptions

### In scope
- model inputs
- engineering solver integration
- assumptions metadata
- report output
- tests

### Out of scope
- full nonlinear structural analysis
- time-domain dynamics
- rope-on-sheave rolling mechanics beyond simple friction modeling

### Likely files/modules
- `models/cable.model.ts`
- station/support models if needed
- `models/calculation.model.ts`
- `services/calculation/engineering/global-engineering-calculator.service.ts`
- engineering UI components
- export service

### Implementation notes
- Prefer modular flags and parameter objects.
- Keep defaults disabled for backward compatibility.
- Expose clear warning text when realism modules are off.
- Make it possible to compare baseline vs realism-enabled result later.

### Acceptance criteria
- Users can enable at least one realism correction without breaking old projects.
- Result assumptions explicitly list active realism modules.
- Engineering outputs change deterministically when corrections are enabled.
- Tests cover enabled and disabled states.

### Suggested tests
- baseline engineering run vs friction-enabled run differ predictably
- anchor compliance changes solved force/extension outputs
- disabled default preserves current behavior
- exported assumption list includes realism toggles

---

## Issue R2-04 — Upgrade the PDF report from export to engineering report

### Why this matters
Engineering-oriented positioning is strongest when the report can be used as a technical communication artifact, not just a data dump.

### Problem
Current export capability is good, but it still needs to become a stronger engineering report with interpretation-ready structure.

### Goal
Produce two report modes:
- **Short planning report**
- **Detailed engineering report**

### Desired behavior
Detailed engineering report includes:
- project metadata
- mode family and method
- model assumptions
- active load case
- governing load case
- envelope summary
- structural checks
- cable capacity check
- warnings grouped by severity
- scenario/override metadata
- version stamp / calculation timestamp

### In scope
- report layout redesign
- engineering-only sections
- assumption and warning tables
- summary page
- structural section
- scenario metadata

### Out of scope
- multi-language support
- custom branding engine
- cloud sharing

### Likely files/modules
- `services/export/pdf-export.service.ts`
- calculation result UI for consistency
- models if extra report metadata is needed

### Implementation notes
- Do not break existing PDF path.
- Use the existing screenshot/profile export where helpful, but make technical tables primary.
- Add report mode selector.

### Acceptance criteria
- Users can generate short planning and detailed engineering PDF modes.
- The detailed mode contains assumptions, governing case, and structural checks.
- Planning and engineering reports are clearly different in tone and content.
- Old projects can still export.

### Suggested tests
- report mode selector chooses different section sets
- engineering report includes assumptions and metrics
- warning severities render correctly
- export still works without optional plot image

---

# Release 3 — Differentiate with decision support and validation

## Issue R3-01 — Add support placement suggestions and variant scoring

### Why this matters
Manual support placement is useful, but a differentiating planning tool should help users find better variants faster.

### Problem
Today the app can analyze a chosen layout, but it does not yet assist users in generating or ranking alternatives.

### Goal
Introduce assistive support placement suggestions with simple variant scoring.

### Desired behavior
Given a route and terrain profile, the app can suggest candidate support layouts based on configurable objectives:
- fewer supports
- lower max tension
- better clearance reserve
- lower structural severity
- balanced trade-off

Users can:
- generate candidate layouts
- compare 2–5 variants
- accept one variant into the project

### In scope
- heuristic candidate generation
- variant score summary
- compare table
- accept-variant action
- persistence of accepted variant only

### Out of scope
- full mathematical optimization engine
- GIS corridor search
- automated tree suitability analysis

### Likely files/modules
- `services/calculation/*`
- terrain/support feature components
- `ProjectStateService`
- new variant-comparison UI
- export/report integration (summary only)

### Implementation notes
- Start with deterministic heuristics, not black-box optimization.
- Use existing support constraints (spacing, height sanity).
- Keep generated variants explainable.

### Acceptance criteria
- Users can generate at least 2 candidate support layouts.
- Variants are scored using visible criteria.
- One variant can be applied to the project.
- Result comparison is reproducible for the same input.

### Suggested tests
- deterministic candidate generation for fixed input
- scoring changes when optimization target changes
- accepted variant overwrites supports correctly
- invalid terrain/profile conditions fail safely

---

## Issue R3-02 — Add scenario comparison and uncertainty view

### Why this matters
Engineering-oriented decisions are rarely based on a single nominal case. Users need to compare scenarios and see what drives risk.

### Problem
The current product allows interactive overrides, but not a structured scenario comparison or uncertainty view.

### Goal
Add multi-scenario comparison and simple sensitivity/uncertainty display.

### Desired behavior
Users can save and compare scenarios such as:
- base case
- high load
- low pretension
- alternate cable
- realism modules on/off

For each scenario, compare:
- min clearance
- max tension
- solved H
- governing span
- structural severity
- cable utilization

Add a basic sensitivity view:
- which parameter changed
- how much key outputs moved

### In scope
- scenario save/rename/delete
- scenario comparison table
- uncertainty/sensitivity summary
- engineering and planning compatibility

### Out of scope
- probabilistic Monte Carlo
- advanced statistics
- cloud collaboration

### Likely files/modules
- `ProjectStateService`
- `models/project.model.ts`
- `models/calculation.model.ts`
- profile/calculation features
- export service

### Implementation notes
- Reuse current override mechanism where possible.
- Store scenarios as explicit named parameter sets, not only diffs.
- Make sure users can see which scenario is currently active.

### Acceptance criteria
- Users can save multiple scenarios per project.
- Scenario comparison table highlights best/worst values.
- Sensitivity summary is understandable without reading raw numbers only.
- Export can include a scenario comparison section.

### Suggested tests
- scenario save/load round-trip
- comparison table computes consistent deltas
- deleting a scenario does not affect base project
- sensitivity summary reflects parameter changes correctly

---

## Issue R3-03 — Add benchmark import and calibration workflow

### Why this matters
The strongest credibility boost after engineering mechanics is a workflow that compares model and measurement.

### Problem
There is still no path to:
- import measured cases
- compare simulated vs measured geometry/forces
- calibrate pretension or rope parameters

### Goal
Add a benchmark/calibration mode for known or measured cases.

### Desired behavior
Users can:
- load a benchmark project or measured case
- enter measured values such as:
  - carriage/load position
  - measured clearance / sag point
  - measured anchor force if available
- compare measured vs simulated values
- run a guided calibration for:
  - pretension / horizontal force
  - elastic modulus
  - fill factor
  - optional realism parameters if enabled

### In scope
- benchmark sample projects
- measured-value input UI
- comparison panel
- simple calibration assistant
- report section with calibrated parameters and residual mismatch

### Out of scope
- automatic fitting against large sensor datasets
- ML-based parameter estimation
- live telemetry integration

### Likely files/modules
- calculation/engineering services
- new benchmark/calibration feature UI
- models for measured case input
- sample project assets
- export/report service

### Implementation notes
- Start with manual input of measured points, not file import complexity.
- Keep calibration bounded and explainable.
- Always show pre-calibration vs post-calibration values.

### Acceptance criteria
- At least one benchmark sample project ships with the app.
- Users can enter measured values and see simulated deviation.
- Calibration updates selected parameters and shows residual mismatch.
- Reports include calibrated assumptions and fit quality summary.

### Suggested tests
- benchmark project loads
- measured input persists
- calibration adjusts allowed parameters only
- pre/post calibration comparison is reproducible

---

## Issue R3-04 — Add corridor and candidate overlay planning as the first GIS differentiator

### Why this matters
The long-term differentiator is not only better mechanics. It is better planning decisions in context. A first version of corridor-guided route planning would make Ropeway feel more like a niche field-planning system.

### Problem
The app currently works mainly on a chosen route. It does not yet assist the user in exploring alternative corridors or candidate anchor/support opportunities at the planning level.

### Goal
Add a first corridor-based planning layer without turning the product into a full GIS platform.

### Desired behavior
Users can:
- define a planning corridor around a route
- see candidate anchor/support opportunity markers or zones
- compare route alternatives at a lightweight level
- rank alternatives by:
  - length
  - support count
  - clearance risk
  - tension severity
  - estimated constructability score

### In scope
- corridor input concept
- route alternative object model
- simple ranking
- candidate overlay UI
- handoff from route alternative to full project calculation

### Out of scope
- full LiDAR engine
- enterprise GIS integration
- automated vegetation classification

### Likely files/modules
- map feature modules
- project state
- new route alternative models
- support placement and calculation pipeline integration

### Implementation notes
- Keep this intentionally lightweight in V1.
- Route alternatives can begin as manually adjusted lines inside a corridor.
- The main value is compare-and-choose, not autonomous GIS optimization.

### Acceptance criteria
- Users can define at least one corridor and create multiple route alternatives.
- Alternatives can be ranked with transparent scoring criteria.
- One alternative can be promoted into the active engineering/planning project.
- The workflow does not break the existing single-project calculation pipeline.

### Suggested tests
- corridor save/load round-trip
- alternative ranking is deterministic
- promotion to active project preserves valid calculation inputs
- map state and project state stay synchronized

---

## 3. Recommended implementation order inside each release

## Release 1 recommended order
1. R1-01 Split product semantics cleanly between Planning and Engineering  
2. R1-02 Add a dedicated technical station editor  
3. R1-03 Finish preset integrity  
4. R1-04 Create benchmark and regression suite  

Why: first make the product understandable, then harden inputs, then stabilize trust.

## Release 2 recommended order
1. R2-01 Engineering Workspace  
2. R2-02 Expand structural outputs  
3. R2-04 Upgrade PDF into engineering report  
4. R2-03 Optional realism modules  

Why: first expose engineering value clearly, then enrich it, then deepen physics.

## Release 3 recommended order
1. R3-02 Scenario comparison and uncertainty  
2. R3-03 Benchmark import and calibration  
3. R3-01 Support placement suggestions and variant scoring  
4. R3-04 Corridor and candidate overlay planning  

Why: first improve decision quality and trust, then add differentiated planning intelligence.

---

## 4. What should be deliberately deferred

To keep the positioning sharp, avoid prioritizing these before the roadmap above is complete:

- generic collaboration features
- large document management features
- full GIS platform ambitions
- aesthetic-only chart work
- excessive export format expansion
- too many solver names without stronger semantics and test coverage

---

## 5. Strategic summary

If Ropeway wants to be perceived as an **engineering-oriented planning tool**, the strongest path is:

1. **clarify what the tool is**  
2. **make the technical inputs explicit and trustworthy**  
3. **show engineering consequences, not only cable curves**  
4. **add calibration and comparison so decisions become defensible**  
5. **then add planning intelligence that helps choose better variants**

That sequence keeps the product narrow, credible, and differentiated.

