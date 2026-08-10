# Arcade Wrestling Engine — Mechanics Specification

Reverse-engineered system design for a 2003-era console wrestling engine, extracted from the
Prima Official Strategy Guide (158pp, text layer intact), the GameFAQs community guide (`faqs`),
and the retail manual. This document describes **systems and rules only**.

## Scope and IP boundary

Use this document for architecture, state models, and physical wrestling vocabulary. Generic
wrestling terminology — Irish Whip, suplex, Boston Crab, powerbomb, turnbuckle, hurracanrana —
is the shared language of the sport and is safe to use.

Do not use: real wrestler names, likenesses, nicknames, entrance themes, promotion marks, arena
branding, or the character-ID roster from the source material. Every character, finisher name,
arena, and logo in the shipped game is original.

The reference material is a design document, not an asset library.

---

## 1. The core idea

The engine is not an animation player with logic bolted on. It is a **resolution table**.

Every frame, for every wrestler, the game holds a tuple:

```
(my position state, my condition, opponent position state, opponent condition,
 spatial relationship, held object) + input  ->  move
```

A button press is a lookup, never a trigger. This is the single most important architectural
decision in the whole project, and it is why a moveset can be authored as data rather than code.

Two consequences worth internalising early:

- Adding a wrestler means writing a data file, not touching the engine.
- The same button in two different states must produce two entirely different, hand-authored
  moves. If a state reuses another state's move because it was easier, the state is not done.

---

## 2. Input model

The source scheme, and the mapping this project should preserve in spirit:

| Source input | Function |
|---|---|
| D-pad / left stick | Move |
| Triangle | Run (also: climb, when run into a climbable) |
| X | Strike |
| Circle | Grapple / Irish Whip |
| Square | Action — pick up, drop, enter/exit ring, set up object, remove turnbuckle cover |
| Right stick | Taunt (4 directions, 4 distinct taunts) |
| L1 | Finisher |
| L2 | Reverse a strike |
| R1 | Change target focus |
| R2 | Reverse a grapple |
| L2 + R2 | Reverse a finisher |
| L1 + L2 | Steal opponent's finisher (requires 2 stored icons) |
| R3 | Call interference |

Directional modifiers matter. Strikes read 8 directions; grapples read 4. Every directional
variant is a distinct authored move, not a mirrored copy.

Provide keyboard and gamepad bindings. The scheme must be playable one-handed-adjacent on
keyboard without losing the direction+button simultaneity, since that simultaneity is the
entire input language.

---

## 3. State model

### Position states

Standing, running, groggy (stunned and vulnerable to setup-gated moves), down on mat,
getting up, leaning on turnbuckle facing outward, leaning on turnbuckle with back exposed,
slumped down in lower turnbuckle, leaning on ropes, rebounding off ropes, on apron,
on top turnbuckle, on ladder, on table, outside ring, climbing, held in a base grapple,
holding a base grapple, in submission state, pinning, being pinned, ragdoll/knocked out.

### Conditions layered on top of position

Facing / back exposed, groggy or not, holding a weapon, damaged per body region, legal or
illegal (tag matches), and the referee's line of sight.

**Groggy is a first-class state, not a flag.** A large fraction of the game's setup play exists
to move an opponent into groggy, because most finishers and the strongest grapples are gated
behind it. Groggy needs its own posture, its own idle sway, and its own readable silhouette.

### Spatial relationship

Distance band, relative facing, and for a downed opponent, whether the attacker stands **near
the head** or **near the feet** — these resolve to entirely different move tables.

---

## 4. The grapple matrix

The centrepiece. Grappling is two decisions, not one.

**Step one — enter a base grapple.** Circle plus a direction locks the two wrestlers into one of
four base grapple states, each with its own hold animation:

| Direction | Base grapple | Character |
|---|---|---|
| Up | Power | Slow, heavy, high damage |
| Down | Submission | Sets up limb damage and holds |
| Left | Signature | The wrestler's identity moves |
| Right | Quick | Fast, low commitment, low damage |

**Step two — select the move.** From inside a base grapple, Circle plus a direction executes one
of four moves belonging to *that* base grapple. Circle alone converts to an Irish Whip.

That yields 4 base states × 4 moves = 16 standing front grapple moves, plus the whip. Rear
grapples repeat the structure. The base grapple itself is an occupiable state with its own
duration and its own reversal window, which is what gives grappling its texture: the opponent
gets a read on which of the four families you chose before the move lands.

While locked in a base grapple, Triangle turns you behind the opponent.

---

## 5. Move slot schema

This is the content pipeline. Every character fills the same slots. Author these as the
canonical keys of a wrestler data file.

**Standing, facing opponent**
- Initiating grapples: Circle (whip) + 4 directions (the four base grapples)
- Submission grapple moves: Circle + 4 directions
- Signature grapple moves: Circle + 4 directions
- Power grapple moves: Circle + 4 directions
- Quick grapple moves: Circle + 4 directions
- Strikes: 6 slots covering 8 directions (cardinals distinct, diagonals paired)
- Combination string: 3 chained strikes on repeated X

**Standing, behind opponent**
- Rear grapples vs. normal opponent: Circle + 4 directions
- Rear grapples vs. groggy opponent: Circle + 4 directions (separate table)

**Opponent down**
- Ground grapples, standing near head: Circle (raise) + 4 directions
- Ground grapples, standing near feet: Circle (raise) + 4 directions
- Ground attacks: 3 slots
- Pin: Circle + down
- Drag: hold Circle + direction

**Turnbuckle**
- Grapples, opponent facing: Circle + 4 directions
- Grapples, opponent back exposed: Circle + 4 directions
- Grapples, opponent slumped in lower turnbuckle: raise + 1 move
- Attacks, opponent facing: 2 slots
- Attacks, opponent slumped: 1 slot

**Aerial, from top turnbuckle**
- Opponent standing: 2 slots
- Opponent down: 3 slots

**Ropes**
- Opponent leaning on ropes: whip
- Rebound off ropes at standing opponent
- Rebound off ropes at downed opponent
- Running at ropes with opponent outside: 2 variants (over and through)

**Running**
- Running grapples: at standing, at standing groggy, at back, at groggy back
- Running attacks: at standing (2), at downed (2)
- Running counters — moves that catch a *charging* opponent: 3 slots

**Tag**
- Double team, open floor: Circle + 4 directions
- Double team, at your corner: Circle + 4 directions

**Other**
- Enter ring / exit ring animations
- 4 taunts, one per right-stick direction
- Weapon specials: 2 slots
- Finishers: 2 slots, each with a **situational requirement** attached
- Bases: entrance, ring-in, ring-out, fighting stance, walk, run, victory

A complete wrestler is roughly 120 authored move slots. Build tooling so that a partially
filled wrestler is playable and clearly reports which slots are empty.

### MVP subset

Do not author all 120 slots for the first build. Author roughly 30–40 per wrestler, chosen so
that **every system in this document is exercised at least once**. The point of the subset is
coverage of mechanics, not coverage of content.

Must-have for the MVP, because each one proves a system nothing else proves:

- All 4 base grapples, with all 4 moves in each — this is the centrepiece and cannot be thinned
- Strikes: 4 of the 6 directional slots, plus the full 3-hit combination string
- Rear grapples: 4 moves against a normal opponent (the groggy rear table can wait)
- Ground: 2 moves near the head, 2 near the feet, 1 ground attack, pin, drag
- Turnbuckle: 2 moves facing, 2 moves back-exposed — proves position-dependent tables
- Aerial: 1 against a standing opponent, 1 against a downed one
- Ropes: whip, rebound at a standing opponent
- Running: 1 running attack, 1 running grapple, 1 running counter
- 2 taunts, 1 weapon special, both finishers with different situational requirements

Deferred without loss: the groggy rear table, lower-turnbuckle slumped moves, all tag and
double-team slots, edge-of-cell moves, enter/exit ring flourishes, the remaining strike
directions and aerial variants.

### The shared animation library

The most useful structural finding in the source material, and it should shape the whole
animation pipeline.

Read the move names in the period guide's character tables: `Clothesline 10`, `Elbow Drop 11`,
`Back Suplex 9`, `Sleeper Hold 8`, `Double Axe Handle 5`, `Grapple 11`. Then note that the same
named animations — `Austin Punches 1`, `Kane Uppercut` — appear in the movesets of completely
different characters.

Those numbers are a library index. The original developers did not author 120 unique animations
per wrestler. They built a **shared pool of numbered variants per move family**, then assembled
each character by selecting from that pool and adding a small number of genuinely unique
signature and finisher moves. The guide is, accidentally, a census of that pool: the highest
number in each family approximates how many variants existed.

Copy this architecture exactly. It is what makes the animation workload survivable:

- Build a **shared move-animation library** keyed by family and variant, not by character.
- A wrestler file becomes an **assembly manifest** — a mapping from slot to library entry.
- Each character gets only **3–5 genuinely unique animations**: their signature grapple moves
  and their two finishers. Everything else is selection from the pool.
- The library decomposes cleanly across parallel builders, and each animation can go through its
  own critic loop independently of any character.

For the MVP this means the target is one shared library of roughly 40–50 animations plus about
8 unique ones, not 80 hand-made animations across two wrestlers.

---

## 6. Move definition schema

Each move is a data record, not a function:

```
id, displayName, category, animation,
requiredPosition, requiredCondition, requiredRelationship,
damage, damageRegion, impactStrength,
reversalType, reversalWindow,
resultingSelfState, resultingOpponentState,
causesBleed, causesPin, causesSubmission,
weightClassLimit, staminaCost, meterGain
```

Notes on specific fields:

- `damageRegion` is one of head, torso, arms, legs — and it should reflect **body mechanics, not
  move category**. The source material makes this point explicitly: a Boston Crab damages the
  torso, because the spine is what's under pressure, not the legs. Get this right per move; it is
  the difference between a damage system that feels intelligent and one that feels arbitrary.
- `causesBleed` is a per-move boolean. Bleeding requires *both* the flag and a head damage level
  already at maximum.
- `weightClassLimit` gates lifts. A lighter wrestler cannot execute certain lifts on a much
  heavier one, and the attempt should fail readably rather than clip.
- `resultingOpponentState` is what enables setup play. Authors should be able to chain: a strike
  that leaves the opponent groggy with back exposed, into a rear grapple, into a finisher.

---

## 7. Reversals

Three reversal channels, each on its own button:

| Input | Reverses |
|---|---|
| L2 | Strikes |
| R2 | Grapples |
| L2 + R2 | Finishers |

Rules:

- Reversal windows open on the *startup* of the incoming move and close before the impact frame.
- Window width scales with the defender's Technique attribute — higher Technique means the button
  may be pressed earlier and still register.
- Both the base grapple lock-up and the grapple move that follows it are independently reversible.
- **Reversals nest.** A reversal that puts the opponent behind you in a wrist-lock can itself be
  reversed with L2. Support at least one level of counter-to-a-counter.
- Mashing must be strictly worse than timing. If mashing both triggers is a viable strategy, the
  windows are too wide.
- A successful reversal leaves the original attacker briefly groggy, which is the primary
  legitimate opening for a finisher.

---

## 8. Damage

Localised to four regions: **head, torso, arms, legs.** Four levels per region, displayed as a
body diagram beside each wrestler's name bar:

| Level | Colour | Meaning |
|---|---|---|
| 1 | Blue | Fresh |
| 2 | Yellow | Sore |
| 3 | Orange | Hurting — wrestler visibly clutches the region during idles |
| 4 | Red | Critical |

Damage cuts both ways, and the second direction is the one that makes the system feel alive:

- **Against the victim:** a worn region weakens their attacks that use it, lengthens stun,
  reduces resistance to submissions targeting it, and at red on the head enables bleeding.
- **Against the attacker:** executing a move that loads your *own* heavily damaged region makes
  you recoil in pain after the move completes. Attacking with a broken arm costs you.

Damage should be visible in posture and idle animation before the player thinks to check the HUD.

---

## 9. Submissions

A submission move opens a **submission state** with a dedicated meter above both status bars.
Both players mash; the attacker pushes the meter toward the tap-out, the defender pushes back
toward escape.

Governing inputs to the contest: the attacker's and defender's Submission attribute, the damage
level of the targeted region, and mash rate. The Submission attribute also caps how long the
hold can be maintained at all.

Rope breaks, when enabled, end the hold — which is why dragging a downed opponent to the centre
of the ring before applying a hold is real strategy and needs to be supported.

---

## 10. Finisher meter

Up to **five** icons stored. The meter fills from landing moves and, notably, from taunting —
taunting longer fills it more, which is what makes showboating a mechanic rather than a
decoration. Strikes fill it faster than grapples because they resolve faster.

Charge rate is a match rule (normal / fast / fastest).

Every finisher carries a **situational requirement**: facing a groggy opponent, opponent leaning
on a turnbuckle, standing near a downed opponent's head, holding a weapon, and so on. Getting
into that situation is the game. The HUD must clearly signal both "finisher available" and
"situation currently satisfied" as two separate readouts.

With two icons stored, a wrestler can steal and perform the opponent's finisher.

---

## 11. Pins

Pin success resolves from accumulated damage plus the defender's kick-out inputs. Near-falls are
the dramatic peak of a match and deserve the strongest presentation the game has.

One detail worth copying exactly: the source game **blurs the screen when a pin is guaranteed**.
It is an honest, readable tell that converts a random-feeling moment into a comprehensible one.
Find the original equivalent of that.

---

## 12. Attributes

Five, each 1–10. Overall rating is the sum scaled to 100.

| Attribute | Effect |
|---|---|
| Strength | Damage dealt |
| Submission | Hold duration, and mash effectiveness on both offence and defence |
| Endurance | Damage resisted |
| Technique | Reversal window width — how early a counter may be pressed |
| Speed | Walk, run, climb, **and recovery time from a knockdown** |

Speed is the sleeper stat because it governs getting back up. Weight class is a **separate
field**, not an attribute, and it gates lift legality between size brackets.

---

## 13. AI

Do not invent an AI design. The source game exposes its own as a per-wrestler personality block,
and it is a better starting point than anything freeform:

- **Logic 1** — primary game plan
- **Logic 2** — secondary game plan
- **Move** — clever vs. aggressive positioning
- **Irish Whip** — frequency
- **Attack the Referee** — yes / no
- **Weapon Use** — yes / no
- **Diving Moves** — frequency
- **Taunt** — frequency

Layer match-context awareness on top: target the opponent's weakest region, retreat and recover
when badly damaged, hunt for the finisher's required situation rather than firing blindly, take
risks when losing. The AI must make readable mistakes so that beating it feels earned.

Difficulty has four steps.

---

## 14. Match rules

Implement as a config object; all of these were user-toggleable:

Entrances on/off · KO on/off · Tap-outs on/off · Rope breaks on/off · DQ on/off · Ring-out count
on/off · Ring-out allowed · Interference manual/off · Match length 10/15/20/30/unlimited ·
Finisher charge speed normal/fast/fastest · Difficulty easy/normal/hard/hardest · Targeting
auto/manual · Broadcast camera angles on/off

---

## 15. Environment

The ring is a system, not scenery.

**Irish Whip** is the connective tissue of the whole environment layer. Circle whips; Circle plus
a direction aims it. Whip into ropes for a rebound, into a turnbuckle (near turnbuckle leaves the
back exposed, distant leaves them facing), over the top rope, or into any world object. Three
fake-whip variants exist and all three matter: Circle then Circle grapples instead, Circle then X
stuns the opponent, Circle then Square makes them charge at you.

**Turnbuckles** hold an opponent in one of three positions — facing, back exposed, slumped in the
lower corner — each with its own move table. Covers can be removed with Square to add damage.

**Objects** need mass, durability, impact strength, and break states. Tables go intact → set up →
broken, and can be leaned in a corner. Ladders can be set up, climbed, and knocked over with a
single button whether or not someone is on them. Weapons are picked up, swung, thrown, and
dropped. Weapon strikes and weapon grapples reverse on different buttons, which makes armed
exchanges a genuine guessing game.

**The referee** is an entity with sight lines. Illegal actions only count if he sees them, and he
can be knocked down — deliberately, with a running attack, and it should be hard.

---

## 16. Match types

Ship the singles match at a very high standard first. The architecture must let later types reuse
the same match engine, differing only in win condition, participant count, legality rules, and
arena furniture.

Win conditions observed across the source game's types: pinfall, submission, DQ, count-out,
escape a structure, retrieve a suspended object, put an opponent through a table, draw first
blood, knock out for a ten count, most falls within a time limit, last one standing after
eliminations.

Structure these as a `WinCondition` interface. That single abstraction covers nearly every match
type in the source game.

---

## 17. What the sources do not tell you

Be honest about the gaps. None of the reference material contains:

- **Frame data.** No startup, active, or recovery frames; no reversal window durations in frames.
  Every timing number must be derived by feel and tuned against reference footage.
- **Damage values.** Relative descriptions only.
- **Any animation or contact information.** This is the real gap. The guides describe exhaustively
  what every move *does* and nothing about how two bodies stay physically joined through a
  suplex.

That last point is where a browser build normally falls apart, and it should absorb the most
iteration: hands must stay welded to the opponent through a lift, feet must plant and not slide
during grapple entry, and the two skeletons must meet at the contact point without
interpenetration. A move that resolves correctly in the state machine but looks like two
mannequins passing through each other is not done.

Worth being precise about which half of the animation problem is solvable by other means.
**Single-body motion** — idles, walks, runs, strikes, staggers, knockdowns, get-ups — is widely
available as free mocap, and can also be generated from text prompts through the pipeline the
forked codebase already uses. Source it rather than invent it. **Two-body grapples** — lock-ups,
suplexes, powerbombs, pin transitions — effectively do not exist in any asset library, free or
paid, and no text-to-3D service will hand back two skeletons authored to move as one system. They
stay procedural and IK-driven: define the contact points, drive both rigs toward authored key
poses, correct root motion so the bodies meet. That is the irreducible hard problem of this
project.

**Where the correction lives.** An animation mixer owns the skeleton once it is running, so
contact correction must be applied *after* the mixer updates, every frame. The forked codebase
already uses this pattern for a procedurally held strike pose, which is proof it works. Treat the
post-mixer slot as the designated home for all IK: hand-to-shoulder welding, foot planting, and
root reconciliation between the two wrestlers.

---

## 18. Deliberate deviations from the source

Choices this project makes that the 2003 design did not:

- **Stamina** as a distinct resource governing running, heavy moves, and repeated reversals, with
  exhaustion visible in posture. The source game has no stamina system; damage and the finisher
  meter carry that load. Added because it deepens pacing — but it must not dilute the damage
  system's role.
- **The source's art direction, modern execution.** The 2003 game aimed at grounded realism and
  only looks dated because of PS2 hardware — low polygon counts, 256px textures, no real-time
  shadows, flat lighting. The intent was right; the technology was the limit. So the source *is*
  the art bar for proportion and tone, and the deviation is purely technological: the same
  grounded physiques rendered with modern lighting, PBR materials, contact shadows and subtle
  post-processing. Think of it as the game the 2003 team would have shipped on current hardware.

  This rules out three things. Not cartoon exaggeration — no WWE All Stars proportions, no
  oversized hands or tapered-to-nothing waists. Real wrestlers are already enormous, and accurate
  anatomy delivers the imposing silhouette without stylisation. Not cel shading — no toon ramps,
  colour banding or ink outlines; surfaces shade smoothly and continuously. And not photorealism —
  chasing skin shaders and pore detail is unreachable here and the attempt reads as plastic, which
  is precisely the trap the period screenshots fell into.
- **Original everything.** Characters, finishers, arenas, audio, identity. The MVP roster is two
  original wrestlers built on the source's archetypes rather than recreations of its licensed
  performers: one super-heavyweight powerhouse and one technical cruiserweight, chosen because the
  weight-class rules in §12 only become visible when the two bodies differ sharply.
- **Hybrid asset policy.** Character meshes, rigs, and single-body animation clips are sourced
  from free-for-commercial libraries or generated through a text-to-3D pipeline, then restyled.
  Everything else — ring, arena, HUD, effects, textures, audio, and all two-body grapple motion —
  is generated in code. An earlier version of this project required every asset to be
  code-generated; that rule produced featureless capsule-shaped wrestlers and was abandoned. It
  remains a good rule for the ring and a bad rule for anatomy.
- **Built on an existing codebase.** The project forks King's Gambit, the MIT-licensed 3D chess
  game in `wrestling-arena/` (formerly `rork-medieval-3d-chess/`), for its renderer, quality presets, post-processing,
  procedural textures, synthesised audio, skeletal animation layer and asset pipeline. See
  `PORTING_PLAN.md`. None of its game logic is reused — chess is turn-based on a discrete grid and
  shares no structure with a real-time wrestling match.
