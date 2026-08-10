# Build Steps — Chess Fork → Wrestling Game

A working checklist. Tick items as they land. Every phase ends with a **Verify** block you can
actually run or look at, so "done" is never a matter of opinion.

Companion documents: `MECHANICS_SPEC.md` for the systems, `PORTING_PLAN.md` for the keep/delete
audit, `ASSET_SOURCES.md` for where every model, clip and texture comes from, `wrestling_game_prompt`
for the brief.

All paths are relative to `wrestling-arena/`.

---

## Phase 0 — Baseline before touching anything

- [x] Work inside `wrestling-arena/` (renamed from the King's Gambit fork; git history present).
- [x] Keep `LICENSE` in place. Create `ATTRIBUTIONS.md` crediting King's Gambit (MIT) and listing
      the licence of every sourced model, clip and sound.
- [x] `cd web`, install dependencies, run the dev server.
- [x] Confirm the chess baseline loads (menu, board, pieces).
- [x] **Cut the Rork dependency.** Copied `downloaded-assets/.../models/` and `audio/` into
      `web/public/`, repointed `MODEL_BASE` / `CRY_BASE` to `/models` and `/audio`. Verified zero
      requests to `r2-pub.rork.com`.

**Verify:** the chess game runs, pieces animate, and audio plays. Then open the network tab and
confirm zero requests to `r2-pub.rork.com`. If the baseline is broken, every later problem will be
ambiguous.

**Passed.**

---

## Phase 1 — Strip the chess out

- [x] Move chess game logic out of `src` into `web/reference/` (recoverable, not deleted):
      `core/gameController.ts`, `core/types.ts`, `core/premove.test.ts`, `ai/`.
- [x] Remove the `chess.js` dependency from `web/package.json`.
- [x] Move board/setting/period systems to `web/reference/scene/`: `sceneEngine.ts`, `pieces.ts`,
      `board.ts`, `battlefield.ts`, `jungle.ts`, `rankBadges.ts`, `spells.ts`, `gunfire.ts`,
      `ammunition.ts`, `tracer.ts`, `armoury.ts`, `alarm.ts`, `weapons.ts`, `strikes.ts`,
      `environment.ts`.
- [x] Move chess UI to `web/reference/ui/`: `GameShell.tsx` (replaced), `Hud.tsx`, `MainMenu.tsx`,
      `Heraldry.tsx`, `MoveLedger.tsx`, `Muster.tsx`, `medieval.css`, etc.
- [x] Replace `sceneEngine` with a new bare `ringEngine.ts`. Reference copies of `glide` / `lunge` /
      strikes remain under `web/reference/scene/` for later.
- [x] Fix every resulting TypeScript error. `tsc --noEmit` clean.
- [x] Kept: `gltfQueue.ts`, `quality.ts`, `postfx.ts`, `tween.ts`, `effects.ts`, `shatter.ts`,
      `diagnostics.ts`, `textures.ts`, `core/emitter.ts`, `audio/audioManager.ts` (decoupled from
      chess types), `components/ui/`, test config. Reworked `arena.ts` and `viewport.ts` for wrestling.

**Verify:** the project builds with zero TypeScript errors, the dev server starts, and you get an
empty lit 3D scene at a stable frame rate. Nothing chess remains in `src`.

**Passed.**

---

## Phase 2 — The ring

- [x] Build the ring as modular geometry in `scene/ring.ts`: canvas, apron, four posts, three ropes
      per side, turnbuckle pads, ring skirt, floor, barricades.
- [x] Add wrestling textures in `scene/ringTextures.ts`: canvas weave, rope, vinyl, steel, floor
      mat, crowd. Medieval generators in `textures.ts` left alone for later VFX reuse.
- [x] Arena lighting in `scene/venue.ts`: overhead truss, coloured spotlights with beams, warm key,
      cool fill, camera lamp. Three looks in `arena.ts`: Primetime / Spotlight / Small Hall.
- [x] Crowd as a textured cylinder (reads as a dark mass with catchlights). Entrance stage and LED
      panel deferred — not needed for the Phase 2 verify gate.
- [x] Match camera in `ringEngine.ts`: critically damped focus on two subjects, distance from
      separation, viewport framing solve.
- [x] Canvas fills the viewport; UI is overlay-only. `preserveDrawingBuffer: true` so screenshots
      and the future Playwright harness can read the surface.

**Verify:** the ring renders, looks like a wrestling arena, holds 60fps at 1080p, and the canvas
fills the window with no layout overflow.

**Passed** — ~68–72 fps on `high`, ~85–93 draws / 11k tris, Primetime and Spotlight both readable.
Review gate open before Phase 3.

---

## Phase 3 — Two bodies on screen

- [x] Port animation layer to `scene/wrestlers.ts`: `normalize()`, `SkeletonUtils.clone`,
      per-instance `AnimationMixer`, `installClip`, root-motion lock, contact shadows. (March /
      gait helpers wait for Phase 4 locomotion.)
- [x] `WRESTLER_SKINS` in `assets/generated.ts`: Ironclad + Vanguard with clips, morph, attributes.
- [x] Load both placeholders into the ring with combat-stance idle. Camera tracks them.
- [x] Clip URLs wired per wrestler: idle, walk, run (Vanguard), strike, knockdown, getUp.
- [x] Body morph layer: per-bone scaling from name heuristics + stature on overall height.
- [x] Contrasting morph profiles: powerhouse (Ironclad) vs cruiserweight (Vanguard).

**Verify:** two visibly different wrestlers stand in the ring, idle, with feet on the canvas and
contact shadows beneath them. Silhouette alone should tell them apart.

**Passed** — Ironclad vs Vanguard on canvas, ~71 fps ultra, 92k tris. Medieval placeholder skins
until Phase 6a.

---

## Phase 4 — Control and the capture harness

- [x] Input wired in `core/input.ts` per spec §2: move, run, strike, grapple, action, taunt,
      finisher, both reverses, retarget. Keyboard (P1 WASD / P2 arrows) + gamepads 0/1.
- [x] Locomotion in `core/control.ts` + `wrestlers.startMarch`: accel/decel, camera-relative
      facing, walk/run clips retimed through `core/gait.ts`.
- [x] Distance bands (clinch / close / mid / far) on the debug snapshot. Retarget button polled;
      multi-target focus waits for more than two fighters.
- [x] Capture harness on `window.__WRESTLING__`: `forceState`, `captureStill`, `waitReady`,
      `snapshot`. Browser tests in `src/test/capture.browser.test.tsx` (3/3 passing). Named states:
      idle, walk, run, strike, knockdown, getUp, corners, clinch.
- [x] Debug overlay: position state, band, facing, speed, pressed buttons for both fighters.

**Verify:** you can walk and run both wrestlers around the ring, and the harness can produce a
video clip of a named state on command. **Stop here and review before continuing.**

**Passed** — harness tests green; play at `localhost:8080` with WASD+Shift (P1) / Arrows+RCtrl (P2).
Review gate open before Phase 5.

---

## Phase 5 — The systems layer

Build against capsule-quality visuals. Do not polish anything in this phase.

- [ ] Position and condition state machine per spec §3, with groggy as a first-class state.
- [ ] The move-definition schema per spec §6 and the resolution table per spec §1.
- [ ] Strikes: four directional slots plus the three-hit combination string.
- [ ] The grapple matrix per spec §4: four base grapple states, four moves each, entered
      separately.
- [ ] Reversals per spec §7: L2 strikes, R2 grapples, both together for finishers, windows scaled
      by Technique, at least one level of counter-to-a-counter.
- [ ] Localised damage per spec §8, four regions, four levels, penalising both victim and attacker.
- [ ] Stamina and the finisher meter per spec §10, including situational requirements.
- [ ] Pins with damage-weighted kickouts and a readable guaranteed-pin tell.
- [ ] Submissions as a two-sided mash contest per spec §9.
- [ ] The five attributes actually modifying behaviour per spec §12.
- [ ] A `WinCondition` interface with pinfall, submission, count-out and KO.

**Verify:** you can complete a full match start to finish using placeholder animation. Reversals
land on timing rather than mashing. Damage changes how the match plays. This is the point where the
game must already be *fun*.

---

## Phase 6a — Acquire the real assets

Rork's text-to-3D pipeline is not available, so bodies and clips are sourced externally. Full
detail and licence terms in `ASSET_SOURCES.md`.

- [ ] Build two base bodies in MakeHuman at **neutral** proportions — the physique differentiation
      comes from the runtime morph layer, and Mixamo's auto-rigger fails on heavily deformed meshes.
- [ ] Design both as original characters on the reference game's archetypes, not recreations of its
      licensed performers. Original names, attire, palette and finishers.
- [ ] Rig both through the Mixamo auto-rigger. Download everything in one session and commit it
      locally; Mixamo is unmaintained and has gone down before.
- [ ] Pull the Quaternius Universal Animation Library 1 and 2 (CC0, glTF, Mixamo-compatible rig).
      Buy the source packs — the `.blend` rig is what makes Phase 6b authoring possible.
- [ ] Map the split combo hits and their separate recovery clips onto the three-hit strike string
      and the reversal recovery frames.
- [ ] Fill gaps from Mixamo: taunts, staggers, turnbuckle climbs. Convert FBX to GLB on import.
- [ ] Retire the inherited soldier meshes.
- [ ] Record every asset in `ATTRIBUTIONS.md` with source, licence and date.

**Verify:** two original wrestlers with distinct silhouettes stand in the ring, sharing one skeleton
and one animation set, and the whole game loads with no network requests to any third party.

---

## Phase 6b — Grapple contact (the hard part)

Budget most of the project's iteration here. No library anywhere provides synced two-body grapple
animation, free or paid — this is the irreducible cost of the project.

- [ ] Build the socket-parenting system: attach the victim's root to a socket on the attacker with
      `Object3D.attach()` so world transform is preserved, and detach on the release frame.
- [ ] Author one held-victim pose reused across every lift.
- [ ] Author the four base-grapple lock-up poses by hand, both skeletons, with breathing sway and
      weight shift. These are the most-viewed poses in the game.
- [ ] Build parametric move templates — lift-and-drop, suplex arc, spin-and-slam, sweep-to-mat,
      hold-and-wrench — each parameterised by grip point, carry orientation, rotation and drop
      angle.
- [ ] Build the post-mixer correction pass: run after the mixer updates each frame, handling
      hand-to-contact-point welding, foot planting and root reconciliation. Follow the
      `setStrikeTilt()` pattern already in the codebase.
- [ ] Add ragdoll blending on impact, then blend into the inherited `kneel-on-one-knee-and-stand`
      get-up clip.

**Verify:** capture a clip of each template and each lock-up. Hands stay on the opponent, feet do
not slide, bodies do not interpenetrate, and slams land with visible weight. **Stop and review.**

---

## Phase 7 — The ring as a system

- [ ] Irish Whip with direction, plus the three fake-whip variants per spec §15.
- [ ] Rope rebound and rope-leaning states, with visible rope deformation.
- [ ] Turnbuckle with all three opponent positions: facing, back exposed, slumped.
- [ ] Climbing and aerial moves from the top turnbuckle.
- [ ] Apron, ring exit and re-entry, and the count-out timer.
- [ ] Weapons parented to the hand bone, reusing `scene/weapons.ts`: chair and one more.
- [ ] Tables with intact, set-up and broken states, reusing `scene/shatter.ts`.
- [ ] The referee as an entity with sight lines that can be knocked down.

**Verify:** you can whip an opponent into a corner, climb, dive, brawl on the apron, hit someone
with a chair, and put someone through a table.

---

## Phase 8 — The opponent

- [ ] Implement the AI personality block per spec §13: two logic plans, movement style, whip
      frequency, referee attacks, weapon use, dive frequency, taunt frequency.
- [ ] Add match-context awareness: target the weakest region, recover when hurt, hunt for the
      finisher's required situation, take risks when losing.
- [ ] Add four difficulty levels.
- [ ] Make the AI miss reversals and make readable mistakes.

**Verify:** play ten matches. The AI should target your injured limb, should not fire finishers
blindly, and should be beatable but not trivially so.

---

## Phase 9 — Presentation

- [ ] Rebuild the HUD in `ui/Hud.tsx`: name plates, four-region damage diagrams, stamina, finisher
      pips, timer, crowd intensity, reversal and prompt indicators.
- [ ] Replace the audio cue set in `audio/audioManager.ts`: bell, crowd bed and swells, strikes,
      body and canvas impacts, rope movement, weapon hits, table breaks, breathing, grunts. Reuse
      the existing footstep synthesis model. Vary every sound.
- [ ] Camera language: impact-scaled shake, closer framing during grapples, cinematic finisher
      framing, subtle slow motion. Readability always wins over drama.
- [ ] Crowd reaction driven by a 0–100 intensity value responding to near-falls, reversals,
      finishers and table breaks.
- [ ] Impact frames on major moves: brief hold, flash, particles, heavy sound.
- [ ] Menus, wrestler select, results screen and instant rematch.
- [ ] Optional 4:3 letterbox toggle alongside the default widescreen.

**Verify:** the first ten seconds of a match communicate the quality bar, and you can restart
immediately after a finish.

---

## Phase 10 — Polish loops

- [ ] Run the builder/critic loop per subsystem, capped at about three rounds each, judged on
      captured motion against the reference clips.
- [ ] Spend the majority of remaining rounds on lock-up poses and move templates. Nothing else
      moves perceived quality as much.
- [ ] Run a full end-to-end pass with a fresh reviewer to smooth inconsistencies between
      separately-improved parts.
- [ ] Confirm 60fps at 1080p with no spikes during finishers, table breaks or camera transitions.
- [ ] Write the README: what it is, how to run it, controls, architecture, and an honest list of
      what is still weak.

**Verify:** hand it to someone who has never seen it. They should understand the controls within a
minute and finish a match without help.

---

## Running notes

Keep this section current as you go.

**Asset pipeline:** Rork text-to-3D is unavailable. Replaced by MakeHuman → Mixamo auto-rig for
bodies, Quaternius CC0 plus Mixamo for single-body clips, hand-authoring for grapples. See
`ASSET_SOURCES.md`.

**Art direction (decided):** the reference game's own proportions and tone, executed with modern
rendering. Not WWE All Stars exaggeration, not cel shading, not photorealism. Budget goes to
lighting, materials and shadows rather than polygon count.

**Roster (decided):** two original characters on the reference archetypes — super-heavyweight
powerhouse and technical cruiserweight. No real likenesses or names.

**Bodies (decided):** MakeHuman, CC0, no attribution. Meshy remains the fallback if MakeHuman
cannot shape something, at the cost of CC BY 4.0 attribution.

**Weakest subsystem right now:** _(update each wave)_

**Deferred deliberately:** tag and double-team slots, groggy rear grapple table, lower-turnbuckle
slumped moves, additional match types, season mode, create-a-wrestler, online.
