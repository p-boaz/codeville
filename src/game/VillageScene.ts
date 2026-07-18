import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import type { CompletionDebrief, VillageLot } from '../shared/village-events';
import type { SessionPhase } from '../state/session-machine';
import { BuilderActor } from './BuilderActor';

export interface ProjectSnapshot {
  slot: VillageLot['slot'];
  projectId: string | null;
  projectName: string;
  phase: SessionPhase;
  level: number;
  debrief: CompletionDebrief | null;
  selected: boolean;
}

const palette = {
  grass: 0x74a85b, grassLight: 0x91bd69, grassDeep: 0x5e8c4a, soil: 0x654b39,
  path: 0xc9aa72, stone: 0xb99f74, wall: 0xe8d09e, shade: 0xc49a62,
  roof: 0xa95143, roofLight: 0xd36b55, timber: 0x58382d, window: 0xffd875,
  cream: 0xfff4d9, ink: 0x203b37, water: 0x1e5650, waterDeep: 0x16423d,
  willow: 0x86b06b, willowDeep: 0x5d8a4e, gold: 0xe8b85b,
};
const positions = [{ x: -290, y: -105 }, { x: 0, y: -148 }, { x: 290, y: -105 }, { x: -155, y: 145 }, { x: 155, y: 145 }];
const actorColors = [0x4d7f75, 0x5c7196, 0x8b6653, 0x6f8050, 0x856383];

const needsYouPhases = new Set<SessionPhase>(['approval', 'input', 'waiting']);
const litPhases = new Set<SessionPhase>(['planning', 'reading', 'editing', 'testing', 'reviewing', 'completed']);

const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Deterministic pseudo-random scatter so the ward looks identical every launch. */
function scatter(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

interface ChipStyle { bg: number; fg: number }
const chipStyles: Record<SessionPhase, ChipStyle> = {
  idle: { bg: 0x2c524a, fg: 0xd9e7d6 }, interrupted: { bg: 0x2c524a, fg: 0xd9e7d6 },
  starting: { bg: 0xe8b85b, fg: 0x203b37 }, planning: { bg: 0xe8b85b, fg: 0x203b37 },
  reading: { bg: 0xe8b85b, fg: 0x203b37 }, editing: { bg: 0xe8b85b, fg: 0x203b37 },
  testing: { bg: 0xe8b85b, fg: 0x203b37 }, reviewing: { bg: 0xffd879, fg: 0x203b37 },
  completed: { bg: 0x8cd792, fg: 0x1c3a2a }, approval: { bg: 0xe08a70, fg: 0x2a1713 },
  input: { bg: 0xe08a70, fg: 0x2a1713 }, waiting: { bg: 0xe08a70, fg: 0x2a1713 },
  needs_review: { bg: 0xb35f4c, fg: 0xfff4d9 }, failed: { bg: 0xb35f4c, fg: 0xfff4d9 },
  external: { bg: 0x8fa8dc, fg: 0x1c2536 },
};

export class VillageScene {
  readonly root = new Container();
  private readonly world = new Container();
  private readonly lots = positions.map((position, index) => new ProjectLot(index as VillageLot['slot'], position.x, position.y, actorColors[index]));
  private readonly signpost = new Container();
  private readonly signpostText: Text;
  private readonly willows: { sway: Container; seed: number }[] = [];
  private readonly clouds: { shadow: Container; speed: number; offset: number }[] = [];
  private readonly shimmers: Graphics[] = [];
  private readonly motes: { dot: Graphics; baseX: number; baseY: number; seed: number }[] = [];
  private elapsed = 0;
  private width = 1;
  private height = 1;

  constructor(onSelectLot?: (slot: VillageLot['slot']) => void) {
    if (onSelectLot) {
      for (const lot of this.lots) {
        lot.container.eventMode = 'static';
        lot.container.cursor = 'pointer';
        lot.container.on('pointertap', () => onSelectLot(lot.slot));
      }
    }
    this.world.addChild(this.buildDuskGlow(), this.buildGround());
    for (const shimmer of this.buildShimmers()) { this.shimmers.push(shimmer); this.world.addChild(shimmer); }
    for (const cloud of this.buildCloudShadows()) { this.clouds.push(cloud); this.world.addChild(cloud.shadow); }
    // Willows behind the top lot row, in front of nothing important.
    for (const spot of [{ x: -486, y: -52, s: 1 }, { x: 486, y: -46, s: 0.92 }, { x: -252, y: -178, s: 0.62 }, { x: 254, y: -172, s: 0.58 }]) {
      const willow = buildWillow(spot.s);
      willow.tree.position.set(spot.x, spot.y);
      this.willows.push({ sway: willow.sway, seed: spot.x });
      this.world.addChild(willow.tree);
    }
    for (const lot of this.lots) this.world.addChild(lot.container);
    // Foreground willows overlap the bottom edge for storybook depth.
    for (const spot of [{ x: -392, y: 226, s: 0.82 }, { x: 396, y: 220, s: 0.76 }]) {
      const willow = buildWillow(spot.s);
      willow.tree.position.set(spot.x, spot.y);
      this.willows.push({ sway: willow.sway, seed: spot.x });
      this.world.addChild(willow.tree);
    }
    const signBoard = new Graphics();
    signBoard.roundRect(-96, -17, 192, 34, 9).fill({ color: palette.ink, alpha: 0.86 }).stroke({ color: 0xe4bd68, width: 1.5 });
    signBoard.rect(-3, 17, 6, 20).fill(palette.timber);
    this.signpostText = new Text({ text: '', style: textStyle(12, 0xffd875, '700') });
    this.signpostText.anchor.set(0.5);
    this.signpost.addChild(signBoard, this.signpostText);
    this.signpost.position.set(0, 292);
    this.signpost.visible = false;
    this.world.addChild(this.signpost);
    for (const mote of this.buildMotes()) { this.motes.push(mote); this.world.addChild(mote.dot); }
    this.root.addChild(this.world);
  }

  private buildDuskGlow(): Graphics {
    const glow = new Graphics();
    glow.ellipse(0, -300, 760, 330).fill({ color: 0xf2c464, alpha: 0.03 });
    glow.ellipse(0, -320, 520, 230).fill({ color: 0xf2c464, alpha: 0.04 });
    glow.ellipse(0, -340, 300, 140).fill({ color: 0xffd879, alpha: 0.045 });
    return glow;
  }

  private buildGround(): Graphics {
    const ground = new Graphics();
    ground.ellipse(0, 45, 540, 362).fill({ color: palette.waterDeep, alpha: 0.55 });
    ground.ellipse(0, 45, 524, 350).fill({ color: palette.water, alpha: 0.5 });
    ground.poly([-520, -50, 0, -310, 520, -50, 0, 330]).fill(palette.soil);
    ground.poly([-520, -68, 0, -328, 520, -68, 0, 310]).fill(palette.grass);
    // Sunlit meadow patches keep the green from reading flat.
    ground.ellipse(-190, -30, 130, 52).fill({ color: palette.grassLight, alpha: 0.3 });
    ground.ellipse(210, 40, 150, 60).fill({ color: palette.grassLight, alpha: 0.26 });
    ground.ellipse(-40, 190, 120, 46).fill({ color: palette.grassDeep, alpha: 0.24 });
    ground.poly([-45, -275, 40, -275, 46, 275, -42, 275]).fill({ color: palette.path, alpha: 0.62 });
    ground.poly([-440, -75, 440, -75, 430, 5, -430, 5]).fill({ color: palette.path, alpha: 0.55 });
    // Stone flecks along both lanes.
    for (let index = 0; index < 26; index += 1) {
      const along = scatter(index * 3 + 1);
      const drift = scatter(index * 7 + 2) - 0.5;
      const size = 2.5 + scatter(index * 11 + 3) * 3;
      if (index % 2 === 0) ground.ellipse(drift * 62, -262 + along * 520, size * 1.3, size * 0.8).fill({ color: palette.stone, alpha: 0.5 });
      else ground.ellipse(-410 + along * 820, -68 + drift * 52, size * 1.3, size * 0.8).fill({ color: palette.stone, alpha: 0.45 });
    }
    // Grass tufts and wildflowers, kept off the lots and lanes.
    let planted = 0;
    for (let index = 0; planted < 26 && index < 130; index += 1) {
      const x = (scatter(index * 5 + 17) - 0.5) * 980;
      const y = -300 + scatter(index * 9 + 5) * 590;
      if (Math.abs(x) < 66 || (y > -102 && y < 30 && Math.abs(x) < 452)) continue;
      if (y < -328 + Math.abs(x) * 0.52 + 26 || y > 310 - Math.abs(x) * 0.75 - 26) continue;
      if (positions.some((lot) => Math.abs(x - lot.x) < 148 && y - lot.y > -84 && y - lot.y < 118)) continue;
      planted += 1;
      if (planted % 4 === 0) {
        ground.circle(x - 4, y, 2).fill({ color: 0xd36b55, alpha: 0.75 });
        ground.circle(x + 3, y + 2, 2).fill({ color: 0xffd875, alpha: 0.75 });
        ground.circle(x, y - 3, 1.7).fill({ color: palette.cream, alpha: 0.7 });
      } else {
        ground.poly([x - 4, y + 3, x - 2, y - 5, x, y + 3]).fill({ color: palette.grassDeep, alpha: 0.55 });
        ground.poly([x, y + 3, x + 2.5, y - 6, x + 5, y + 3]).fill({ color: palette.grassDeep, alpha: 0.45 });
      }
    }
    return ground;
  }

  private buildShimmers(): Graphics[] {
    return [{ x: -470, y: 240 }, { x: 470, y: 230 }, { x: -350, y: -215 }, { x: 355, y: -210 }, { x: 0, y: 356 }].map((spot, index) => {
      const shimmer = new Graphics();
      const width = 34 + scatter(index + 40) * 30;
      shimmer.moveTo(-width, 0).quadraticCurveTo(0, 3, width, 0).stroke({ color: palette.cream, width: 2, alpha: 0.16, cap: 'round' });
      shimmer.moveTo(-width * 0.5, 7).quadraticCurveTo(width * 0.2, 9.5, width * 0.7, 7).stroke({ color: palette.cream, width: 1.5, alpha: 0.12, cap: 'round' });
      shimmer.position.set(spot.x, spot.y);
      return shimmer;
    });
  }

  private buildCloudShadows(): { shadow: Container; speed: number; offset: number }[] {
    return [{ y: -80, speed: 0.011, offset: 0, scale: 1 }, { y: 130, speed: 0.008, offset: 700, scale: 0.72 }].map((config) => {
      const shadow = new Container();
      const shape = new Graphics();
      shape.ellipse(0, 0, 150, 46).fill({ color: 0x0a1f1d, alpha: 0.07 });
      shape.ellipse(96, 12, 96, 34).fill({ color: 0x0a1f1d, alpha: 0.06 });
      shape.ellipse(-104, 10, 82, 30).fill({ color: 0x0a1f1d, alpha: 0.06 });
      shadow.addChild(shape);
      shadow.scale.set(config.scale);
      shadow.position.set(0, config.y);
      return { shadow, speed: config.speed, offset: config.offset };
    });
  }

  private buildMotes(): { dot: Graphics; baseX: number; baseY: number; seed: number }[] {
    const motes: { dot: Graphics; baseX: number; baseY: number; seed: number }[] = [];
    for (let index = 0; index < 9; index += 1) {
      const dot = new Graphics().circle(0, 0, 1.4 + scatter(index + 60) * 1.2).fill({ color: 0xffd875, alpha: 0.5 });
      const baseX = (scatter(index * 13 + 61) - 0.5) * 900;
      const baseY = -230 + scatter(index * 17 + 62) * 440;
      dot.position.set(baseX, baseY);
      dot.alpha = 0.25;
      motes.push({ dot, baseX, baseY, seed: index * 2.4 });
    }
    return motes;
  }

  update(snapshots: ProjectSnapshot[]): void {
    for (const snapshot of snapshots) this.lots[snapshot.slot].update(snapshot);
    const needsYou = snapshots.filter((snapshot) => snapshot.projectId && needsYouPhases.has(snapshot.phase)).length;
    this.signpost.visible = needsYou > 0;
    if (needsYou > 0) this.signpostText.text = needsYou === 1 ? '1 builder needs you' : `${needsYou} builders need you`;
  }

  tick(deltaMs: number): void {
    this.elapsed += deltaMs;
    for (const lot of this.lots) lot.tick(deltaMs);
    if (reducedMotion) return;
    for (const willow of this.willows) willow.sway.rotation = Math.sin(this.elapsed / 1900 + willow.seed) * 0.021;
    for (const cloud of this.clouds) cloud.shadow.x = (((this.elapsed * cloud.speed + cloud.offset) % 1500) + 1500) % 1500 - 750;
    this.shimmers.forEach((shimmer, index) => { shimmer.alpha = 0.55 + Math.sin(this.elapsed / 760 + index * 1.7) * 0.45; });
    for (const mote of this.motes) {
      mote.dot.position.set(mote.baseX + Math.sin(this.elapsed / 2400 + mote.seed) * 26, mote.baseY + Math.sin(this.elapsed / 1700 + mote.seed * 1.3) * 12);
      mote.dot.alpha = 0.14 + (Math.sin(this.elapsed / 900 + mote.seed) + 1) * 0.14;
    }
  }

  layout(width: number, height: number): void {
    this.width = width; this.height = height;
    const scale = Math.min(width / 1240, height / 830);
    this.world.scale.set(scale);
    this.world.position.set(width * 0.5, height * 0.55);
  }

  get size(): { width: number; height: number } { return { width: this.width, height: this.height }; }
}

function buildWillow(size: number): { tree: Container; sway: Container } {
  const tree = new Container();
  const sway = new Container();
  const trunk = new Graphics();
  trunk.moveTo(-5, 2).quadraticCurveTo(-3, -18, -6, -34).lineTo(3, -34).quadraticCurveTo(4, -16, 6, 2).closePath().fill(0x6a4a38);
  trunk.ellipse(0, 4, 15, 5).fill({ color: 0x123330, alpha: 0.28 });
  const crown = new Graphics();
  crown.ellipse(0, -12, 30, 19).fill({ color: palette.willowDeep, alpha: 0.95 });
  crown.ellipse(-8, -19, 20, 13).fill({ color: palette.willow, alpha: 0.85 });
  for (let index = 0; index < 7; index += 1) {
    const droop = (index - 3) * 8.5;
    const length = 30 + scatter(index + 8) * 12;
    crown.moveTo(droop * 0.55, -14)
      .quadraticCurveTo(droop, -14 + length * 0.4, droop * 1.2, -14 + length)
      .stroke({ color: index % 2 === 0 ? palette.willow : palette.willowDeep, width: 2.6, alpha: 0.9, cap: 'round' });
    crown.moveTo(droop * 0.55 + 2, -18)
      .quadraticCurveTo(droop + 3, -18 + length * 0.35, droop * 1.25 + 3, -20 + length * 0.86)
      .stroke({ color: 0x9cc27c, width: 1.6, alpha: 0.6, cap: 'round' });
  }
  sway.position.set(0, -34);
  sway.addChild(crown);
  tree.addChild(trunk, sway);
  tree.scale.set(size);
  return { tree, sway };
}

class ProjectLot {
  readonly container = new Container();
  readonly slot: VillageLot['slot'];
  private readonly base = new Graphics();
  private readonly ring = new Graphics();
  private readonly house = new Container();
  private readonly signBoard = new Graphics();
  private readonly signText: Text;
  private readonly chipBackground = new Graphics();
  private readonly statusText: Text;
  private readonly bubble = new Container();
  private readonly bubbleText: Text;
  private readonly actor: BuilderActor;
  private readonly lantern = new Container();
  private readonly pennant = new Graphics();
  private readonly smoke = new Container();
  private readonly smokePuffs: Graphics[] = [];
  private blades: Graphics | null = null;
  private currentSignature = '';
  private currentName = '';
  private currentChip = '';
  private currentPhase: SessionPhase = 'idle';
  private elapsed = 0;

  constructor(slot: VillageLot['slot'], x: number, y: number, actorColor: number) {
    this.slot = slot;
    this.container.position.set(x, y);
    this.base.poly([-122, -58, 122, -58, 122, 72, -122, 72]).fill({ color: palette.grassLight, alpha: 0.72 });
    this.base.poly([-122, 72, 122, 72, 112, 84, -112, 84]).fill({ color: palette.soil, alpha: 0.9 });
    this.base.roundRect(-121, -57, 242, 128, 15).stroke({ color: palette.cream, alpha: 0.1, width: 2 });
    this.ring.roundRect(-127, -63, 254, 152, 18).stroke({ color: 0xffd879, alpha: 0.9, width: 2.5 });
    this.ring.visible = false;
    this.signText = new Text({ text: 'Empty lot', style: textStyle(12.5, palette.cream, '600') });
    this.signText.anchor.set(0.5);
    this.signText.position.set(0, 99);
    this.statusText = new Text({ text: 'Ready', style: textStyle(8.5, 0xd9e7d6, '700') });
    this.statusText.anchor.set(0.5);
    this.statusText.position.set(0, 123);
    this.actor = new BuilderActor(actorColor);
    this.actor.container.visible = false;
    const bubbleBackground = new Graphics().roundRect(-110, -70, 220, 66, 13).fill({ color: palette.cream, alpha: 0.97 }).stroke({ color: 0xe4bd68, width: 1.5 });
    bubbleBackground.poly([12, -5, 27, 8, 32, -5]).fill(palette.cream);
    this.bubbleText = new Text({ text: '', style: new TextStyle({ fontFamily: 'ui-sans-serif, system-ui', fontSize: 8, fontWeight: '600', fill: palette.ink, wordWrap: true, wordWrapWidth: 200, lineHeight: 11 }) });
    this.bubbleText.anchor.set(0.5);
    this.bubbleText.position.set(0, -38);
    this.bubble.addChild(bubbleBackground, this.bubbleText);
    this.bubble.position.set(0, -78);
    this.bubble.visible = false;
    const lanternGlow = new Graphics().circle(0, 0, 13).fill({ color: 0xffd875, alpha: 0.35 });
    const lanternBody = new Graphics();
    lanternBody.roundRect(-4, -6, 8, 12, 3).fill(0xe8b85b).stroke({ color: palette.timber, width: 1.5 });
    lanternBody.circle(0, 0, 2.5).fill(0xfff4d9);
    this.lantern.addChild(lanternGlow, lanternBody);
    this.lantern.position.set(4, 30);
    this.lantern.visible = false;
    this.pennant.moveTo(0, 0).lineTo(0, -26).stroke({ color: palette.timber, width: 2 });
    this.pennant.poly([0, -26, 20, -20, 0, -14]).fill(0xffd875);
    this.pennant.position.set(3, -95);
    this.pennant.visible = false;
    for (let index = 0; index < 3; index += 1) {
      const puff = new Graphics().circle(0, 0, 4 + index).fill({ color: 0xdfe8e2, alpha: 0.5 });
      this.smokePuffs.push(puff);
      this.smoke.addChild(puff);
    }
    this.smoke.position.set(56, -30);
    this.smoke.visible = false;
    this.container.addChild(this.base, this.ring, this.house, this.smoke, this.pennant, this.actor.container, this.lantern, this.signBoard, this.signText, this.chipBackground, this.statusText, this.bubble);
  }

  update(snapshot: ProjectSnapshot): void {
    this.currentPhase = snapshot.phase;
    this.actor.container.visible = Boolean(snapshot.projectId);
    this.actor.update(snapshot.phase);
    this.signText.text = trim(snapshot.projectName, 22);
    if (this.signText.text !== this.currentName) {
      this.currentName = this.signText.text;
      const width = Math.min(Math.max(this.signText.width + 26, 96), 214);
      this.signBoard.clear();
      this.signBoard.roundRect(-width / 2, 86, width, 26, 8).fill({ color: 0x47331f, alpha: 0.94 }).stroke({ color: 0xe4bd68, alpha: 0.55, width: 1.5 });
    }
    this.statusText.text = phaseLabel(snapshot.phase);
    const chip = chipStyles[snapshot.phase];
    const chipSignature = `${this.statusText.text}-${chip.bg}`;
    if (chipSignature !== this.currentChip) {
      this.currentChip = chipSignature;
      this.statusText.style.fill = chip.fg;
      const width = this.statusText.width + 18;
      this.chipBackground.clear();
      this.chipBackground.roundRect(-width / 2, 114, width, 17, 8.5).fill({ color: chip.bg, alpha: 0.96 });
    }
    const needsYou = Boolean(snapshot.projectId) && needsYouPhases.has(snapshot.phase);
    this.lantern.visible = needsYou;
    this.ring.visible = snapshot.selected;
    this.pennant.visible = Boolean(snapshot.projectId) && snapshot.phase === 'reviewing';
    this.smoke.visible = Boolean(snapshot.projectId) && snapshot.phase === 'testing';
    this.base.tint = needsYou ? 0xffe9b8 : snapshot.selected ? 0xffffff : 0xe1eadb;
    this.container.alpha = snapshot.projectId ? (snapshot.phase === 'failed' ? 0.82 : 1) : 0.48;
    const lit = Boolean(snapshot.projectId) && litPhases.has(snapshot.phase);
    const completed = snapshot.phase === 'completed';
    const signature = `${snapshot.projectId}-${snapshot.level}-${lit}-${completed}`;
    if (signature !== this.currentSignature) {
      this.house.removeChildren().forEach((child) => child.destroy({ children: true }));
      this.blades = null;
      if (snapshot.projectId) this.blades = drawHouse(this.house, snapshot.level, lit, completed);
      else drawEmptyMarker(this.house, this.slot);
      this.currentSignature = signature;
    }
    if (snapshot.debrief && snapshot.phase === 'completed') {
      this.bubbleText.text = `${trim(snapshot.debrief.landed, 82)}\n${snapshot.debrief.followUpRecommended ? '↗ Follow-up recommended' : '✓ No follow-up needed'}`;
      this.bubble.visible = true;
    } else this.bubble.visible = false;
  }

  tick(deltaMs: number): void {
    this.actor.tick(deltaMs);
    this.elapsed += deltaMs;
    if (this.lantern.visible) {
      this.lantern.alpha = reducedMotion ? 1 : 0.7 + Math.sin(this.elapsed / 320) * 0.3;
      this.lantern.position.set(this.actor.container.x + 14, this.actor.container.y - 18);
    }
    if (this.ring.visible) this.ring.alpha = reducedMotion ? 0.8 : 0.62 + Math.sin(this.elapsed / 640) * 0.22;
    if (this.blades && !reducedMotion) this.blades.rotation += deltaMs * 0.00045;
    if (this.pennant.visible && this.currentPhase === 'reviewing' && !reducedMotion) {
      this.pennant.alpha = 0.75 + Math.sin(this.elapsed / 500) * 0.25;
    }
    if (this.smoke.visible && !reducedMotion) {
      this.smokePuffs.forEach((puff, index) => {
        const cycle = ((this.elapsed / 900) + index / 3) % 1;
        puff.position.set(Math.sin((cycle + index) * 6) * 4, -cycle * 34);
        puff.alpha = 0.5 * (1 - cycle);
        puff.scale.set(0.7 + cycle * 0.8);
      });
    }
    if (this.bubble.visible) {
      this.bubble.alpha += (1 - this.bubble.alpha) * Math.min(deltaMs / 150, 1);
      this.bubble.scale.set(0.96 + this.bubble.alpha * 0.04);
    } else this.bubble.alpha = 0;
  }
}

/**
 * Levels are LANDED sessions, and each tier is visually distinct so a week of
 * real work reads at a glance: cottage → tower → annex → guild banner + garden
 * → windmill. Landed work also leaves one plaque stud per level on the lot edge.
 * Windows are lit whenever a builder is inside working — driven by real phases.
 * Returns the windmill blades (level 4+) so the lot can slowly turn them.
 */
function drawHouse(container: Container, level: number, lit: boolean, completed: boolean): Graphics | null {
  const shell = new Graphics();
  shell.poly([-70, -22, 5, 16, 5, 65, -70, 28]).fill(palette.shade);
  shell.poly([5, 16, 80, -22, 80, 30, 5, 65]).fill(palette.wall);
  shell.poly([-82, -21, 0, -64, 92, -18, 6, 27]).fill(palette.roof);
  shell.poly([-82, -21, 0, -64, 3, -50, -69, -14]).fill(palette.roofLight);
  shell.rect(48, -48, 11, 22).fill(0x6a4438);
  shell.rect(46, -50, 15, 5).fill(palette.timber);
  shell.rect(42, 8, 24, 39).fill(palette.timber);
  if (lit) {
    shell.circle(21, 26, 15).fill({ color: 0xffd875, alpha: 0.14 });
    shell.circle(-35, 7, 15).fill({ color: 0xffd875, alpha: 0.14 });
  }
  shell.rect(12, 17, 18, 19).fill(lit ? palette.window : 0x718376);
  shell.rect(-45, -2, 19, 18).fill(lit ? palette.window : 0x718376);
  container.addChild(shell);
  if (level >= 1 || completed) {
    const tower = new Graphics();
    tower.rect(-18, -96, 37, 46).fill(palette.wall);
    tower.poly([-27, -94, 0, -127, 28, -94]).fill(palette.roofLight);
    tower.circle(0, -77, 8).fill(palette.window);
    container.addChild(tower);
  }
  if (level >= 2) {
    const annex = new Graphics();
    annex.poly([-108, 8, -70, 28, -70, 58, -108, 38]).fill(palette.shade);
    annex.poly([-114, 6, -76, -14, -64, 22, -102, 42]).fill(palette.roof);
    annex.rect(-98, 20, 12, 12).fill(level >= 3 ? palette.window : 0x718376);
    container.addChild(annex);
  }
  if (level >= 3) {
    const guild = new Graphics();
    guild.rect(58, -52, 3, 34).fill(palette.timber);
    guild.poly([61, -52, 84, -46, 61, -38]).fill(palette.roofLight);
    guild.ellipse(-88, 62, 18, 7).fill({ color: palette.grass, alpha: 0.9 });
    guild.circle(-94, 59, 3).fill(0xd36b55);
    guild.circle(-84, 61, 3).fill(0xffd875);
    guild.circle(-89, 64, 3).fill(0xfff4d9);
    container.addChild(guild);
  }
  let blades: Graphics | null = null;
  if (level >= 4) {
    const windmill = new Graphics();
    windmill.rect(-2, -158, 4, 32).fill(palette.timber);
    container.addChild(windmill);
    blades = new Graphics();
    for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const bladeLength = 24;
      blades.poly([
        0, 0,
        Math.cos(angle - 0.12) * bladeLength, Math.sin(angle - 0.12) * bladeLength,
        Math.cos(angle + 0.12) * bladeLength, Math.sin(angle + 0.12) * bladeLength,
      ]).fill({ color: palette.cream, alpha: 0.85 });
    }
    blades.circle(0, 0, 3.5).fill(palette.timber);
    blades.position.set(0, -158);
    container.addChild(blades);
  }
  const plaques = new Graphics();
  for (let index = 0; index < Math.min(level, 6); index += 1) {
    plaques.roundRect(-60 + index * 21, 76, 13, 8, 2).fill(0xe8b85b).stroke({ color: palette.timber, width: 1 });
  }
  container.addChild(plaques);
  container.position.set(3, -3);
  return blades;
}

function drawEmptyMarker(container: Container, slot: VillageLot['slot']): void {
  const marker = new Graphics().roundRect(-28, -25, 56, 50, 12).fill({ color: palette.ink, alpha: 0.16 }).stroke({ color: palette.cream, alpha: 0.2, width: 2 });
  const text = new Text({ text: String(slot + 1).padStart(2, '0'), style: textStyle(15, palette.cream, '700') });
  text.anchor.set(0.5);
  container.addChild(marker, text);
}

function textStyle(size: number, fill: number, weight: '600' | '700'): TextStyle {
  return new TextStyle({ fontFamily: 'ui-sans-serif, system-ui', fontSize: size, fontWeight: weight, fill });
}

function phaseLabel(phase: SessionPhase): string {
  return ({ idle: 'Ready', starting: 'Builder arriving', planning: 'Planning', reading: 'Reading', editing: 'Building', testing: 'Testing', approval: 'Needs approval', input: 'Needs input', waiting: 'Waiting for reply', needs_review: 'Needs review', external: 'In Ghostty', reviewing: 'Ready for inspection', completed: 'Improvement complete', failed: 'Construction paused', interrupted: 'Ready' })[phase];
}

function trim(value: string, length: number): string { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
