# Feature Roadmap

## Scope

This document summarizes what can be improved in the current ropeway planner after reviewing:

- [WHFF_Schlussbericht_GrundlagenSeillinienplanung.pdf](C:/Users/ematric/Downloads/WHFF_Schlussbericht_GrundlagenSeillinienplanung.pdf)
- [8d745b1b-1377-4a3a-a89f-8a63a67063c3_0.pdf](C:/Users/ematric/Downloads/8d745b1b-1377-4a3a-a89f-8a63a67063c3_0.pdf)

It is written against the current app state in this repository, not against the original Seilaplan plugin.

## Main Takeaways From The Documents

### 1. Multi-span fixed-end systems need more than a simple fixed-H span model

The WSL report makes the main engineering point very clearly:

- for multi-span, fixed-end rope systems, the cable force state changes with carriage position
- the horizontal force component is not truly constant over the full operating case
- a catenary-based method following Zweifel is materially better than Pestal-style simplifications

Implication for this app:

- the current `fixed-H` approach is usable as an early planning approximation
- it should not be presented as a full engineering-grade representation of a fixed-end multi-span system

### 2. Loaded geometry and loaded force checks must stay coupled

Both reports treat the loaded cable path, the clearance path, and the force state as one engineering problem.

Implication for this app:

- the recent fix that ties result geometry to the active loaded case was the right direction
- the next step is to upgrade the physics model, not to re-separate geometry and force checks again

### 3. Real systems are affected by friction, anchor compliance, mast movement, and rope properties

The reports repeatedly point to factors that explain differences between theory and measurement:

- saddle friction
- anchor elasticity / non-perfect fixation
- mast movement
- rope properties such as elastic modulus and metallic area / fill factor

Implication for this app:

- these are the biggest missing engineering inputs if the product should move beyond a simplified planning tool

### 4. Exact load case handling matters

The Austrian report highlights measured carriage position, measured payload, and changing base tension during operation. It also shows that planning tools are judged by whether they can work with exact payloads and realistic load paths.

Implication for this app:

- having a real `loadPositionRatio` and active load-case control is good
- but the physics still needs to respond globally to load position, not only locally inside one active span model

### 5. Practical value is not only calculation accuracy

The documents put strong emphasis on:

- short and detailed reports
- clear graphical outputs
- support tree and anchor assessment
- corridor-based planning
- GIS-based context such as terrain, orthophotos, and vegetation data

Implication for this app:

- the product can gain a lot of value from planning workflow features, not only solver math

## Current Gap To The Document Direction

Compared with the two reports, the main remaining gaps in this codebase are:

1. The current solver family is still fundamentally a simplified planning model.
   It uses configured pretension as the primary input and does not yet solve a full elastic fixed-end multi-span state.

2. Rope material behavior is underspecified.
   There is no real engineering input for elastic modulus, metallic cross-sectional area, or fill factor.

3. Support friction and anchor / mast compliance are not modeled.
   The reports explicitly identify these as important for matching reality.

4. Structural output is still incomplete.
   The reports emphasize support forces, kink angles, saddle effects, and anchor assessment. The app now has better force output, but it still lacks a richer structural design layer.

5. Validation and calibration are missing.
   There is no measurement benchmark mode, no calibration flow, and no explicit uncertainty view.

6. Planning intelligence is still basic.
   There is no corridor optimization, no support-tree candidate workflow, and no vegetation-data-assisted support placement.

## Recommended Changes

### A. Split solver intent explicitly

The app should separate two concepts in the UI and in the code:

- `Planning solver`
  Fast, simplified, interactive, based on configured pretension
- `Engineering solver`
  Slower, more physical, based on fixed-end multi-span equilibrium with elastic cable behavior

Why:

- right now the app risks overstating what the current model means physically
- the documents make clear that simplified and engineering-grade calculation are not the same class of tool

### B. Add a true engineering rope model

The next major physics upgrade should include:

- elastic modulus input
- metallic area or fill factor input
- full cable length / elasticity constraint
- load-position-dependent global force redistribution
- proper inclined catenary treatment instead of symmetric-span approximation

Why:

- this is the most direct path toward a Zweifel-like engineering mode
- it addresses the biggest conceptual gap identified by the documents

### C. Add optional realism corrections

After the engineering mode exists, add optional correction models for:

- saddle friction
- anchor compliance
- mast compliance / movement
- haulback / skyline interaction for 3-rope operating cases

Why:

- both reports show that these effects explain systematic deviations between measured and calculated values

### D. Expand structural outputs

The app should calculate and report:

- support kink angles
- saddle contact / uplift check
- support reaction component breakdown
- minimum anchor tree / support tree sizing guidance
- static reserve and dynamic reserve placeholders

Why:

- the documents treat these as practically relevant outputs for field planning and safe construction

### E. Add validation and calibration workflows

The app should support:

- benchmark example projects from measured cases
- import of measured carriage positions / load cases
- calibration mode for pretension and rope parameters
- uncertainty display in the report

Why:

- the reports are measurement-driven
- this would let the app move from "calculator" toward "validated planning tool"

### F. Expand planning intelligence

The next planning feature set should include:

- corridor-based route search
- support-tree candidate overlays
- anchor candidate overlays
- vegetation / canopy model integration
- route comparison between multiple feasible lines

Why:

- both reports see GIS context and candidate-tree support as a major practical advantage
- this is one of the clearest product differentiators beyond pure mechanics

## Step-by-Step Expansion Plan

### Step 1. Clarify solver semantics

Goal:

- stop mixing "simplified interactive planner" and "engineering calculation" in the same mental model

Implement:

- rename current solver descriptions in UI and README
- mark current mode as pretension-driven planning calculation
- add explicit result metadata saying whether the result is simplified or engineering-grade
- show active load case and design envelope as separate concepts

Expected value:

- reduces user misunderstanding immediately
- low risk, high clarity

### Step 2. Add engineering rope inputs

Goal:

- introduce the missing parameters identified in the WSL report

Implement:

- extend `CableConfiguration` with:
  - `elasticModulusKNPerMm2`
  - `fillFactor`
  - optionally `metalAreaMm2`
- add defaults and explanations in the UI
- update export and persistence

Expected value:

- prepares the data model for a real physics upgrade
- still manageable without rewriting the whole solver yet

### Step 3. Build a true multi-span engineering solver

Goal:

- move from span-local fixed-H behavior toward a global fixed-end loaded solution

Implement:

- solve the rope state over the full line for a given carriage position
- include rope elasticity and global force redistribution
- replace the current "active loaded span only" concept in engineering mode
- support inclined spans with a true asymmetric catenary treatment

Expected value:

- this is the most important physics milestone
- brings the app much closer to the document direction

### Step 4. Add realism modules

Goal:

- reduce systematic deviation between model and field behavior

Implement:

- optional saddle friction coefficient
- optional anchor compliance / stiffness
- optional mast compliance / deflection input
- optional 3-rope load-sharing correction

Expected value:

- makes the model more believable in real deployments
- enables measured-vs-calculated tuning later

### Step 5. Expand structural design output

Goal:

- turn the result from "cable profile + tension" into a more complete field-planning package

Implement:

- kink angle output per support
- saddle force and uplift checks
- richer anchor-force report
- support and anchor sizing aids
- report section for governing structural checks

Expected value:

- directly useful for practical planning and documentation

### Step 6. Add validation and calibration tools

Goal:

- make the tool defensible against measured cases

Implement:

- reference scenarios from published measurements
- compare measured carriage path to simulated path
- compare measured anchor tension to simulated anchor tension
- calibration wizard for pretension and rope parameters
- confidence / uncertainty summary in report

Expected value:

- major credibility gain
- useful for research and professional users

### Step 7. Add corridor and tree-assisted planning

Goal:

- improve route design, not only route analysis

Implement:

- corridor input instead of only one fixed route
- support-tree candidate layers
- anchor-tree candidate layers
- vegetation-height or LiDAR-assisted overlays
- rank multiple route alternatives by supports, clearance, forces, and length

Expected value:

- strong practical feature
- aligns well with both reports

### Step 8. Improve reporting and training support

Goal:

- turn results into something easier to trust and use in field practice

Implement:

- short report and detailed technical report modes
- glossary for force terms and solver assumptions
- visual explanation of loaded case vs pretension vs reserve
- saved scenario comparison

Expected value:

- easier adoption by field users
- fewer interpretation mistakes

## Suggested Priority For This Repository

If the goal is the best next return on effort, the order should be:

1. Step 1: clarify solver semantics
2. Step 2: add engineering rope inputs
3. Step 3: build a true multi-span engineering solver
4. Step 5: expand structural design output
5. Step 4: add realism modules
6. Step 6: add validation and calibration tools
7. Step 7: add corridor and tree-assisted planning
8. Step 8: improve reporting and training support

Reason:

- the biggest current risk is overclaiming the physics model
- the biggest long-term value is a real engineering solver
- the biggest product differentiation after that is validation plus route-planning intelligence

## Concrete Next Features To Implement

If development should continue immediately, these are the strongest next tickets:

1. Add `engineeringMode` and relabel current solvers as simplified pretension-based planning methods.
2. Extend cable config with elastic modulus and fill factor.
3. Add a full-line engineering result type that stores:
   - governing load position
   - governing span
   - loaded full-line cable path
   - full-line anchor and support checks
4. Add kink angle and saddle check output to the calculation panel and PDF export.
5. Add benchmark sample projects from measured cases so solver changes can be regression-tested against known behavior.
6. Add a corridor-planning concept and tree-candidate overlay as the first GIS intelligence feature.

## Notes

- The documents support the current shift toward loaded-case consistency, but they also show that the app is still one major solver generation away from a full Seilaplan-like engineering model.
- The most important architectural decision is whether this app wants to remain a fast field-planning PWA or also become a defensible engineering calculation tool. The roadmap above assumes both can coexist, but as clearly separated modes.
