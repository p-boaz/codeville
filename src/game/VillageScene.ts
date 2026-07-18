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

const palette = { grass: 0x74a85b, grassLight: 0x91bd69, soil: 0x654b39, path: 0xc9aa72, wall: 0xe8d09e, shade: 0xc49a62, roof: 0xa95143, roofLight: 0xd36b55, timber: 0x58382d, window: 0xffd875, cream: 0xfff4d9, ink: 0x203b37, water: 0x1e5650 };
const positions = [{ x: -290, y: -105 }, { x: 0, y: -148 }, { x: 290, y: -105 }, { x: -155, y: 145 }, { x: 155, y: 145 }];
const actorColors = [0x4d7f75, 0x5c7196, 0x8b6653, 0x6f8050, 0x856383];

const needsYouPhases = new Set<SessionPhase>(['approval', 'input', 'waiting']);

export class VillageScene {
  readonly root = new Container();
  private readonly world = new Container();
  private readonly lots = positions.map((position, index) => new ProjectLot(index as VillageLot['slot'], position.x, position.y, actorColors[index]));
  private readonly signpost = new Container();
  private readonly signpostText: Text;
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
    const ground = new Graphics();
    ground.ellipse(0, 45, 530, 355).fill({ color: palette.water, alpha: 0.48 });
    ground.poly([-520, -50, 0, -310, 520, -50, 0, 330]).fill(palette.soil);
    ground.poly([-520, -68, 0, -328, 520, -68, 0, 310]).fill(palette.grass);
    ground.poly([-45, -275, 40, -275, 46, 275, -42, 275]).fill({ color: palette.path, alpha: 0.62 });
    ground.poly([-440, -75, 440, -75, 430, 5, -430, 5]).fill({ color: palette.path, alpha: 0.55 });
    this.world.addChild(ground);
    for (const lot of this.lots) this.world.addChild(lot.container);
    const signBoard = new Graphics();
    signBoard.roundRect(-92, -16, 184, 32, 8).fill({ color: palette.ink, alpha: 0.82 }).stroke({ color: 0xe4bd68, width: 1.5 });
    signBoard.rect(-3, 16, 6, 20).fill(palette.timber);
    this.signpostText = new Text({ text: '', style: textStyle(12, 0xffd875, '700') });
    this.signpostText.anchor.set(0.5);
    this.signpost.addChild(signBoard, this.signpostText);
    this.signpost.position.set(0, 285);
    this.signpost.visible = false;
    this.world.addChild(this.signpost);
    this.root.addChild(this.world);
  }

  update(snapshots: ProjectSnapshot[]): void {
    for (const snapshot of snapshots) this.lots[snapshot.slot].update(snapshot);
    const needsYou = snapshots.filter((snapshot) => snapshot.projectId && needsYouPhases.has(snapshot.phase)).length;
    this.signpost.visible = needsYou > 0;
    if (needsYou > 0) this.signpostText.text = needsYou === 1 ? '1 builder needs you' : `${needsYou} builders need you`;
  }

  tick(deltaMs: number): void {
    for (const lot of this.lots) lot.tick(deltaMs);
  }

  layout(width: number, height: number): void {
    this.width = width; this.height = height;
    const scale = Math.min(width / 1120, height / 780);
    this.world.scale.set(scale);
    this.world.position.set(width * 0.51, height * 0.57);
  }

  get size(): { width: number; height: number } { return { width: this.width, height: this.height }; }
}

class ProjectLot {
  readonly container = new Container();
  readonly slot: VillageLot['slot'];
  private readonly base = new Graphics();
  private readonly house = new Container();
  private readonly signText: Text;
  private readonly statusText: Text;
  private readonly bubble = new Container();
  private readonly bubbleText: Text;
  private readonly actor: BuilderActor;
  private readonly lantern = new Container();
  private readonly pennant = new Graphics();
  private currentSignature = '';
  private currentPhase: SessionPhase = 'idle';
  private pulse = 0;

  constructor(slot: VillageLot['slot'], x: number, y: number, actorColor: number) {
    this.slot = slot;
    this.container.position.set(x, y);
    this.base.poly([-122, -58, 122, -58, 122, 72, -122, 72]).fill({ color: palette.grassLight, alpha: 0.72 });
    this.base.poly([-122, 72, 122, 72, 112, 84, -112, 84]).fill({ color: palette.soil, alpha: 0.9 });
    this.base.roundRect(-121, -57, 242, 128, 15).stroke({ color: palette.cream, alpha: 0.1, width: 2 });
    this.signText = new Text({ text: 'Empty lot', style: textStyle(13, palette.cream, '600') });
    this.signText.anchor.set(0.5);
    this.signText.position.set(0, 98);
    this.statusText = new Text({ text: 'Ready', style: textStyle(9, palette.ink, '700') });
    this.statusText.anchor.set(0.5);
    this.statusText.position.set(0, 116);
    this.actor = new BuilderActor(actorColor);
    this.actor.container.visible = false;
    const bubbleBackground = new Graphics().roundRect(-110, -70, 220, 66, 11).fill({ color: palette.cream, alpha: 0.97 }).stroke({ color: 0xe4bd68, width: 2 });
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
    this.container.addChild(this.base, this.house, this.pennant, this.actor.container, this.lantern, this.signText, this.statusText, this.bubble);
  }

  update(snapshot: ProjectSnapshot): void {
    this.currentPhase = snapshot.phase;
    this.actor.container.visible = Boolean(snapshot.projectId);
    this.actor.update(snapshot.phase);
    this.signText.text = trim(snapshot.projectName, 22);
    this.statusText.text = phaseLabel(snapshot.phase);
    const needsYou = Boolean(snapshot.projectId) && needsYouPhases.has(snapshot.phase);
    this.lantern.visible = needsYou;
    this.pennant.visible = Boolean(snapshot.projectId) && snapshot.phase === 'reviewing';
    this.base.tint = needsYou ? 0xffe9b8 : snapshot.selected ? 0xffffff : 0xe1eadb;
    this.container.alpha = snapshot.projectId ? (snapshot.phase === 'failed' ? 0.82 : 1) : 0.48;
    const signature = `${snapshot.projectId}-${snapshot.level}-${snapshot.phase === 'completed'}`;
    if (signature !== this.currentSignature) {
      this.house.removeChildren().forEach((child) => child.destroy({ children: true }));
      if (snapshot.projectId) drawHouse(this.house, snapshot.level, snapshot.phase === 'completed');
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
    if (this.lantern.visible) {
      this.pulse += deltaMs;
      this.lantern.alpha = 0.7 + Math.sin(this.pulse / 320) * 0.3;
      this.lantern.position.set(this.actor.container.x + 14, this.actor.container.y - 18);
    }
    if (this.pennant.visible && this.currentPhase === 'reviewing') {
      this.pulse += deltaMs;
      this.pennant.alpha = 0.75 + Math.sin(this.pulse / 500) * 0.25;
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
 */
function drawHouse(container: Container, level: number, completed: boolean): void {
  const shell = new Graphics();
  shell.poly([-70, -22, 5, 16, 5, 65, -70, 28]).fill(palette.shade);
  shell.poly([5, 16, 80, -22, 80, 30, 5, 65]).fill(palette.wall);
  shell.poly([-82, -21, 0, -64, 92, -18, 6, 27]).fill(palette.roof);
  shell.poly([-82, -21, 0, -64, 3, -50, -69, -14]).fill(palette.roofLight);
  shell.rect(42, 8, 24, 39).fill(palette.timber);
  shell.rect(12, 17, 18, 19).fill(completed ? palette.window : 0x718376);
  shell.rect(-45, -2, 19, 18).fill(completed ? palette.window : 0x718376);
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
  if (level >= 4) {
    const windmill = new Graphics();
    windmill.rect(-2, -158, 4, 32).fill(palette.timber);
    for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const bladeLength = 24;
      windmill.poly([
        0, -158,
        Math.cos(angle - 0.12) * bladeLength, -158 + Math.sin(angle - 0.12) * bladeLength,
        Math.cos(angle + 0.12) * bladeLength, -158 + Math.sin(angle + 0.12) * bladeLength,
      ]).fill({ color: palette.cream, alpha: 0.85 });
    }
    windmill.circle(0, -158, 3.5).fill(palette.timber);
    container.addChild(windmill);
  }
  const plaques = new Graphics();
  for (let index = 0; index < Math.min(level, 6); index += 1) {
    plaques.roundRect(-60 + index * 21, 76, 13, 8, 2).fill(0xe8b85b).stroke({ color: palette.timber, width: 1 });
  }
  container.addChild(plaques);
  container.position.set(3, -3);
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
