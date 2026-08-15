/**
 * The shell: full-viewport canvas plus the match HUD.
 *
 * The HUD is deliberately ugly-but-honest at this phase. Phase 9 rebuilds it as
 * presentation; what it has to do *now* is make the systems layer legible so a
 * match can be judged: four-region damage per wrestler, stamina, the finisher
 * meter with its two separate readouts, the referee's count, and the submission
 * contest. If a system cannot be read here, it cannot be tuned.
 *
 * One inherited idea worth keeping: the source game blurs the screen when a pin
 * can no longer be broken. It converts a random-feeling moment into a
 * comprehensible one, so `pin.guaranteed` blurs the canvas here too.
 */

import { useEffect, useRef, useState } from "react";

import type { FighterDebug, MatchHud } from "@/core/control";
import type { DamageLevel, Region } from "@/match/types";
import { REGIONS } from "@/match/types";
import { ARENA_LOOKS, ARENA_ORDER, DEFAULT_ARENA, type ArenaTheme } from "@/scene/arena";
import { RingEngine, type EngineStats, type RosterLoadState } from "@/scene/ringEngine";

/** Blue → yellow → orange → red, spec §8. */
const LEVEL_COLOUR: Record<DamageLevel, string> = {
  1: "#4c8ce8",
  2: "#e8c94c",
  3: "#e8963c",
  4: "#e8483c",
};

const REGION_LABEL: Record<Region, string> = {
  head: "HEAD",
  torso: "BODY",
  arms: "ARMS",
  legs: "LEGS",
};

function Meter({
  label,
  value,
  max = 100,
  color,
  glow,
}: {
  label: string;
  value: number;
  max?: number;
  color: string;
  glow?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-0.5 flex justify-between text-[9px] uppercase tracking-wider text-white/45">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-black/50 ring-1 ring-white/10">
        <div
          className="h-full rounded-sm transition-[width] duration-150"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: glow ? `0 0 10px ${color}` : undefined,
          }}
        />
      </div>
    </div>
  );
}

/** The body diagram beside each name bar — four regions, four levels. */
function DamageDiagram({ fighter, side }: { fighter: FighterDebug; side: "left" | "right" }) {
  return (
    <div className={`mt-1.5 flex gap-1 ${side === "right" ? "flex-row-reverse" : ""}`}>
      {REGIONS.map((region) => {
        const level = fighter.damageLevels[region];
        return (
          <div key={region} className="flex-1" title={`${region}: level ${level}`}>
            <div
              className="h-1.5 rounded-sm transition-colors"
              style={{
                background: LEVEL_COLOUR[level],
                boxShadow: level >= 3 ? `0 0 7px ${LEVEL_COLOUR[level]}` : undefined,
              }}
            />
            <div className="mt-0.5 text-center font-mono text-[8px] tracking-wider text-white/40">
              {REGION_LABEL[region]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SmackPips({
  icons,
  charge,
  ready,
  situation,
}: {
  icons: number;
  charge: number;
  ready: boolean;
  situation: boolean;
}) {
  return (
    <div className="mt-1.5">
      <div className="mb-0.5 flex items-center justify-between text-[9px] uppercase tracking-wider text-white/45">
        <span>Smacks</span>
        {/* Two separate readouts on purpose (§10): stored, and legal to spend. */}
        <span className={ready ? "text-amber-300" : situation ? "text-sky-300/80" : "text-white/40"}>
          {ready
            ? "FINISHER — SITUATION SET"
            : situation
              ? "situation set · no smack"
              : icons > 0
                ? `${icons}/5 · need situation`
                : charge > 0.02
                  ? `${icons}/5 · ${Math.round(charge * 100)}%`
                  : `${icons}/5`}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, i) => {
          const filled = i < icons;
          const charging = i === icons && charge > 0.02 && icons < 5;
          return (
            <div
              key={i}
              className="relative h-3.5 w-3.5 overflow-hidden rounded-sm ring-1 ring-white/25"
              style={{
                background: filled ? "#f5c542" : "rgba(0,0,0,0.45)",
                boxShadow: filled ? "0 0 8px rgba(245,197,66,0.65)" : undefined,
              }}
              title={filled ? "Smack stored" : charging ? "Charging…" : "Empty"}
            >
              {charging && (
                <div
                  className="absolute inset-y-0 left-0 bg-amber-400/70"
                  style={{ width: `${Math.min(1, charge) * 100}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FighterPlate({ fighter, side }: { fighter: FighterDebug; side: "left" | "right" }) {
  return (
    <div
      className={`w-[min(42vw,20rem)] rounded-md bg-black/60 px-3 py-2 backdrop-blur-sm ring-1 ring-white/10 ${
        side === "right" ? "text-right" : "text-left"
      }`}
    >
      <div className={`flex items-baseline gap-2 ${side === "right" ? "flex-row-reverse" : ""}`}>
        <div className="text-sm font-semibold tracking-wide text-white">{fighter.label}</div>
        <div className="font-mono text-[10px] uppercase text-white/40">
          {fighter.position} · {fighter.band}
        </div>
        {fighter.bleeding && (
          <div className="font-mono text-[10px] uppercase text-red-400">bleeding</div>
        )}
      </div>
      <div className={`mt-2 flex gap-2 ${side === "right" ? "flex-row-reverse" : ""}`}>
        <Meter label="Condition" value={fighter.vitality} color="#e85d4c" glow={fighter.vitality < 30} />
        <Meter label="Stamina" value={fighter.stamina} color="#5ec8e8" />
      </div>
      <DamageDiagram fighter={fighter} side={side} />
      <SmackPips
        icons={fighter.icons}
        charge={fighter.iconCharge}
        ready={fighter.finisherReady}
        situation={fighter.situationSatisfied}
      />
      {fighter.lastAction && (
        <div className={`mt-1 font-mono text-[10px] text-amber-200/90 ${side === "right" ? "text-right" : ""}`}>
          {fighter.lastAction}
        </div>
      )}
    </div>
  );
}

/** Referee count and the near-fall drama. */
function PinBanner({ pin, names }: { pin: NonNullable<MatchHud["pin"]>; names: string[] }) {
  return (
    <div className="absolute left-1/2 top-1/3 -translate-x-1/2 rounded-md bg-black/70 px-6 py-3 text-center ring-1 ring-white/15">
      <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">
        {names[pin.attacker]} covers
      </div>
      <div className="mt-1 flex items-center justify-center gap-3">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="font-mono text-3xl font-bold transition-colors"
            style={{ color: pin.count >= n ? "#f5c542" : "rgba(255,255,255,0.16)" }}
          >
            {n}
          </div>
        ))}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-white/50">
        {pin.guaranteed ? "it's over" : "mash to kick out"}
      </div>
    </div>
  );
}

function SubmissionBanner({
  submission,
  names,
}: {
  submission: NonNullable<MatchHud["submission"]>;
  names: string[];
}) {
  const pct = Math.max(0, Math.min(100, submission.pressure * 100));
  return (
    <div className="absolute left-1/2 top-1/3 w-[min(80vw,26rem)] -translate-x-1/2 rounded-md bg-black/70 px-4 py-3 ring-1 ring-white/15">
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-white/55">
        <span>{names[submission.attacker]} — {submission.region}</span>
        <span>{names[submission.attacker ^ 1]} escaping</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-sm bg-black/60 ring-1 ring-white/15">
        <div
          className="h-full transition-[width] duration-75"
          style={{
            width: `${pct}%`,
            background: pct > 75 ? "#e8483c" : "#e8963c",
            boxShadow: pct > 75 ? "0 0 12px #e8483c" : undefined,
          }}
        />
      </div>
      <div className="mt-1 text-center text-[10px] uppercase tracking-widest text-white/45">
        both mash — attacker taps them out, defender pushes back
      </div>
    </div>
  );
}

function ResultBanner({ hud, names, onRematch }: { hud: MatchHud; names: string[]; onRematch: () => void }) {
  const result = hud.result;
  if (!result) return null;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-8 py-6 text-center ring-1 ring-white/20">
      <div className="text-[11px] uppercase tracking-[0.4em] text-white/45">
        {formatClock(result.atSeconds)}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-wide text-white">
        {result.winner === null ? "DRAW" : names[result.winner]}
      </div>
      <div className="mt-0.5 text-sm text-amber-300">{result.label}</div>
      <button
        type="button"
        onClick={onRematch}
        className="mt-4 rounded bg-white/90 px-5 py-1.5 text-sm font-semibold text-black transition hover:bg-white"
      >
        Rematch
      </button>
    </div>
  );
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RingEngine | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [theme, setTheme] = useState<ArenaTheme>(DEFAULT_ARENA);
  const [roster, setRoster] = useState<RosterLoadState>("loading");
  const [hud, setHud] = useState<MatchHud>({
    clock: 0,
    live: true,
    fighters: [],
    pin: null,
    submission: null,
    result: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new RingEngine({
      canvas,
      theme: DEFAULT_ARENA,
      onStats: setStats,
      onRoster: setRoster,
      onMatch: setHud,
    });
    engineRef.current = engine;

    const observer = new ResizeObserver(() => engine.resize());
    observer.observe(canvas);

    const onKey = (event: KeyboardEvent) => {
      if (event.code === "KeyQ") engine.orbitBy(0.06);
      if (event.code === "KeyE") engine.orbitBy(-0.06);
    };
    window.addEventListener("keydown", onKey);

    // Click the canvas so OS focus isn't stuck on a button/devtools.
    canvas.tabIndex = 0;
    canvas.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      observer.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const pickTheme = (next: ArenaTheme) => {
    setTheme(next);
    engineRef.current?.setTheme(next);
  };

  const rematch = () => {
    window.__WRESTLING__?.resetMatch();
    canvasRef.current?.focus();
  };

  const [p1, p2] = hud.fighters;
  const names = hud.fighters.map((f) => f.label);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05070b]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full outline-none transition-[filter] duration-200"
        style={{ filter: hud.pin?.guaranteed ? "blur(3px) saturate(1.3)" : undefined }}
        onMouseDown={(e) => (e.currentTarget as HTMLCanvasElement).focus()}
      />

      <div className="pointer-events-none absolute inset-0 select-none">
        {(p1 || p2) && (
          <div className="absolute left-0 right-0 top-3 flex items-start justify-between px-3">
            {p1 ? <FighterPlate fighter={p1} side="left" /> : <div />}
            <div className="mt-2 rounded bg-black/55 px-3 py-1 font-mono text-sm tracking-widest text-white/70">
              {formatClock(hud.clock)}
            </div>
            {p2 ? <FighterPlate fighter={p2} side="right" /> : <div />}
          </div>
        )}

        {hud.pin && !hud.result && <PinBanner pin={hud.pin} names={names} />}
        {hud.submission && !hud.result && <SubmissionBanner submission={hud.submission} names={names} />}
        <ResultBanner hud={hud} names={names} onRematch={rematch} />

        <div className="pointer-events-auto absolute bottom-16 left-4 flex flex-col gap-2">
          <div className="rounded-md bg-black/55 px-3 py-2 font-mono text-[10px] leading-relaxed text-white/75 backdrop-blur-sm">
            <div className="text-[9px] uppercase tracking-widest text-white/40">Diagnostics</div>
            <div>{stats ? `${stats.fps.toFixed(0)} fps · ${stats.preset}` : "measuring…"}</div>
            <div className="text-white/45">{roster === "ready" ? "live" : roster}</div>
          </div>

          <div className="flex flex-col gap-1 rounded-md bg-black/55 p-2 backdrop-blur-sm">
            {ARENA_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => pickTheme(id)}
                className={`rounded px-3 py-1.5 text-left text-xs transition ${
                  theme === id ? "bg-white/90 text-black" : "text-white/75 hover:bg-white/10"
                }`}
              >
                {ARENA_LOOKS[id].label}
              </button>
            ))}
          </div>
        </div>

        <div className="absolute bottom-3 left-1/2 max-w-[min(94vw,54rem)] -translate-x-1/2 rounded-md bg-black/50 px-4 py-2 text-center text-[11px] leading-snug text-white/55 backdrop-blur-sm">
          <div>
            P1 WASD · Shift run ·{" "}
            <span className="text-white/85">
              J strike · K grapple (+direction picks the base grapple) · L taunt · I finisher
            </span>{" "}
            · U reverse strike · O reverse grapple
          </div>
          <div className="mt-0.5 text-white/40">
            P2 Arrows · RCtrl · Numpad 1 strike / 2 grapple / 3 taunt / 5 finisher / 4 · 6 reverse ·
            hold a direction while grappling to pick the move · mash to kick out
          </div>
        </div>
      </div>
    </div>
  );
}
