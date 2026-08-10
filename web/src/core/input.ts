/**
 * Keyboard + gamepad → per-fighter intents.
 *
 * Mirrors MECHANICS_SPEC.md §2 in spirit. Buttons that the systems layer does
 * not yet consume are still polled and exposed, so Phase 5 can wire them
 * without touching the binding table again.
 *
 * Keyboard (two players, one keyboard):
 *   P1  WASD move · Shift run · J strike · K grapple · L action
 *       I finisher · U reverse strike · O reverse grapple · Y retarget
 *       1–4 taunt directions
 *   P2  Arrows move · RCtrl run · Numpad 1 strike · 2 grapple · 3 action
 *       5 finisher · 4 reverse strike · 6 reverse grapple · 0 retarget
 *       7–9 / . taunt (mapped to four directions)
 *
 * Gamepad 0 → P1, gamepad 1 → P2. Standard mapping assumed.
 */

export type TauntDir = "up" | "down" | "left" | "right" | null;

export interface FighterIntent {
  /** Stick / D-pad, camera-relative once the controller projects it. -1…1. */
  moveX: number;
  moveY: number;
  run: boolean;
  strike: boolean;
  grapple: boolean;
  action: boolean;
  finisher: boolean;
  reverseStrike: boolean;
  reverseGrapple: boolean;
  retarget: boolean;
  taunt: TauntDir;
}

export function emptyIntent(): FighterIntent {
  return {
    moveX: 0,
    moveY: 0,
    run: false,
    strike: false,
    grapple: false,
    action: false,
    finisher: false,
    reverseStrike: false,
    reverseGrapple: false,
    retarget: false,
    taunt: null,
  };
}

const DEADZONE = 0.18;

function clampStick(x: number, y: number): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag < DEADZONE) return { x: 0, y: 0 };
  const scale = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE)) / mag;
  return { x: x * scale, y: y * scale };
}

export class InputManager {
  private keys = new Set<string>();
  private attached = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
    this.keys.add(event.code);
    // Keep arrows / combat keys from scrolling or stealing browser shortcuts.
    if (
      event.code.startsWith("Arrow") ||
      event.code === "Space" ||
      event.code.startsWith("Numpad") ||
      event.code === "End" ||
      event.code === "PageDown" ||
      event.code === "PageUp" ||
      event.code === "Home" ||
      event.code === "Insert" ||
      event.code === "Delete" ||
      event.code === "Clear"
    ) {
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
  };

  attach(): void {
    if (this.attached || typeof window === "undefined") return;
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached || typeof window === "undefined") return;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.keys.clear();
    this.attached = false;
  }

  /** Fresh intents for both fighters this frame. */
  sample(): [FighterIntent, FighterIntent] {
    const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() ?? [] : [];
    return [
      this.merge(this.fromKeyboard(0), this.fromGamepad(pads[0] ?? null)),
      this.merge(this.fromKeyboard(1), this.fromGamepad(pads[1] ?? null)),
    ];
  }

  private merge(a: FighterIntent, b: FighterIntent): FighterIntent {
    const stick = clampStick(a.moveX + b.moveX, a.moveY + b.moveY);
    return {
      moveX: stick.x,
      moveY: stick.y,
      run: a.run || b.run,
      strike: a.strike || b.strike,
      grapple: a.grapple || b.grapple,
      action: a.action || b.action,
      finisher: a.finisher || b.finisher,
      reverseStrike: a.reverseStrike || b.reverseStrike,
      reverseGrapple: a.reverseGrapple || b.reverseGrapple,
      retarget: a.retarget || b.retarget,
      taunt: a.taunt ?? b.taunt,
    };
  }

  private down(code: string): boolean {
    return this.keys.has(code);
  }

  private fromKeyboard(player: 0 | 1): FighterIntent {
    const intent = emptyIntent();
    if (player === 0) {
      let x = 0;
      let y = 0;
      if (this.down("KeyA")) x -= 1;
      if (this.down("KeyD")) x += 1;
      if (this.down("KeyW")) y -= 1;
      if (this.down("KeyS")) y += 1;
      const stick = clampStick(x, y);
      intent.moveX = stick.x;
      intent.moveY = stick.y;
      intent.run = this.down("ShiftLeft") || this.down("ShiftRight");
      intent.strike = this.down("KeyJ");
      intent.grapple = this.down("KeyK");
      intent.action = this.down("KeyL");
      intent.finisher = this.down("KeyI");
      intent.reverseStrike = this.down("KeyU");
      intent.reverseGrapple = this.down("KeyO");
      intent.retarget = this.down("KeyY");
      if (this.down("Digit1")) intent.taunt = "up";
      else if (this.down("Digit2")) intent.taunt = "down";
      else if (this.down("Digit3")) intent.taunt = "left";
      else if (this.down("Digit4")) intent.taunt = "right";
    } else {
      let x = 0;
      let y = 0;
      if (this.down("ArrowLeft")) x -= 1;
      if (this.down("ArrowRight")) x += 1;
      if (this.down("ArrowUp")) y -= 1;
      if (this.down("ArrowDown")) y += 1;
      const stick = clampStick(x, y);
      intent.moveX = stick.x;
      intent.moveY = stick.y;
      intent.run = this.down("ControlRight");
      // Prefer Numpad* (NumLock on). When NumLock is off, 1/3/5/0/./7/9 still
      // emit distinct codes; 2/4/6/8 collide with Arrow* and stay Numpad-only.
      intent.strike = this.down("Numpad1") || this.down("End");
      intent.grapple = this.down("Numpad2");
      intent.action = this.down("Numpad3") || this.down("PageDown");
      intent.finisher = this.down("Numpad5") || this.down("Clear");
      intent.reverseStrike = this.down("Numpad4");
      intent.reverseGrapple = this.down("Numpad6");
      intent.retarget = this.down("Numpad0") || this.down("Insert");
      if (this.down("Numpad8")) intent.taunt = "up";
      else if (this.down("Numpad7") || this.down("Home")) intent.taunt = "left";
      else if (this.down("Numpad9") || this.down("PageUp")) intent.taunt = "right";
      else if (this.down("NumpadDecimal") || this.down("Delete")) intent.taunt = "down";
    }
    return intent;
  }

  private fromGamepad(pad: Gamepad | null): FighterIntent {
    const intent = emptyIntent();
    if (!pad) return intent;

    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    const stick = clampStick(lx, ly);
    intent.moveX = stick.x;
    intent.moveY = stick.y;

    // Face buttons: 0 A/X strike, 1 B/Circle grapple, 2 X/Square action, 3 Y/Triangle run.
    intent.strike = !!pad.buttons[0]?.pressed;
    intent.grapple = !!pad.buttons[1]?.pressed;
    intent.action = !!pad.buttons[2]?.pressed;
    intent.run = !!pad.buttons[3]?.pressed || (pad.buttons[10]?.pressed ?? false);

    // Shoulders: 4 L1 finisher, 5 R1 retarget, 6 L2 reverse strike, 7 R2 reverse grapple.
    intent.finisher = !!pad.buttons[4]?.pressed;
    intent.retarget = !!pad.buttons[5]?.pressed;
    intent.reverseStrike = (pad.buttons[6]?.value ?? 0) > 0.4 || !!pad.buttons[6]?.pressed;
    intent.reverseGrapple = (pad.buttons[7]?.value ?? 0) > 0.4 || !!pad.buttons[7]?.pressed;

    const rx = pad.axes[2] ?? 0;
    const ry = pad.axes[3] ?? 0;
    if (Math.abs(rx) > 0.55 || Math.abs(ry) > 0.55) {
      if (Math.abs(ry) >= Math.abs(rx)) intent.taunt = ry < 0 ? "up" : "down";
      else intent.taunt = rx < 0 ? "left" : "right";
    }

    return intent;
  }
}
