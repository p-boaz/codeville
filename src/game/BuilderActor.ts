import { Container, Graphics } from 'pixi.js';

import type { SessionPhase } from '../state/session-machine';
import { enqueueVisualPhase, phaseDwellMs } from '../state/visual-phase-queue';

const targets: Record<SessionPhase, { x: number; y: number }> = {
  idle: { x: -78, y: 40 }, starting: { x: -78, y: 40 }, planning: { x: -34, y: 20 },
  reading: { x: -6, y: 20 }, editing: { x: 61, y: 24 }, testing: { x: 88, y: 52 },
  approval: { x: 4, y: 61 }, completed: { x: 38, y: 57 }, failed: { x: -50, y: 54 }, interrupted: { x: -78, y: 40 },
};

export class BuilderActor {
  readonly container = new Container();
  private displayedPhase: SessionPhase = 'idle';
  private queuedPhases: SessionPhase[] = [];
  private phaseElapsedMs = Number.POSITIVE_INFINITY;
  private velocity = { x: 0, y: 0 };
  private elapsed = 0;

  constructor(color: number) {
    const shadow = new Graphics().ellipse(0, 18, 25, 9).fill({ color: 0x173c38, alpha: 0.18 });
    const body = new Graphics();
    body.roundRect(-8, -1, 16, 22, 6).fill(color);
    body.circle(0, -9, 8).fill(0xe8bb88);
    body.poly([-11, -11, 0, -21, 11, -11]).fill(0xe0a33d);
    body.rect(-10, -12, 20, 4).fill(0xc9842d);
    body.rect(-10, 17, 7, 9).fill(0x58382d);
    body.rect(3, 17, 7, 9).fill(0x58382d);
    this.container.addChild(shadow, body);
    const start = targets.idle;
    this.container.position.set(start.x, start.y);
  }

  update(phase: SessionPhase): void {
    this.queuedPhases = enqueueVisualPhase(this.displayedPhase, this.queuedPhases, phase);
    if (phase === 'approval' || phase === 'failed') this.advance();
    if (this.displayedPhase === 'idle' || this.displayedPhase === 'completed' || this.displayedPhase === 'interrupted') this.advance();
  }

  tick(deltaMs: number): void {
    this.elapsed += deltaMs;
    this.phaseElapsedMs += deltaMs;
    if (this.queuedPhases.length && this.phaseElapsedMs >= phaseDwellMs(this.displayedPhase)) this.advance();
    const target = targets[this.displayedPhase];
    const dt = Math.min(deltaMs / 1000, 0.033);
    const stiffness = 72;
    const damping = 2 * Math.sqrt(stiffness);
    this.velocity.x += (stiffness * (target.x - this.container.x) - damping * this.velocity.x) * dt;
    this.velocity.y += (stiffness * (target.y - this.container.y) - damping * this.velocity.y) * dt;
    this.container.x += this.velocity.x * dt;
    this.container.y += this.velocity.y * dt;
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    this.container.rotation = speed > 3 ? Math.sin(this.elapsed * 0.018) * 0.035 : 0;
    this.container.scale.y = 1 + (speed > 3 ? Math.sin(this.elapsed * 0.024) * 0.025 : 0);
  }

  get phase(): SessionPhase { return this.displayedPhase; }

  private advance(): void {
    const next = this.queuedPhases.shift();
    if (!next) return;
    this.displayedPhase = next;
    this.phaseElapsedMs = 0;
  }
}
