"use client";

import { useDeferredValue, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { useRouter } from "next/navigation";
import { MarkdownPageEditor } from "./markdown-page-editor";

type DomainId = "identity" | "audience" | "voice" | "proof" | "workflow" | "creative";
type Point = { x: number; y: number };
type Domain = { id: DomainId; label: string; position: Point };
type Memory = { id: string; domain: DomainId; title: string; body: string; source: string; position: Point; fileId: string };
export type CustomMemoryFile = { id: string; domain: DomainId; title: string; excerpt: string; source: string };

const DOMAINS: readonly Domain[] = [
  { id: "identity", label: "Identity", position: { x: 0, y: -330 } },
  { id: "audience", label: "Audience", position: { x: 390, y: -190 } },
  { id: "proof", label: "Proof", position: { x: 390, y: 210 } },
  { id: "workflow", label: "Workflow", position: { x: 0, y: 390 } },
  { id: "creative", label: "Creative", position: { x: -390, y: 210 } },
  { id: "voice", label: "Voice", position: { x: -390, y: -190 } },
] as const;

const MEMORIES: readonly Memory[] = [
  { id: "mission", domain: "identity", title: "Mission", body: "Route talent to the work where they can create the most value.", source: "Fonzi context · Mission", position: { x: -170, y: -520 }, fileId: "custom:identity:fonzi-positioning.md" },
  { id: "category", domain: "identity", title: "Category frame", body: "A persistent, plugged-in talent agent and career-intelligence product, not a job board.", source: "Fonzi context · Positioning", position: { x: 175, y: -535 }, fileId: "custom:identity:fonzi-positioning.md" },
  { id: "talent", domain: "audience", title: "Talent ICP", body: "Restless Builders and Invisible Experts who want market intelligence, better work, and access without repeatedly applying.", source: "Fonzi ICP · Talent", position: { x: 650, y: -330 }, fileId: "custom:audience:fonzi-icp.md" },
  { id: "companies", domain: "audience", title: "Company ICP", body: "Technical founders and hiring leaders seeking strong off-market engineers their normal workflow misses.", source: "Fonzi ICP · Companies", position: { x: 710, y: -80 }, fileId: "custom:audience:fonzi-icp.md" },
  { id: "proof-contract", domain: "proof", title: "Proof contract", body: "Every number needs a source, as-of date, denominator, and publication permission.", source: "Fonzi context · Proof", position: { x: 710, y: 120 }, fileId: "custom:proof:fonzi-proof-rules.md" },
  { id: "data-moat", domain: "proof", title: "Highest-moat lane", body: "Verified salary-bid patterns, ranges, and market movement are the strongest proof lane.", source: "Fonzi context · Evidence", position: { x: 650, y: 390 }, fileId: "custom:proof:fonzi-proof-rules.md" },
  { id: "cova-loop", domain: "workflow", title: "Content loop", body: "Discover → Select → Ground → Create → Produce → Repurpose → Publish → Learn.", source: "Fonzi context · Workflow", position: { x: 180, y: 610 }, fileId: "custom:workflow:content-operating-loop.md" },
  { id: "memory-loop", domain: "workflow", title: "Learning loop", body: "Human feedback and published performance improve the context used next time.", source: "Fonzi context · Learning", position: { x: -180, y: 620 }, fileId: "custom:workflow:content-operating-loop.md" },
  { id: "pattern-remix", domain: "creative", title: "Pattern remix", body: "Reuse creative constraints, never wording or beat-by-beat structure.", source: "Fonzi context · Creative", position: { x: -690, y: 390 }, fileId: "custom:creative:creative-principles.md" },
  { id: "creative-control", domain: "creative", title: "Creative control", body: "AI removes friction. Humans retain taste, opinion, story, and approval.", source: "Fonzi context · Creative", position: { x: -710, y: 105 }, fileId: "custom:creative:creative-principles.md" },
  { id: "brand-voice", domain: "voice", title: "Brand voice", body: "The elegant researcher who's based. Truth first, then voice, then platform.", source: "Fonzi context · Voice", position: { x: -710, y: -80 }, fileId: "custom:voice:fonzi-voice-system.md" },
  { id: "voice-lines", domain: "voice", title: "Voice separation", body: "Thomas, Brett, Seb, and Fonzi stay distinct. Never blend voices silently.", source: "Fonzi context · Speakers", position: { x: -650, y: -340 }, fileId: "custom:voice:fonzi-voice-system.md" },
] as const;

const DOMAIN_LOOKUP = new Map(DOMAINS.map((domain) => [domain.id, domain]));
const MIN_ZOOM = 0.38;
const MAX_ZOOM = 1.8;

export function MemoryGraph({ customFiles = [] }: { customFiles?: readonly CustomMemoryFile[] }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; origin: Point; start: Point } | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.82);
  const [activeDomain, setActiveDomain] = useState<DomainId | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<string | null>(null);
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const representedFileIds = new Set(MEMORIES.map((memory) => memory.fileId));
  const unrepresentedFiles = customFiles.filter((file) => !representedFileIds.has(file.id));
  const customMemories: Memory[] = unrepresentedFiles.map((file, index) => ({ id: `file-${file.id}`, domain: file.domain, title: file.title, body: file.excerpt || "Open this Markdown branch.", source: file.source, position: customPosition(file.domain, unrepresentedFiles.slice(0, index).filter((item) => item.domain === file.domain).length), fileId: file.id }));
  const allMemories = [...MEMORIES, ...customMemories];

  function resetView() {
    setPan({ x: 0, y: 0 });
    setZoom(0.82);
    setActiveDomain(null);
    setSelectedMemory(null);
  }

  function zoomBy(multiplier: number) {
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * multiplier)));
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const pointer = { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 };
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-event.deltaY * 0.0012)));
    const worldPoint = { x: (pointer.x - pan.x) / zoom, y: (pointer.y - pan.y) / zoom };
    setPan({ x: pointer.x - worldPoint.x * nextZoom, y: pointer.y - worldPoint.y * nextZoom });
    setZoom(nextZoom);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, origin: pan, start: { x: event.clientX, y: event.clientY } };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({ x: drag.origin.x + event.clientX - drag.start.x, y: drag.origin.y + event.clientY - drag.start.y });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function matches(memory: Memory) {
    return !deferredQuery || `${memory.title} ${memory.body} ${memory.source}`.toLowerCase().includes(deferredQuery);
  }

  async function createMemory() {
    if (!activeDomain || !newTitle.trim()) return;
    setCreateError(null);
    const response = await fetch("/api/memory-file", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: activeDomain, title: newTitle.trim() }) });
    if (!response.ok) { setCreateError("Could not create this Markdown file."); return; }
    const created = await response.json() as { id: string };
    setCreating(false);
    setNewTitle("");
    router.refresh();
    setOpenFileId(created.id);
  }

  return (
    <>
    <section className="overflow-hidden rounded-3xl border border-neutral-800 bg-[#101112] text-neutral-100 shadow-2xl shadow-black/30">
      <header className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-7">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-lime-300/70">operating memory</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">Fonzi memory map</h1>
          <p className="mt-1 text-sm text-neutral-400">Every bubble is a branch. Drag to explore and scroll to zoom.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="memory-search">Search memory</label>
          <input id="memory-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a memory" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-lime-300/40 lg:w-60" />
          <button type="button" onClick={resetView} className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-400 transition hover:border-white/20 hover:text-white">Center</button>
        </div>
      </header>

      <div ref={canvasRef} className="memory-canvas relative h-[calc(100vh-185px)] min-h-[640px] cursor-grab touch-none overflow-hidden active:cursor-grabbing" style={{ backgroundPosition: `${pan.x}px ${pan.y}px`, backgroundSize: `${22 * zoom}px ${22 * zoom}px` }} onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
        <div className="pointer-events-none absolute left-1/2 top-1/2" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` }}>
          <div className="absolute left-0 top-0" style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
            <svg aria-hidden="true" className="absolute overflow-visible" width="1" height="1">
              {DOMAINS.map((domain) => <line key={domain.id} x1="0" y1="0" x2={domain.position.x} y2={domain.position.y} stroke={activeDomain === null || activeDomain === domain.id ? "rgba(214,255,70,.32)" : "rgba(255,255,255,.06)"} strokeWidth="1.5" />)}
              {allMemories.map((memory) => {
                const domain = DOMAIN_LOOKUP.get(memory.domain)!;
                const visible = matches(memory) && (activeDomain === null || activeDomain === memory.domain);
                return <line key={memory.id} x1={domain.position.x} y1={domain.position.y} x2={memory.position.x} y2={memory.position.y} stroke={visible ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.035)"} strokeWidth="1" />;
              })}
            </svg>

            <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => { setActiveDomain(null); setSelectedMemory(null); }} className="pointer-events-auto absolute left-0 top-0 z-20 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-lime-100/50 bg-[radial-gradient(circle_at_50%_45%,#dfff36_0%,#d2f42d_24%,#e6e8de_62%,#7c7d79_100%)] shadow-[0_0_65px_rgba(211,255,47,.24)] transition hover:scale-105">
              <span className="text-center text-[11px] font-bold uppercase leading-tight tracking-[0.14em] text-neutral-900">Fonzi<br />memory</span>
            </button>

            {DOMAINS.map((domain) => {
              const isActive = activeDomain === null || activeDomain === domain.id;
              return <button key={domain.id} type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => { setActiveDomain(activeDomain === domain.id ? null : domain.id); setSelectedMemory(null); }} aria-pressed={activeDomain === domain.id} style={{ left: domain.position.x, top: domain.position.y }} className={`pointer-events-auto absolute z-20 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-full border text-center backdrop-blur transition ${activeDomain === domain.id ? "border-lime-300/60 bg-lime-300/15 text-lime-100 shadow-[0_0_40px_rgba(211,255,47,.13)]" : "border-white/12 bg-[#1c1d1e]/95 text-neutral-300"} ${isActive ? "opacity-100" : "opacity-25 hover:opacity-70"}`}>
                <MemoryIcon id={domain.id} />
                <span className="text-xs font-medium">{domain.label}</span>
                <span className="text-[9px] text-neutral-600">{allMemories.filter((memory) => memory.domain === domain.id).length} branches</span>
              </button>;
            })}

            {allMemories.map((memory) => {
              const visible = matches(memory) && (activeDomain === null || activeDomain === memory.domain);
              const isSelected = selectedMemory === memory.id;
              return <button key={memory.id} type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => { setSelectedMemory(memory.id); setActiveDomain(memory.domain); setOpenFileId(memory.fileId); }} style={{ left: memory.position.x, top: memory.position.y }} className={`pointer-events-auto absolute z-10 w-56 -translate-x-1/2 -translate-y-1/2 rounded-[28px] border px-5 py-4 text-left backdrop-blur-xl transition ${isSelected ? "border-lime-300/55 bg-[#292c24]/95 shadow-[0_0_35px_rgba(211,255,47,.1)]" : "border-white/10 bg-[#1b1c1d]/92 hover:border-white/25 hover:bg-[#222324]"} ${visible ? "opacity-100" : "pointer-events-none opacity-10"}`}>
                <span className="block text-[9px] uppercase tracking-[0.16em] text-neutral-500">{DOMAIN_LOOKUP.get(memory.domain)?.label}</span>
                <span className="mt-1 block text-sm font-medium text-neutral-200">{memory.title}</span>
                <span className="mt-2 block text-[11px] leading-4 text-neutral-500">{memory.body}</span>
              </button>;
            })}
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-40 flex items-center gap-1 rounded-2xl border border-white/10 bg-[#18191a]/90 p-1.5 shadow-xl backdrop-blur">
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomBy(1.18)} aria-label="Zoom in" className="grid h-9 w-9 place-items-center rounded-xl text-lg text-neutral-300 hover:bg-white/7">+</button>
          <span className="w-12 text-center text-[10px] text-neutral-500">{Math.round(zoom * 100)}%</span>
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomBy(0.84)} aria-label="Zoom out" className="grid h-9 w-9 place-items-center rounded-xl text-lg text-neutral-300 hover:bg-white/7">−</button>
        </div>

        {activeDomain ? <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setCreating(true)} className="absolute right-4 top-4 z-40 rounded-xl border border-lime-300/25 bg-[#1b211b]/95 px-4 py-2 text-xs font-medium text-lime-200 shadow-xl backdrop-blur hover:border-lime-300/50">+ Add markdown to {DOMAIN_LOOKUP.get(activeDomain)?.label}</button> : null}

      </div>
    </section>
    {openFileId ? <MarkdownPageEditor fileId={openFileId} onClose={() => setOpenFileId(null)} /> : null}
    {creating && activeDomain ? <div className="fixed inset-0 z-[110] grid place-items-center bg-black/70 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create Markdown memory">
      <form onSubmit={(event) => { event.preventDefault(); void createMemory(); }} className="w-full max-w-md rounded-2xl bg-[#f7f6f2] p-6 text-[#292824] shadow-2xl">
        <p className="text-[10px] uppercase tracking-[0.16em] text-black/35">New {DOMAIN_LOOKUP.get(activeDomain)?.label} branch</p>
        <h2 className="mt-2 text-xl font-semibold">Create a Markdown page</h2>
        <label htmlFor="new-memory-title" className="mt-6 block text-xs text-black/45">Page title</label>
        <input id="new-memory-title" autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Untitled memory" className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#2a8864]" />
        {createError ? <p className="mt-3 text-xs text-red-700">{createError}</p> : null}
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => { setCreating(false); setCreateError(null); }} className="rounded-lg px-4 py-2 text-sm text-black/45 hover:bg-black/5">Cancel</button><button type="submit" disabled={!newTitle.trim()} className="rounded-lg bg-[#2a8864] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Create page</button></div>
      </form>
    </div> : null}
    </>
  );
}

function customPosition(domainId: DomainId, index: number): Point {
  const domain = DOMAIN_LOOKUP.get(domainId)!;
  const length = Math.hypot(domain.position.x, domain.position.y) || 1;
  const outward = { x: domain.position.x / length, y: domain.position.y / length };
  const side = { x: -outward.y, y: outward.x };
  const row = Math.floor(index / 3);
  const offset = (index % 3 - 1) * 250;
  const distance = 360 + row * 230;
  return { x: domain.position.x + outward.x * distance + side.x * offset, y: domain.position.y + outward.y * distance + side.y * offset };
}

function MemoryIcon({ id }: { id: DomainId }) {
  const paths: Record<DomainId, React.ReactNode> = {
    identity: <><circle cx="12" cy="8" r="3" /><path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" /></>,
    audience: <><circle cx="8" cy="9" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M2.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6M14 15c3.7-.5 6 1.2 6.8 5" /></>,
    voice: <><path d="M5 6h14v10H10l-5 4V6Z" /><path d="M9 10h6M9 13h4" /></>,
    proof: <><path d="M5 20V10M12 20V4M19 20v-7" /><path d="M3 20h18" /></>,
    workflow: <><path d="M7 7h10v10H7z" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /></>,
    creative: <><path d="M9 18h6M10 22h4" /><path d="M8 15c-2-1.4-3-3.4-3-5.5a7 7 0 0 1 14 0c0 2.1-1 4.1-3 5.5-.8.6-1 1.4-1 3H9c0-1.6-.2-2.4-1-3Z" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[id]}</svg>;
}
