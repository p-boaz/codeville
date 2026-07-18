import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { useEffect, useRef } from 'react';

import type { SessionPhase } from '../state/session-machine';

interface VillageCanvasProps {
  phase: SessionPhase;
  level: number;
  projectName: string;
}

const palette = {
  night: 0x143b38,
  water: 0x1f5750,
  grass: 0x78a95b,
  grassLight: 0x91bf68,
  soil: 0x73543b,
  path: 0xc7a56b,
  wall: 0xe8cf9c,
  wallShade: 0xc69d63,
  roof: 0xa84c3f,
  roofLight: 0xcd6852,
  timber: 0x58382d,
  window: 0xffd875,
  cream: 0xfff4d9,
  ink: 0x203b37,
  blue: 0x73b8af,
};

export function VillageCanvas({ phase, level, projectName }: VillageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let app: Application | null = null;
    let resizeObserver: ResizeObserver | null = null;

    void (async () => {
      const nextApp = new Application();
      await nextApp.init({
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        width: host.clientWidth,
        height: host.clientHeight,
      });
      if (cancelled) {
        nextApp.destroy(true, { children: true });
        return;
      }
      app = nextApp;
      host.replaceChildren(nextApp.canvas);
      const scene = createScene(nextApp, phase, level, projectName);
      nextApp.stage.addChild(scene.root);
      nextApp.ticker.add(scene.tick);
      resizeObserver = new ResizeObserver(() => {
        nextApp.renderer.resize(host.clientWidth, host.clientHeight);
        scene.layout(host.clientWidth, host.clientHeight);
      });
      resizeObserver.observe(host);
      scene.layout(host.clientWidth, host.clientHeight);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      app?.destroy(true, { children: true });
    };
  }, [phase, level, projectName]);

  return <div ref={hostRef} className="village-canvas" aria-label={`Village view for ${projectName}`} />;
}

function createScene(app: Application, phase: SessionPhase, level: number, projectName: string) {
  const root = new Container();
  const world = new Container();
  const effects = new Container();
  root.addChild(world, effects);

  const island = new Graphics();
  drawIsland(island);
  world.addChild(island);

  const house = new Container();
  drawHouse(house, level, phase === 'completed');
  house.position.set(0, -32);
  world.addChild(house);

  const builder = new Container();
  drawBuilder(builder);
  world.addChild(builder);

  const sign = new Container();
  drawSign(sign, projectName);
  sign.position.set(-235, 126);
  world.addChild(sign);

  const trees = new Container();
  drawTree(trees, -300, -34, 1.05);
  drawTree(trees, 280, -8, 0.88);
  drawTree(trees, 246, 145, 0.72);
  world.addChild(trees);

  const smoke = createSmoke();
  smoke.position.set(108, -176);
  effects.addChild(smoke);

  const phasePill = new Text({
    text: activityLabel(phase),
    style: new TextStyle({
      fontFamily: 'ui-rounded, system-ui, sans-serif',
      fontSize: 15,
      fontWeight: '600',
      fill: palette.ink,
      align: 'center',
    }),
  });
  const pillBackground = new Graphics().roundRect(-12, -8, phasePill.width + 24, 36, 18).fill({ color: palette.cream, alpha: 0.94 });
  const pill = new Container();
  pill.addChild(pillBackground, phasePill);
  phasePill.position.set(0, 1);
  pill.position.set(-phasePill.width / 2, 196);
  world.addChild(pill);

  let elapsed = 0;
  const tick = (ticker: { deltaTime: number }) => {
    elapsed += ticker.deltaTime;
    const active = !['idle', 'completed', 'failed', 'interrupted'].includes(phase);
    const target = builderTarget(phase);
    builder.x += (target.x - builder.x) * 0.045;
    builder.y += (target.y - builder.y) * 0.045;
    builder.rotation = active ? Math.sin(elapsed * 0.16) * 0.025 : 0;
    builder.scale.y = 1 + (active ? Math.sin(elapsed * 0.22) * 0.025 : 0);
    house.scale.set(1 + (phase === 'completed' ? Math.sin(elapsed * 0.08) * 0.004 : 0));
    smoke.visible = ['editing', 'testing', 'planning', 'reading'].includes(phase);
    smoke.children.forEach((particle, index) => {
      particle.y = -((elapsed * (0.22 + index * 0.04) + index * 18) % 78);
      particle.x = Math.sin(elapsed * 0.05 + index) * 10;
      particle.alpha = 0.44 * (1 - Math.abs(particle.y) / 90);
    });
    effects.children.forEach((child) => {
      child.position.x = world.position.x + 108 * world.scale.x;
      child.position.y = world.position.y - 176 * world.scale.y;
      child.scale.set(world.scale.x);
    });
    app.render();
  };

  const layout = (width: number, height: number) => {
    const scale = Math.min(width / 880, height / 610);
    world.scale.set(scale);
    world.position.set(width * 0.48, height * 0.56);
  };

  return { root, tick, layout };
}

function drawIsland(graphics: Graphics) {
  graphics.ellipse(0, 122, 410, 186).fill({ color: palette.water, alpha: 0.52 });
  graphics.poly([0, -210, 380, -18, 0, 205, -380, -18]).fill(palette.soil);
  graphics.poly([0, -225, 380, -34, 0, 180, -380, -34]).fill(palette.grass);
  graphics.poly([-42, 126, 40, 84, 150, 139, 70, 180]).fill(palette.path);
  graphics.poly([-42, 126, 38, 86, -2, 65, -83, 106]).fill({ color: palette.path, alpha: 0.88 });
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const x = -290 + column * 52 + (row % 2) * 20;
      const y = -76 + row * 34;
      graphics.circle(x, y, 3 + ((row + column) % 2)).fill(palette.grassLight);
    }
  }
}

function drawHouse(container: Container, level: number, completed: boolean) {
  const shell = new Graphics();
  shell.poly([-130, -45, 10, 26, 10, 140, -130, 70]).fill(palette.wallShade);
  shell.poly([10, 26, 150, -45, 150, 70, 10, 140]).fill(palette.wall);
  shell.poly([-150, -42, 0, -118, 170, -34, 10, 48]).fill(palette.roof);
  shell.poly([-150, -42, 0, -118, 4, -94, -126, -29]).fill(palette.roofLight);
  shell.rect(74, 29, 46, 70).fill(palette.timber);
  shell.rect(24, 46, 31, 34).fill(completed ? palette.window : 0x6c806f);
  shell.rect(-82, 8, 34, 32).fill(completed ? palette.window : 0x6c806f);
  shell.moveTo(39, 46).lineTo(39, 80).moveTo(24, 63).lineTo(55, 63).stroke({ color: palette.timber, width: 3 });
  shell.moveTo(-65, 8).lineTo(-65, 40).moveTo(-82, 24).lineTo(-48, 24).stroke({ color: palette.timber, width: 3 });
  shell.rect(77, -121, 26, 54).fill(palette.timber);
  shell.poly([70, -121, 109, -121, 103, -135, 76, -135]).fill(palette.roof);
  container.addChild(shell);

  if (level > 0 || completed) {
    const tower = new Graphics();
    tower.rect(-36, -181, 68, 84).fill(palette.wall);
    tower.poly([-50, -177, -2, -232, 46, -177]).fill(palette.roofLight);
    tower.circle(-2, -148, 15).fill(palette.window);
    tower.moveTo(-2, -232).lineTo(-2, -263).stroke({ color: palette.timber, width: 4 });
    tower.poly([-2, -263, 38, -249, -2, -237]).fill(palette.roof);
    container.addChild(tower);
  }

  if (level > 1) {
    const garden = new Graphics();
    for (let index = 0; index < Math.min(level + 2, 7); index += 1) {
      const x = -135 + index * 24;
      garden.circle(x, 102 + (index % 2) * 8, 8).fill(index % 2 ? 0xf0a65b : 0xf7d873);
      garden.rect(x - 1, 110, 2, 12).fill(palette.grass);
    }
    container.addChild(garden);
  }
}

function drawBuilder(container: Container) {
  const shadow = new Graphics().ellipse(0, 25, 36, 14).fill({ color: palette.ink, alpha: 0.18 });
  const body = new Graphics();
  body.roundRect(-12, -3, 24, 31, 8).fill(0x4d7f75);
  body.circle(0, -14, 12).fill(0xe7b985);
  body.poly([-15, -17, 0, -31, 15, -17]).fill(0xd99b3c);
  body.rect(-14, -18, 28, 5).fill(0xc8842d);
  body.rect(-15, 23, 11, 13).fill(palette.timber);
  body.rect(4, 23, 11, 13).fill(palette.timber);
  container.addChild(shadow, body);
  container.position.set(-210, 118);
}

function drawSign(container: Container, projectName: string) {
  const board = new Graphics();
  board.roundRect(-78, -24, 156, 48, 8).fill(palette.timber);
  board.rect(-4, 20, 8, 42).fill(palette.timber);
  const label = new Text({
    text: trimLabel(projectName),
    style: new TextStyle({
      fontFamily: 'ui-rounded, system-ui, sans-serif',
      fontSize: 14,
      fontWeight: '600',
      fill: palette.cream,
    }),
  });
  label.anchor.set(0.5);
  container.addChild(board, label);
}

function drawTree(container: Container, x: number, y: number, scale: number) {
  const tree = new Container();
  const graphics = new Graphics();
  graphics.rect(-8, 22, 16, 44).fill(palette.timber);
  graphics.circle(-17, 2, 33).fill(0x527d49);
  graphics.circle(18, 6, 30).fill(0x65914e);
  graphics.circle(1, -26, 36).fill(palette.grassLight);
  tree.addChild(graphics);
  tree.position.set(x, y);
  tree.scale.set(scale);
  container.addChild(tree);
}

function createSmoke() {
  const container = new Container();
  for (let index = 0; index < 5; index += 1) {
    const particle = new Graphics().circle(0, 0, 7 + index * 1.6).fill({ color: palette.cream, alpha: 0.4 });
    container.addChild(particle);
  }
  return container;
}

function builderTarget(phase: SessionPhase) {
  switch (phase) {
    case 'planning':
    case 'reading':
      return { x: -120, y: 75 };
    case 'editing':
      return { x: 155, y: 78 };
    case 'testing':
      return { x: 220, y: 130 };
    case 'approval':
      return { x: 58, y: 148 };
    case 'completed':
      return { x: -8, y: 162 };
    default:
      return { x: -210, y: 118 };
  }
}

function activityLabel(phase: SessionPhase): string {
  const labels: Record<SessionPhase, string> = {
    idle: 'Workshop resting',
    starting: 'Builder arriving',
    planning: 'Drafting plans',
    reading: 'Studying project',
    editing: 'Building improvement',
    testing: 'Inspecting work',
    approval: 'Needs your decision',
    completed: 'Improvement complete',
    failed: 'Construction paused',
    interrupted: 'Workshop resting',
  };
  return labels[phase];
}

function trimLabel(value: string): string {
  return value.length > 18 ? `${value.slice(0, 16)}…` : value;
}
