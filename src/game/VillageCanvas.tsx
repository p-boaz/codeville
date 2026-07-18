import { Application } from 'pixi.js';
import { useEffect, useRef } from 'react';

import { VillageScene, type ProjectSnapshot } from './VillageScene';

interface VillageCanvasProps { projects: ProjectSnapshot[] }

export function VillageCanvas({ projects }: VillageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VillageScene | null>(null);
  const projectsRef = useRef(projects);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let app: Application | null = null;
    let observer: ResizeObserver | null = null;
    void (async () => {
      const nextApp = new Application();
      await nextApp.init({ backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio, 2), width: host.clientWidth, height: host.clientHeight });
      if (cancelled) { nextApp.destroy(true, { children: true }); return; }
      app = nextApp;
      const scene = new VillageScene();
      sceneRef.current = scene;
      scene.update(projectsRef.current);
      host.replaceChildren(nextApp.canvas);
      nextApp.stage.addChild(scene.root);
      nextApp.ticker.add((ticker) => scene.tick(ticker.deltaMS));
      observer = new ResizeObserver(() => { nextApp.renderer.resize(host.clientWidth, host.clientHeight); scene.layout(host.clientWidth, host.clientHeight); });
      observer.observe(host);
      scene.layout(host.clientWidth, host.clientHeight);
    })();
    return () => { cancelled = true; observer?.disconnect(); sceneRef.current = null; app?.destroy(true, { children: true }); };
  }, []);

  useEffect(() => {
    projectsRef.current = projects;
    sceneRef.current?.update(projects);
  }, [projects]);

  return <div ref={hostRef} className="village-canvas" aria-label="Five-project Codeville village" />;
}
