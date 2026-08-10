# Asset Sources

Where every asset comes from, now that the Rork text-to-3D pipeline is not available.

The short version: the ring, textures, audio and effects stay procedural as planned. Character
bodies come from a free generator or MakeHuman, get rigged by Mixamo's auto-rigger, and are
animated from two free mocap libraries. Two-body grapples are hand-authored, because nobody
gives those away.

---

## 1. What the chess fork already provides

Verified on disk: 129 GLB files, 39.5 MB, in
`wrestling-arena/downloaded-assets/rork-medieval-3d-chess/models/`.

**Action required first.** `web/src/assets/generated.ts` sets
`MODEL_BASE = "https://r2-pub.rork.com/..."`, so the game streams from Rork's CDN rather than the
local mirror. Repoint every URL to the local files and serve them from `web/public/`. Until this is
done the project has a live dependency on a service you do not control.

**46 mesh models.** Medieval, Aztec and Napoleonic soldiers. Not usable as wrestlers. Keep two as
throwaway placeholders so Phases 1–5 have something with a skeleton to drive, then delete them.

**25 distinct animation clips.** Roughly ten transfer straight across:

| Clip | Wrestling use |
| --- | --- |
| `idle` | Neutral idle |
| `combat-stance` | Fighting stance |
| `casual-walk-inplace` | Walk |
| `confident-strut-inplace` | Taunt walk, entrance |
| `standard-forward-charge-inplace` | Run |
| `knock-down` | Taking a slam |
| `dying-backwards` | Falling backwards |
| `dead` | Lying on the mat |
| `kneel-on-one-knee-and-stand` | Get-up |
| `step-forward-and-push` | Grapple shove, lock-up entry |
| `heavy-hammer-swing`, `thrust-slash`, `charged-slash` | Raw material for clotheslines and strikes, weapon deleted |

The remaining fifteen are archery, firearms and spellcasting. Ignore them.

This covers idle, locomotion, knockdown and get-up — real value, and it means Phases 1–5 need no
external sourcing at all.

---

## 2. Character bodies

Two viable routes. Try MakeHuman first; it suits this project unusually well.

### MakeHuman — chosen

Free, open source, desktop. Its output is CC0 with no attribution requirement.

It exists to produce anatomically accurate humanoid bodies from proportion sliders, which is
exactly what `MECHANICS_SPEC.md` asks the body morph layer to do, and it suits the chosen art
direction: the reference game's grounded proportions rather than cartoon exaggeration. Build the
super-heavyweight powerhouse and the technical cruiserweight as two presets of the same base mesh,
guaranteeing they share a skeleton and can therefore share every animation. Cross-check the slider
ranges against the body-morph values recorded in `faqs`.

Aim for accurate physique variety, not stylisation. Real wrestlers span roughly 200 to 500 lb, and
that range alone produces silhouettes you can tell apart at a glance — no exaggeration needed.

Export as FBX or OBJ, then rig it (below).

### Meshy — fallback, for anything MakeHuman can't shape

Browser-based text-to-3D and image-to-3D with built-in auto-rigging. Free tier gives 100 credits a
month, no card required, exports GLB with the skeleton intact.

This is the closest replacement for what Rork was doing, and it's the fastest path from a prompt to
a rigged body in the ring.

**Licence caveat that matters:** on the free plan, generated models are CC BY 4.0 — commercial use
allowed, but attribution required. Paid plans grant a private licence with no attribution. If the
project stays personal or credits are acceptable, the free tier is fine. Record every generated
model in `ATTRIBUTIONS.md` either way.

### Rigging

**Mixamo auto-rigger.** Free with an Adobe account. Upload a humanoid mesh in T-pose, place a few
joint markers, get a production-ready skeleton in under a minute. Requirements worth respecting:
humanoid with distinguishable head, body, arms and legs; centred at world origin; clean mesh. It
warns that heavily deformed proportions can defeat the auto-rigger — so rig at *neutral*
proportions and apply the wrestler exaggeration through the runtime morph layer, not the source
mesh. That ordering matters.

Fallbacks if Mixamo misbehaves: Meshy's auto-rigger, or Reallusion's AccuRIG (free, Windows).

**A caution on Mixamo generally.** It is still free and still royalty-free for commercial use as of
2026, but Adobe stopped developing it years ago and it had a multi-day outage in June 2025. Treat
it as a useful legacy tool, not a dependable pipeline. Download everything you need in one session
and commit it locally rather than fetching on demand.

---

## 3. Single-body animation

### Quaternius Universal Animation Library 1 and 2 — recommended

**CC0.** No attribution, no restrictions, commercial use fine. Built on a universal humanoid rig
that is explicitly Mixamo-compatible, so clips retarget onto a Mixamo-rigged character. Available
in glTF, which drops straight into the existing `gltfQueue.ts` loader with no conversion step.

Between the two libraries: 8-directional locomotion, jog, sprint, push, crawling, death
animations, melee combat with 3- and 4-hit combos split into separate hits and recoveries, and
parkour. The split combo hits are directly useful for the three-hit strike string in spec §5, and
the separate recovery clips map onto the recovery frames the reversal system needs.

Both ship in a free "Standard" subset; the complete packs with `.blend` sources are a small
optional payment and remain CC0. Buy the source packs — having the `.blend` rig is what lets you
author the grapple animations in section 4 on a skeleton that already matches.

### Mixamo animation library

2,000+ motion-capture clips, free, royalty-free. Use it for anything Quaternius lacks: taunts,
staggers, specific strike flavours, turnbuckle climbs.

You may ship these inside the finished game. You may **not** redistribute the raw animation or
character files as an asset pack — so don't commit them to a public repo as loose files.

Exports as FBX or DAE, not GLB. Convert with Blender or a CLI converter as part of an import step.

---

## 4. Two-body grapple animation

**No source exists. This is unchanged by the loss of Rork and was never going to be solved by it.**

Mixamo, Quaternius and every text-to-3D tool produce single-body motion only. Synced two-skeleton
wrestling grapples are not available free, and generating them from a text prompt is not something
current tools do.

The approach in `MECHANICS_SPEC.md` and Phase 6 of `BUILD_STEPS.md` stands:

- Socket-parent the victim to the attacker so one animation drives both bodies.
- Hand-author the four base lock-up poses in Blender on the Quaternius rig.
- Build parametric templates — lift-and-drop, suplex arc, spin-and-slam, sweep-to-mat,
  hold-and-wrench — and vary them by parameter rather than authoring each move separately.
- Run a post-mixer IK pass to weld hands to contact points and plant feet.
- Blend to ragdoll on impact, then into the get-up clip.

Budget the majority of project time here. It is the irreducible cost and the thing that will
decide whether the game looks convincing.

---

## 5. Everything else stays procedural

No sourcing needed, as already planned:

- **Ring, arena, crowd, staging** — generated geometry, Phase 2.
- **Textures** — canvas weave, rope, vinyl, brushed steel, floor mat, generated on canvas via the
  existing `scene/textures.ts`. If photographic PBR is wanted later, ambientCG and Poly Haven are
  CC0.
- **Audio** — Web Audio synthesis through the existing `audio/audioManager.ts`, which already
  synthesises footsteps and impacts.
- **Effects** — sweat, dust, impact flashes and debris via `effects.ts` and `shatter.ts`.

---

## 6. Licence ledger

Maintain `ATTRIBUTIONS.md` from day one. Entry per asset: source, URL, licence, date retrieved.

| Source | Licence | Attribution | Redistribute raw files |
| --- | --- | --- | --- |
| King's Gambit chess fork | MIT | Yes | Yes |
| MakeHuman output | CC0 | No | Yes |
| Meshy, free tier | CC BY 4.0 | Yes | Per Meshy terms |
| Mixamo characters and animations | Royalty-free | No | **No** |
| Quaternius libraries | CC0 | No | Yes |
| ambientCG, Poly Haven | CC0 | No | Yes |

Wrestlers, moves, arena branding and audio must be original. No real likenesses, names or
promotion trademarks.
