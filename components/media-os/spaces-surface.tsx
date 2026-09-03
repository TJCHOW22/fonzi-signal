"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { DraftProductionStage, DraftRecord } from "@/lib/media-drafts/types";
import styles from "./media-os.module.css";

type ProductionSpace = {
  stage: Exclude<DraftProductionStage, "drafting">;
  label: string;
  eyebrow: string;
  coverClass: string;
};

const SPACES: readonly ProductionSpace[] = [
  {
    stage: "ready_to_record",
    label: "Ready 2 Rec",
    eyebrow: "Scripts locked",
    coverClass: styles.spaceCoverRecord,
  },
  {
    stage: "editing",
    label: "Editing",
    eyebrow: "Footage captured",
    coverClass: styles.spaceCoverEditing,
  },
  {
    stage: "ready_to_publish",
    label: "Ready 2 Post",
    eyebrow: "Final exports",
    coverClass: styles.spaceCoverPublish,
  },
] as const;

function VideoIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="6" width="13" height="12" rx="3" />
    <path d="m16 10 5-3v10l-5-3z" />
  </svg>;
}

function SpaceDust({ count, near = false }: { count: number; near?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const randomBetween = (minimum: number, maximum: number) =>
      minimum + Math.random() * (maximum - minimum);
    let frame = 0;
    let width = 0;
    let height = 0;
    const particles: Array<{
      x: number;
      y: number;
      radius: number;
      velocityX: number;
      velocityY: number;
      baseAlpha: number;
      soft: boolean;
      twinkle: number;
      twinkleSpeed: number;
    }> = [];

    const resize = () => {
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const seed = () => {
      particles.length = 0;
      for (let index = 0; index < count; index += 1) {
        const soft = Math.random() < .3;
        particles.push({
          x: randomBetween(0, width),
          y: randomBetween(0, height),
          radius: soft
            ? near ? randomBetween(2.6, 4.4) : randomBetween(1.6, 3)
            : near ? randomBetween(.7, 1.5) : randomBetween(.4, 1),
          velocityX: randomBetween(-.05, .05) * (near ? 1.5 : 1),
          velocityY: randomBetween(-.13, -.03) * (near ? 1.5 : 1),
          baseAlpha: soft
            ? near ? randomBetween(.06, .14) : randomBetween(.04, .09)
            : near ? randomBetween(.5, .95) : randomBetween(.28, .6),
          soft,
          twinkle: randomBetween(0, Math.PI * 2),
          twinkleSpeed: randomBetween(.008, .03),
        });
      }
    };

    const paint = () => {
      context.clearRect(0, 0, width, height);
      for (const particle of particles) {
        const alpha = particle.baseAlpha * (
          particle.soft
            ? .75 + .25 * Math.sin(particle.twinkle)
            : .4 + .6 * Math.sin(particle.twinkle)
        );
        if (alpha <= .003) continue;

        if (particle.soft) {
          const radius = particle.radius * 2.2;
          const gradient = context.createRadialGradient(
            particle.x, particle.y, 0, particle.x, particle.y, radius,
          );
          gradient.addColorStop(0, `rgba(255,247,232,${alpha.toFixed(3)})`);
          gradient.addColorStop(1, "rgba(255,247,232,0)");
          context.fillStyle = gradient;
          context.beginPath();
          context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
          context.fill();
        } else {
          const glowRadius = particle.radius * 3;
          const gradient = context.createRadialGradient(
            particle.x, particle.y, 0, particle.x, particle.y, glowRadius,
          );
          gradient.addColorStop(0, `rgba(255,247,232,${(alpha * .3).toFixed(3)})`);
          gradient.addColorStop(1, "rgba(255,247,232,0)");
          context.fillStyle = gradient;
          context.beginPath();
          context.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = `rgba(255,251,242,${Math.min(1, alpha).toFixed(3)})`;
          context.beginPath();
          context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
          context.fill();
        }
      }
    };

    const animate = () => {
      for (const particle of particles) {
        particle.x += particle.velocityX;
        particle.y += particle.velocityY;
        particle.twinkle += particle.twinkleSpeed;
        if (particle.y < -4) {
          particle.y = height + 4;
          particle.x = randomBetween(0, width);
        }
        if (particle.x < -4) particle.x = width + 4;
        else if (particle.x > width + 4) particle.x = -4;
      }
      paint();
      frame = requestAnimationFrame(animate);
    };

    resize();
    seed();
    if (reduceMotion) paint();
    else animate();
    const handleResize = () => {
      resize();
      seed();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [count, near]);

  return <canvas
    ref={canvasRef}
    className={near ? styles.spaceDustNear : styles.spaceDustFar}
    aria-hidden="true"
  />;
}

export function SpacesSurface({
  drafts,
  loading,
}: {
  drafts: readonly DraftRecord[];
  loading: boolean;
}) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [openStage, setOpenStage] = useState<ProductionSpace["stage"] | null>(null);
  const sleeveRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rowRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const counts = SPACES.map((space) =>
    drafts.filter((draft) => draft.productionStage === space.stage).length,
  );
  const activeIndex = hoveredIndex ?? selectedIndex;

  const select = useCallback((index: number) => {
    const normalized = Math.max(0, Math.min(SPACES.length - 1, index));
    setHoveredIndex(null);
    setSelectedIndex(normalized);
    const sleeve = sleeveRefs.current[normalized];
    sleeve?.focus({ preventScroll: true });
    sleeve?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, []);

  const resolveHover = useCallback(() => {
    const pointer = pointerRef.current;
    const row = rowRef.current;
    if (!pointer || !row) return;
    const target = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>("[data-space-index]");
    if (!target || !row.contains(target)) {
      setHoveredIndex(null);
      return;
    }
    const nextIndex = Number(target.dataset.spaceIndex);
    setHoveredIndex(Number.isFinite(nextIndex) ? nextIndex : null);
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || openStage) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0 || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      row.scrollLeft += event.deltaY;
      event.preventDefault();
    };
    row.addEventListener("wheel", handleWheel, { passive: false });
    return () => row.removeEventListener("wheel", handleWheel);
  }, [openStage]);

  useEffect(() => {
    if (openStage) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        select(selectedIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        select(selectedIndex + 1);
      } else if (event.key === "Enter" && selectedIndex >= 0) {
        event.preventDefault();
        setOpenStage(SPACES[selectedIndex].stage);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [openStage, select, selectedIndex]);

  if (openStage) {
    const space = SPACES.find((item) => item.stage === openStage) ?? SPACES[0];
    const spaceDrafts = drafts.filter((draft) => draft.productionStage === openStage);

    return <main className={styles.spaceCollection}>
      <header className={styles.spaceCollectionHeader}>
        <button type="button" onClick={() => setOpenStage(null)}>
          <span aria-hidden="true">←</span> Spaces
        </button>
        <div>
          <span>{space.eyebrow}</span>
          <h1>{space.label}</h1>
        </div>
        <p>{spaceDrafts.length} {spaceDrafts.length === 1 ? "video" : "videos"}</p>
      </header>

      {loading && drafts.length === 0 ? (
        <div className={styles.spaceCollectionEmpty}>Loading production spaces…</div>
      ) : spaceDrafts.length > 0 ? (
        <div className={styles.spaceDraftGrid}>
          {spaceDrafts.map((draft) => <button
            type="button"
            className={styles.spaceDraftCard}
            key={draft.id}
            onClick={() => router.push(`/drafts/${draft.id}`)}
          >
            <span className={styles.spaceDraftIcon}><VideoIcon /></span>
            <span className={styles.spaceDraftCopy}>
              <small>{draft.speaker} · {draft.publishingPlatform}</small>
              <strong>{draft.thumbnailHook || draft.scriptHook || `Draft ${draft.id}`}</strong>
            </span>
            <span className={styles.spaceDraftArrow} aria-hidden="true">↗</span>
          </button>)}
        </div>
      ) : (
        <div className={styles.spaceCollectionEmpty}>
          <VideoIcon />
          <strong>Nothing in {space.label} yet</strong>
          <span>Move a finished draft here when it reaches this stage.</span>
        </div>
      )}
    </main>;
  }

  return <main
    className={styles.spacesHub}
    aria-labelledby="spaces-title"
    onPointerMove={(event) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      resolveHover();
    }}
    onPointerLeave={() => {
      pointerRef.current = null;
      setHoveredIndex(null);
    }}
  >
    <h1 id="spaces-title" className={styles.srOnly}>Production spaces</h1>
    <SpaceDust count={70} />
    <SpaceDust count={18} near />
    <div
      ref={rowRef}
      className={styles.spaceSleeves}
      aria-label="Production spaces"
      onScroll={() => requestAnimationFrame(resolveHover)}
    >
      {SPACES.map((space, index) => {
        const selected = index === activeIndex;
        return <button
          ref={(node) => { sleeveRefs.current[index] = node; }}
          type="button"
          key={space.stage}
          className={`${styles.spaceSleeve}${selected ? ` ${styles.spaceSleeveSelected}` : ""}`}
          style={{
            "--space-index": Math.min(index, 14),
            zIndex: 10 + SPACES.length - index,
          } as CSSProperties}
          data-space-index={index}
          aria-current={selected ? "true" : undefined}
          aria-label={`${space.label}, ${counts[index]} ${counts[index] === 1 ? "video" : "videos"}`}
          onFocus={() => {
            setHoveredIndex(null);
            setSelectedIndex(index);
          }}
          onClick={() => {
            setSelectedIndex(index);
            setHoveredIndex(null);
            setOpenStage(space.stage);
          }}
        >
          <span className={styles.spaceSleeveLabel}>
            <strong>{space.label}</strong>
            <small>{counts[index]} {counts[index] === 1 ? "video" : "videos"}</small>
            <span className={styles.spaceSleeveArrow} aria-hidden="true">▸</span>
          </span>
          <span className={styles.spaceCoverViewport}>
            <span className={styles.spaceCover3d}>
              <span className={`${styles.spaceCover} ${space.coverClass}`}>
                <span className={styles.spaceCoverShade} aria-hidden="true" />
                <span className={styles.spaceCoverKicker}>{space.eyebrow}</span>
                <span className={styles.spaceCoverIcon}><VideoIcon /></span>
                <strong>{space.label}</strong>
                <span className={styles.spaceCoverCount}>{String(counts[index]).padStart(2, "0")}</span>
              </span>
              <span className={styles.spaceCoverEdge} aria-hidden="true" />
            </span>
          </span>
        </button>;
      })}
    </div>
    <div className={styles.spaceDeck}>
      <p className={styles.spaceHint}>
        <span aria-hidden="true">← →</span> to browse · click a sleeve to open
      </p>
    </div>
    <p className={styles.spaceCurrent} aria-live="polite">
      {activeIndex >= 0 ? `${SPACES[activeIndex].label} · ${counts[activeIndex]} ${counts[activeIndex] === 1 ? "video" : "videos"}` : ""}
    </p>
  </main>;
}
