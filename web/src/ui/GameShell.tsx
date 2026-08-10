/**
 * The shell: full-viewport canvas, match HUD (health / stamina / smacks), diagnostics.
 */

import { useEffect, useRef, useState } from "react";

import type { FighterDebug } from "@/core/control";
import { ARENA_LOOKS, ARENA_ORDER, DEFAULT_ARENA, type ArenaTheme } from "@/scene/arena";
import { RingEngine, type EngineStats, type RosterLoadState } from "@/scene/ringEngine";

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

function SmackPips({ smacks, charge, ready }: { smacks: number; charge: number; ready: boolean }) {
  return (
    <div className="mt-1.5">
      <div className="mb-0.5 flex items-center justify-between text-[9px] uppercase tracking-wider text-white/45">
        <span>Smacks</span>
        <span className={ready ? "text-amber-300" : "text-white/40"}>
          {ready
            ? "FINISHER READY · I"
            : charge > 0.02 && smacks < 5
              ? `${smacks}/5 · ${Math.round(charge * 100)}%`
              : `${smacks}/5`}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, i) => {
          const filled = i < smacks;
          const charging = i === smacks && charge > 0.02 && smacks < 5;
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
      </div>
      {fighter.pressed.length > 0 && (
        <div
          className={`mt-0.5 font-mono text-[9px] uppercase tracking-wide text-emerald-300/80 ${
            side === "right" ? "text-right" : ""
          }`}
        >
          {fighter.pressed.join(" · ")}
        </div>
      )}
      <div className={`mt-2 flex gap-2 ${side === "right" ? "flex-row-reverse" : ""}`}>
        <Meter label="Health" value={fighter.health} color="#e85d4c" glow={fighter.health < 30} />
        <Meter label="Stamina" value={fighter.stamina} color="#5ec8e8" />
      </div>
      <SmackPips smacks={fighter.smacks} charge={fighter.smackCharge} ready={fighter.finisherReady} />
      {fighter.lastAction && (
        <div className={`mt-1 font-mono text-[10px] text-amber-200/90 ${side === "right" ? "text-right" : ""}`}>
          {fighter.lastAction}
        </div>
      )}
    </div>
  );
}

export function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RingEngine | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [theme, setTheme] = useState<ArenaTheme>(DEFAULT_ARENA);
  const [roster, setRoster] = useState<RosterLoadState>("loading");
  const [fighters, setFighters] = useState<FighterDebug[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new RingEngine({
      canvas,
      theme: DEFAULT_ARENA,
      onStats: setStats,
      onRoster: setRoster,
      onDebug: setFighters,
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

  const p1 = fighters[0];
  const p2 = fighters[1];

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05070b]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full outline-none"
        onMouseDown={(e) => (e.currentTarget as HTMLCanvasElement).focus()}
      />

      <div className="pointer-events-none absolute inset-0 select-none">
        {/* Match HUD */}
        {(p1 || p2) && (
          <div className="absolute left-0 right-0 top-3 flex items-start justify-between px-3">
            {p1 ? <FighterPlate fighter={p1} side="left" /> : <div />}
            {p2 ? <FighterPlate fighter={p2} side="right" /> : <div />}
          </div>
        )}

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

        <div className="absolute bottom-3 left-1/2 max-w-[min(94vw,48rem)] -translate-x-1/2 rounded-md bg-black/50 px-4 py-2 text-center text-[11px] leading-snug text-white/55 backdrop-blur-sm">
          <div>
            P1: WASD · Shift run · <span className="text-white/85">J strike · K grapple · L taunt/meter · I finisher</span>
          </div>
          <div className="mt-0.5 text-white/40">
            P2: Arrows · RCtrl · Numpad 1/2/3/5 · Fill smacks with L / hits, spend with I when pips glow
          </div>
        </div>
      </div>
    </div>
  );
}
