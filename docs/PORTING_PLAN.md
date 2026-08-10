# Porting Plan — King's Gambit → Wrestling Game

The `wrestling-arena` folder (renamed from `rork-medieval-3d-chess`) started as **King's Gambit**,
a Vite + React + Three.js 3D chess game. It is **MIT licensed**, so it can be forked freely
provided the copyright notice is kept.

This document is the audit: what to keep, what to rework, what to delete, and the one technique in
it that matters more than all the rest.

## The honest accounting

The game logic is worth nothing to us. Chess is turn-based on a discrete 8×8 grid with one actor
moving at a time. Wrestling is real-time and continuous, both actors act simultaneously, and
everything hinges on frame-accurate input windows and two bodies touching. Nothing in the rules
layer survives that gap.

The **engine infrastructure** is worth a great deal, and so is the **asset pipeline**. Call it 30–35%
of the total build — and it is the tedious third, not the hard third. Two-body grapple contact,
the thing that decides whether this game is good, gets no help from it. The chess pieces never
touch each other.

Stack already matches what we want: Vite 8, React 19, TypeScript, Three.js 0.185, Tailwind,
shadcn/ui, and Vitest + Playwright browser tests already configured.

---

## The technique to steal first

In `scene/pieces.ts`, when a strike animation is unavailable, the engine performs the swing by
hand — wind-up, twist, lean back, blow over the top — and holds the pose through
`PieceView.setStrikeTilt()`, **re-applied after the mixer has run**, because the mixer otherwise
owns the pose.

That is exactly the hook two-body grapple contact needs. The pattern is: let the skeletal clip
drive the body, then override specific bones afterwards each frame to force contact. Our IK
correction — hands welded to the opponent's shoulders, feet planted, root motion reconciled so
two skeletons meet — lives in that same post-mixer slot.

The codebase already proves the pattern works. That is worth more than any single module in it.

---

## Keep as-is

Near-zero changes needed.

| File | What it gives us |
|---|---|
| `scene/gltfQueue.ts` | Throttled GLB loader, 4 parallel max, exponential back-off with jitter |
| `scene/quality.ts` | Four real graphics presets, GPU/core/memory detection, adaptive downgrade |
| `scene/postfx.ts` | Composer with bloom, SSAO, DOF, SMAA, grade, output pass |
| `scene/tween.ts` | Promise-based tween engine, no GSAP dependency |
| `scene/effects.ts` | Particle burst system driven by procedural sprites |
| `scene/shatter.ts` | Geometry-based breakage rather than billboards — **this is our tables** |
| `scene/viewport.ts` | Aspect-aware FOV fitting so shots framed for desktop survive other windows |
| `scene/diagnostics.ts` | Frame timing and debug readouts |
| `core/emitter.ts` | Small typed event emitter |
| `components/ui/*` | Full shadcn set |
| `lib/`, `hooks/` | Utilities |
| Vitest + Playwright config | Foundation for the capture harness |

`quality.ts` is worth calling out. It has real per-preset cost differences, not cosmetic labels,
plus a hard-won lesson baked in: `navigator.deviceMemory` is Chromium-only, so treating unknown
as small sent every iPhone to the lowest preset. Do not re-break that.

---

## Keep with rework

**`scene/pieces.ts` — the crown jewel.** Rename to `wrestlers.ts`. Everything here transfers:

- `normalize()` measures an arbitrary model, rescales it to a target height, centres X/Z, grounds Y
- `SkeletonUtils.clone` per instance, never `Object3D.clone`, each with its own `AnimationMixer`
- One-shots via `LoopOnce` + `clampWhenFinished`, crossfading back to stance on `finished`
- Root motion stripped on X/Z but **kept for the death clip** — precisely the split a wrestling
  game needs between in-place locomotion and moves that must travel
- `gaitCycle()` autocorrelates a leg bone's swing to **measure** a walk cycle rather than assume
  the clip is one cycle. Directly reusable for wrestler locomotion.
- `ensureClip` blocks a beat until its animation lands, with a timeout, instead of playing the
  move without animation. Our grapples need exactly this guard.
- `installClip` / `bindClip` share a download by URL across every roster that wanted it
- The fallback chain: rigged GLB → static sculpt → procedural primitive, so the game is
  **always playable** even when assets fail

**`assets/generated.ts`** — `ARMY_SKINS` becomes `WRESTLER_SKINS`. The shape is already right: a
record of labelled entries each holding rank names, prop family, model URLs, clip URLs and voices.
That is our wrestler manifest, and it lines up with the assembly-manifest architecture in
`MECHANICS_SPEC.md` §5.

**`scene/weapons.ts`** — props parented to a hand bone, authored at "figure height = 1" and cached.
Becomes chairs, kendo sticks, and title belts. The header notes the generated figures are unarmed
by design because held props break auto-rigging; that constraint applies to us identically.

**`scene/textures.ts`** — keep the procedural canvas-painting generators, swap marble and flagstone
for canvas weave, rope, turnbuckle vinyl and brushed steel.

**`audio/audioManager.ts`** — keep the synthesis architecture and especially the footstep model
(low body thump, band-passed noise transient for the sole, metallic afterring, one voice per
timbre). Replace medieval cues with bell, crowd, canvas impacts, and body slams.

**`scene/strikes.ts`** — the visual language of a heavy blow, already data-driven by attacker
weight. Maps straight onto our `impactStrength` field.

**`scene/environment.ts`** — keep the lighting rig structure, replace torches with arena spotlights
and an entrance-stage LED wall.

**`ui/Hud.tsx`, `SettingsPanel.tsx`, `MainMenu.tsx`, `GameOverModal.tsx`** — restyle from medieval
to arcade sports. The HUD needs new content (damage regions, stamina, finisher pips) but the
scaffolding stays.

**`scene/sceneEngine.ts`** — 215 KB. Do not port it wholesale. Mine it for `glide()` (the stride
clock that ties footfalls to cadence), `lunge()` (procedural strike fallback), the `STRIKES` weight
table, and the camera work. Then leave the rest.

---

## Delete

Chess rules: `core/gameController.ts`, `core/types.ts`, `core/premove.test.ts`, `ai/aiClient.ts`,
`ai/engine.worker.ts`, and the `chess.js` dependency.

Board and setting: `scene/board.ts`, `scene/battlefield.ts`, `scene/jungle.ts`, `scene/arena.ts`,
`scene/rankBadges.ts`.

Medieval and Napoleonic specifics: `scene/spells.ts`, `scene/gunfire.ts`, `scene/ammunition.ts`,
`scene/tracer.ts`, `scene/armoury.ts`, `scene/alarm.ts`.

UI: `ui/Heraldry.tsx`, `ui/MoveLedger.tsx`, `ui/Muster.tsx`, `ui/medieval.css`.

One idea worth rescuing from `arena.ts` before deleting it: a theme there is a **complete relight**
— sky, fog, tints, fire strength, contrast and colour grade all move together — rather than a
brightness slider. Our arena presets should work the same way.

---

## The asset pipeline — the biggest win

`downloaded-assets/` holds **129 GLB models (18 rigged humanoid characters) and 30 MP3s**, about
45 MB, with a `manifest.json` listing every source URL.

The models were generated by a text-to-3D service (Meshy, served from Rork's R2 bucket), and
critically, **so were the animations**. The clip names are prompts:

```
anim-idle                    anim-combat-stance         anim-knock-down
anim-casual-walk-inplace     anim-dying-backwards       anim-thrust-slash
anim-heavy-hammer-swing      anim-charged-slash         anim-step-forward-and-push
anim-standard-forward-charge-inplace                    anim-confident-strut-inplace
```

Two consequences.

**It solves where characters come from.** Rigged humanoids already exist here, already load, and
already animate. `normalize()` means proportions and scale get corrected on import, so the body
morph layer from the prompt sits neatly on top.

**It suggests where wrestling animation comes from.** If the pipeline produced
`anim-step-forward-and-push` from a prompt, it can plausibly produce `anim-clothesline` and
`anim-body-slam`. Test this early — generate three wrestling clips and judge them before betting
the schedule on it.

**But note the hard limit.** Every clip in that manifest is **single-body**. A suplex is two bodies
moving as one system. Generating the attacker's motion and the victim's motion separately gives
two clips that were never authored to match, and reconciling them is still the procedural IK
problem. The pipeline helps enormously with locomotion, strikes, reactions and falls. It does not
solve grapples.

For shipping, the README recommends compressing rather than streaming from a remote host:

```bash
bunx @gltf-transform/cli optimize in.glb public/models/out.glb \
  --compress draco --texture-compress webp --texture-size 1024
```

---

## Order of work

1. Fork, keep `LICENSE` and add attribution, strip everything in the delete list, confirm it still
   builds and renders an empty scene.
2. Stand up the ring using the surviving environment and texture modules.
3. Port `pieces.ts` to `wrestlers.ts` with two placeholder characters from the existing rigged set.
4. Build the state machine and resolution table from `MECHANICS_SPEC.md` against those placeholders.
5. Test whether the text-to-3D pipeline can produce usable wrestling clips.
6. Build the post-mixer IK correction layer for grapple contact.
7. Restyle HUD, audio and lighting.

Steps 4 and 6 are the project. Everything else is assembly.
