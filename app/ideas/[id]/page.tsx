import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, getItem, getItemSections, getItemSources, ITEM_SECTION_DEFINITIONS, ITEM_STAGES, type Post } from "@/lib/db";
import { updateIdea, updateSection } from "../actions";
import { generateShortFormScript, relevantTakes, runConcepts, runDeepResearch, runInterview, saveInterviewAnswers } from "@/app/items/actions";
import { PendingButton } from "@/components/pending-button";
import { SourceReader } from "@/components/ideas/source-reader";

const stageLabel = (stage: string) => stage.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());

const SPEAKERS = [
  { name: "TJ", role: "Builder journal", note: "Process, experiments, and what you are learning." },
  { name: "Brett", role: "Founder POV", note: "Strong market takes grounded in Brett's real experience." },
  { name: "Fonzi", role: "Brand voice", note: "Useful insider clarity, proof first, no founder impersonation." },
] as const;

function fmtCount(n: number | null): string {
  if (n === null || n === undefined) return "–";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Q/A pairs from the interview section's "### Q: …\nA: …" markdown. */
function parseInterview(md: string): { question: string; answer: string }[] | null {
  if (!md.includes("### Q:")) return null;
  const qa = md
    .split(/^### Q:\s*/m)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map(chunk => {
      const lines = chunk.split("\n");
      return {
        question: lines[0]?.trim() ?? "",
        answer: lines.slice(1).join("\n").replace(/^A:\s*/, "").trim(),
      };
    })
    .filter(x => x.question);
  return qa.length ? qa : null;
}

export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  const item = getItem(id);
  if (!item) notFound();
  const sources = getItemSources(id);
  const sections = getItemSections(id);
  const normalizedStage = item.stage === "idea" ? "inbox" : item.stage === "developing" ? "exploring" : item.stage === "scripting" ? "drafting" : item.stage === "production" ? "ready_to_record" : item.stage;

  // linked posts for the performance-context prose
  const postIds = sources.map(s => s.post_id).filter((x): x is number => Boolean(x));
  const linkedPosts = postIds.length
    ? (getDb().prepare(
        `SELECT p.*, src.handle AS handle, src.platform AS src_platform
         FROM posts p LEFT JOIN sources src ON src.id = p.source_id
         WHERE p.id IN (${postIds.map(() => "?").join(",")})`
      ).all(...postIds) as (Post & { handle: string | null; src_platform: string | null })[])
    : [];

  // take-bank suggestions by naive keyword overlap with the source material
  const allSuggestedTakes = await relevantTakes(
    [item.title, item.angle ?? "", ...sources.map(s => `${s.source_title ?? ""} ${s.source_text ?? ""}`)].join(" ")
  );

  const interviewMd = sections["interview"] ?? "";
  const interviewQA = parseInterview(interviewMd);
  const selectedSpeaker = SPEAKERS.find(speaker => speaker.name.toLowerCase() === item.person?.toLowerCase())?.name ?? null;
  const suggestedTakes = selectedSpeaker === "Fonzi"
    ? []
    : allSuggestedTakes.filter(take => {
        const person = take.person?.toLowerCase() ?? "";
        return selectedSpeaker === "TJ"
          ? ["tj", "thomas", "thomas chow"].includes(person)
          : selectedSpeaker === "Brett" && person === "brett";
      });
  const hasResearch = ["source_notes", "agree_disagree", "evidence_questions", "founder_takes", "raw_material"].some(key => Boolean(sections[key]?.trim()));
  const hasDraft = ["concepts", "final_script", "platform_variants"].some(key => Boolean(sections[key]?.trim()));
  const progress = [
    { label: "Source", complete: sources.length > 0 },
    { label: "Speaker", complete: Boolean(selectedSpeaker) },
    { label: "Research", complete: hasResearch },
    { label: "Angle", complete: Boolean(item.angle?.trim()) },
    { label: "Drafts", complete: hasDraft },
  ];
  const activeStep = Math.min(progress.findIndex(step => !step.complete) === -1 ? progress.length - 1 : progress.findIndex(step => !step.complete), progress.length - 1);
  const nextAction = !selectedSpeaker
    ? { href: "#speaker", label: "Choose a speaker" }
    : !hasResearch
      ? { href: "#research", label: "Develop the point of view" }
      : !item.angle?.trim()
        ? { href: "#angle", label: "Set the angle" }
        : { href: "#drafts", label: hasDraft ? "Refine the drafts" : "Generate concepts" };
  const speakerLabel = selectedSpeaker ?? "the speaker";

  return <main className="mx-auto max-w-4xl px-4 py-8 text-[#262522] sm:px-6 sm:py-10">
    <div className="flex items-center justify-between gap-4"><Link href="/ideas" className="text-sm text-[#817e77] hover:text-[#262522]">← Ideas</Link><span className="rounded-full bg-[#f2f0eb] px-3 py-1 text-xs text-[#6f6b64]">{stageLabel(normalizedStage)}</span></div>
    <form action={updateIdea} className="mt-6"><input type="hidden" name="id" value={id} /><input type="hidden" name="angle" value={item.angle ?? ""} /><input type="hidden" name="notes" value={item.notes ?? ""} />
      <input name="title" defaultValue={item.title} aria-label="Title" className="w-full border-0 bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-[#bbb8b0] sm:text-4xl" />

      <nav aria-label="Idea progress" className="mt-7 overflow-x-auto rounded-2xl border border-[#e6e3dc] bg-white p-3 shadow-[0_1px_2px_rgba(38,37,34,0.04)]">
        <ol className="flex min-w-[560px] items-center">{progress.map((step, index) => <li key={step.label} className="flex flex-1 items-center last:flex-none">
          <div className="flex items-center gap-2"><span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${step.complete ? "bg-[#262522] text-white" : index === activeStep ? "border-2 border-[#262522] bg-white" : "bg-[#efede8] text-[#918d85]"}`}>{step.complete ? "✓" : index + 1}</span><span className={`text-xs font-medium ${index === activeStep || step.complete ? "text-[#262522]" : "text-[#99958d]"}`}>{step.label}</span></div>
          {index < progress.length - 1 && <span className={`mx-3 h-px flex-1 ${step.complete ? "bg-[#262522]" : "bg-[#e4e1da]"}`} />}
        </li>)}</ol>
      </nav>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f7f6f3] p-4"><div><p className="text-xs font-medium uppercase tracking-[.12em] text-[#8f8b83]">Up next</p><p className="mt-1 text-sm font-medium">{nextAction.label}</p></div><a href={nextAction.href} className="rounded-full bg-[#262522] px-5 py-2.5 text-sm font-medium text-white">Continue</a></div>

      <section id="speaker" className="mt-10 scroll-mt-6"><p className="text-xs font-medium uppercase tracking-[.14em] text-[#99958d]">Speaker</p><h2 className="mt-2 text-xl font-semibold">Who is telling this story?</h2><p className="mt-1 text-sm text-[#7c7972]">This controls the beliefs, source material, and writing skill used later.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">{SPEAKERS.map(speaker => <label key={speaker.name} className="group cursor-pointer"><input type="radio" name="person" value={speaker.name} defaultChecked={selectedSpeaker === speaker.name} className="peer sr-only" /><span className="block min-h-32 rounded-2xl border border-[#e3e0d9] bg-white p-4 transition peer-checked:border-[#262522] peer-checked:bg-[#f7f6f3] peer-checked:shadow-[inset_0_0_0_1px_#262522] group-hover:border-[#aaa69d]"><span className="flex items-center justify-between"><span className="font-semibold">{speaker.name}</span><span className="size-4 rounded-full border border-[#c9c5bc] bg-white peer-checked:border-[#262522]" /></span><span className="mt-2 block text-xs font-medium text-[#6f6b64]">{speaker.role}</span><span className="mt-1 block text-xs leading-5 text-[#8a8780]">{speaker.note}</span></span></label>)}</div>
        {!selectedSpeaker && item.person && <p className="mt-2 text-xs text-[#9a6d2f]">“{item.person}” is a legacy value. Choose one of the three supported speakers.</p>}
      </section>

      <details className="mt-8 rounded-xl border border-[#e6e3dc] bg-[#faf9f7]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">More details <span className="ml-1 text-xs font-normal text-[#8a8780]">stage, owner, format, platform</span></summary>
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-[#e6e3dc] p-4 sm:grid-cols-3">
        <Field label="Stage"><select name="stage" defaultValue={normalizedStage} className="w-full rounded-md border border-[#dedbd4] bg-white px-2.5 py-2 text-sm">{ITEM_STAGES.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}</select></Field>
        <Field label="Owner"><input name="owner" defaultValue={item.owner ?? ""} placeholder="Unassigned" className="w-full rounded-md border border-[#dedbd4] bg-white px-2.5 py-2 text-sm" /></Field>
        <Field label="Content lane"><input name="lane" defaultValue={item.lane ?? ""} placeholder="Lane" className="w-full rounded-md border border-[#dedbd4] bg-white px-2.5 py-2 text-sm" /></Field>
        <Field label="Format"><input name="format" defaultValue={item.format ?? ""} placeholder="Short video, post…" className="w-full rounded-md border border-[#dedbd4] bg-white px-2.5 py-2 text-sm" /></Field>
        <Field label="Platform"><input name="target_platform" defaultValue={item.target_platform ?? ""} placeholder="X, LinkedIn…" className="w-full rounded-md border border-[#dedbd4] bg-white px-2.5 py-2 text-sm" /></Field>
        </div>
      </details>
      <button className="mt-3 rounded-full border border-[#d7d3ca] bg-white px-4 py-2 text-sm font-medium hover:bg-[#f7f6f3]">Save idea setup</button>
    </form>

    <section className="mt-12"><p className="text-xs font-medium uppercase tracking-[.14em] text-[#99958d]">1 · Read</p><h2 className="mt-2 text-xl font-semibold">Understand the inspiration first</h2><p className="mt-1 text-sm text-[#7c7972]">Read or watch the complete source before deciding what {speakerLabel} should say.</p>
      <div className="mt-5 space-y-4">{sources.map(source => <SourceReader key={source.id} url={source.url} title={source.source_title ?? source.url ?? "Attached source"} text={source.source_text} />)}</div>
    </section>

    <details className="mt-8 rounded-xl border border-[#e6e3dc]"><summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium">Source details <span className="ml-1 text-xs font-normal text-[#8a8780]">{sources.length} attached</span></summary><section className="border-t border-[#e6e3dc] p-5"><p className="text-sm text-[#7c7972]">The references behind the idea stay attached to the final result.</p>
      <div className="mt-4 space-y-3">{sources.length ? sources.map(source => {
        const thumb = source.thumb_path ? `/api/media/${source.thumb_path}` : source.media_url?.startsWith("http") ? source.media_url : null;
        return <div key={source.id} className="overflow-hidden rounded-lg border border-[#e6e3dc]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumb && <img src={thumb} alt={source.source_title ?? "source media"} className="max-h-96 w-full object-cover" />}
          <div className="p-4">
            <div className="text-xs font-medium uppercase tracking-[.1em] text-[#96928a]">{source.source_type ?? (source.gather_save_id ? "Saved by me" : "Creative Feed")}</div>
            <div className="mt-1 text-sm font-medium">{source.source_title ?? source.url ?? "Attached source"}</div>
            {source.source_text && <p className="mt-2 whitespace-pre-wrap text-sm text-[#65625c]">{source.source_text}</p>}
            {source.why_it_worked && <p className="mt-2 text-sm text-[#65625c]"><span className="font-medium">Why it worked:</span> {source.why_it_worked}</p>}
            {source.saved_note && <p className="mt-2 text-sm text-[#65625c]"><span className="font-medium">My saved note:</span> {source.saved_note}</p>}
            {source.url && <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-[#817e77] underline hover:text-[#262522]">Open original ↗</a>}
          </div>
        </div>;
      }) : <div className="rounded-lg border border-dashed border-[#dcd8cf] p-5 text-sm text-[#85827b]">No source attached. Original ideas can start here too.</div>}</div>
    </section></details>

    {linkedPosts.length > 0 && <details className="mt-4 rounded-xl border border-[#e6e3dc]"><summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium">Performance context</summary><section className="border-t border-[#e6e3dc] p-5">
      <div className="mt-3 space-y-2">{linkedPosts.map(p => {
        const saves = p.bookmarks ?? 0;
        const pct = p.save_rate !== null ? `${(p.save_rate * 100).toFixed(1)}% of viewers saved it` : null;
        return <p key={p.id} className="text-sm leading-6 text-[#65625c]">
          Posted by @{p.handle ?? "unknown"} on {p.src_platform ?? "x"}{p.posted_at ? ` on ${p.posted_at.slice(0, 10)}` : ""}. It reached {fmtCount(p.impressions)} people and {fmtCount(saves)} of them saved it{pct ? ` (${pct})` : ""}{p.baseline_multiple !== null ? ` — ${p.baseline_multiple.toFixed(1)}x what this account usually gets` : ""}.
        </p>;
      })}</div>
    </section></details>}

    <section className="mt-12">
      <p className="text-xs font-medium uppercase tracking-[.14em] text-[#99958d]">2 · Ground</p><h2 className="mt-2 text-xl font-semibold">Founder takes we can actually use</h2>
      <p className="mt-1 text-sm text-[#7c7972]">{selectedSpeaker === "Fonzi" ? "Fonzi uses approved brand beliefs, not a founder's personal take." : selectedSpeaker ? `Showing only approved ${selectedSpeaker} takes matched to this idea.` : "Choose a speaker first. Takes never cross between people."}</p>
      {suggestedTakes.length ? <ul className="mt-3 space-y-2">{suggestedTakes.map((t, i) => <li key={i} className="rounded-lg border border-[#e6e3dc] p-3 text-sm">
        <span className="text-xs font-medium uppercase tracking-[.1em] text-[#96928a]">{t.person ?? "?"}{t.topic ? ` · ${t.topic}` : ""}</span>
        <p className="mt-1 text-[#65625c]">{t.take}</p>
      </li>)}</ul> : <div className="mt-4 rounded-lg border border-dashed border-[#dcd8cf] p-4 text-sm text-[#85827b]">{selectedSpeaker === "Fonzi" ? "Use verified company evidence and the brand knowledge base for this idea." : selectedSpeaker ? `No matching approved ${selectedSpeaker} take was found. Use the interview below to develop one instead of inventing an angle.` : "Select TJ, Brett, or Fonzi above to load the right grounding."}</div>}
    </section>

    <section id="research" className="mt-12 scroll-mt-6 rounded-2xl bg-[#f7f6f3] p-5 sm:p-7">
      <p className="text-xs font-medium uppercase tracking-[.14em] text-[#99958d]">3 · Think</p><h2 className="mt-2 text-xl font-semibold">Brain dump first</h2><p className="mt-1 text-sm text-[#7c7972]">Drop rough reactions, half-formed opinions, quotes, and rabbit holes here. This becomes the human context behind the script.</p>
      <form action={updateSection} className="mt-5 rounded-xl border border-[#d9d5cc] bg-white p-4 shadow-[0_1px_2px_rgba(38,37,34,0.03)]">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="section" value="raw_material" />
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Open canvas</h3><p className="mt-1 text-xs text-[#8a8780]">No format needed. Write what you think, what feels off, and what you want to chase.</p></div><button className="rounded-md bg-[#262522] px-4 py-2 text-xs font-medium text-white">Save brain dump</button></div>
        <textarea name="content" defaultValue={sections.raw_material ?? ""} rows={12} placeholder="Start anywhere…" className="mt-4 w-full resize-y border-0 bg-transparent text-sm leading-7 outline-none placeholder:text-[#bbb8b1]" />
      </form>
      <div className="mt-7 flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-base font-semibold">Structure the useful parts</h3><p className="mt-1 text-xs text-[#8a8780]">Pull out the claim, disagreement, evidence, and real {speakerLabel} take.</p></div><form action={runDeepResearch}><input type="hidden" name="item_id" value={id} /><PendingButton pendingLabel="researching… (up to 2 min)" className="rounded-md border border-[#cfcac0] bg-white px-4 py-2 text-xs font-medium hover:bg-[#faf9f7]">Research this idea</PendingButton></form></div>
      <div className="mt-5 space-y-4">{ITEM_SECTION_DEFINITIONS.filter(def => ["source_notes", "agree_disagree", "evidence_questions", "founder_takes"].includes(def.key)).map(def => <form action={updateSection} key={def.key} className="rounded-xl border border-[#e3e0d9] bg-white p-4">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="section" value={def.key} /><div className="flex justify-between gap-4"><div><h3 className="text-sm font-semibold">{def.label}</h3><p className="mt-1 text-xs text-[#8a8780]">{def.hint}</p></div><button className="h-fit rounded-md border border-[#dedbd4] px-3 py-1.5 text-xs">Save</button></div><textarea name="content" defaultValue={sections[def.key] ?? ""} rows={5} placeholder="Write what you actually think…" className="mt-3 w-full resize-y border-0 bg-transparent text-sm leading-6 outline-none placeholder:text-[#bbb8b1]" />
      </form>)}</div>
      <form action={updateSection} className="mt-4 rounded-xl border border-[#d6d2c9] bg-[#fbfaf8] p-4">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="section" value="research_dossier" /><div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold">Research dossier</h3><p className="mt-1 text-xs text-[#8a8780]">Generated evidence, counterpoints, open questions, and story paths. Keep only what survives review.</p></div><button className="rounded-md border border-[#d7d3ca] bg-white px-3 py-1.5 text-xs">Save edits</button></div><textarea name="content" defaultValue={sections.research_dossier ?? ""} rows={12} placeholder="Research results will land here…" className="mt-3 w-full resize-y border-0 bg-transparent text-sm leading-6 outline-none placeholder:text-[#bbb8b1]" />
      </form>
    </section>

    <form id="angle" action={updateIdea} className="mt-12 scroll-mt-6 rounded-2xl border border-[#dcd8cf] p-5 sm:p-7"><input type="hidden" name="id" value={id} /><input type="hidden" name="title" value={item.title} /><input type="hidden" name="stage" value={normalizedStage} /><input type="hidden" name="person" value={selectedSpeaker ?? ""} /><input type="hidden" name="owner" value={item.owner ?? ""} /><input type="hidden" name="lane" value={item.lane ?? ""} /><input type="hidden" name="format" value={item.format ?? ""} /><input type="hidden" name="target_platform" value={item.target_platform ?? ""} />
      <p className="text-xs font-medium uppercase tracking-[.14em] text-[#99958d]">4 · Angle</p><h2 className="mt-2 text-xl font-semibold">What can {speakerLabel} uniquely say?</h2><p className="mt-1 text-sm text-[#7c7972]">The angle should connect a real belief, experience, or verified fact to the source, not merely summarize it.</p>
      <textarea name="angle" defaultValue={item.angle ?? ""} rows={5} placeholder="Our claim, why we believe it, and what changes for the audience…" className="mt-5 w-full resize-y rounded-lg border border-[#e3e0d9] px-3 py-2.5 text-sm outline-none focus:border-[#aaa69d]" /><label className="mt-4 block text-xs font-medium uppercase tracking-[.12em] text-[#8a8780]">Working notes</label><textarea name="notes" defaultValue={item.notes ?? ""} rows={3} placeholder="Constraints, next move, people or sources to consult…" className="mt-2 w-full resize-y rounded-lg border border-[#e3e0d9] px-3 py-2.5 text-sm outline-none focus:border-[#aaa69d]" /><button className="mt-3 rounded-md bg-[#262522] px-4 py-2 text-sm text-white">Save angle</button>
    </form>

    <section id="interview" className="mt-12 scroll-mt-6 rounded-xl border border-[#e6e3dc] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Develop the {speakerLabel} take</h2>
          <p className="mt-1 text-xs text-[#8a8780]">Five pointed questions built from this item&apos;s material. Answer them yourself or use them in a real conversation with {speakerLabel}.</p>
        </div>
        <form action={runInterview}>
          <input type="hidden" name="item_id" value={id} />
          <PendingButton pendingLabel="writing questions… (up to 2 min)" className="rounded-md bg-[#262522] px-4 py-2 text-sm text-white">
            {interviewMd ? "Redo questions" : "Write questions"}
          </PendingButton>
        </form>
      </div>
      {interviewQA ? <form action={saveInterviewAnswers} className="mt-5 space-y-5">
        <input type="hidden" name="item_id" value={id} />
        {interviewQA.map((qa, i) => <div key={i}>
          <input type="hidden" name={`q_${i}`} value={qa.question} />
          <p className="text-sm font-medium">{i + 1}. {qa.question}</p>
          <textarea name={`a_${i}`} defaultValue={qa.answer} rows={3} placeholder="Your actual take…" className="mt-2 w-full resize-y rounded-lg border border-[#e3e0d9] px-3 py-2.5 text-sm outline-none focus:border-[#aaa69d]" />
        </div>)}
        <button className="rounded-md border border-[#dedbd4] px-3 py-1.5 text-xs hover:bg-[#f7f6f3]">Save answers</button>
      </form> : interviewMd ? <p className="mt-4 whitespace-pre-wrap text-sm text-[#65625c]">{interviewMd}</p> : null}
    </section>

    <section id="drafts" className="mt-5 scroll-mt-6 rounded-xl border border-[#e6e3dc] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Generate {speakerLabel} concepts</h2>
          <p className="mt-1 text-xs text-[#8a8780]">3-5 directions grounded only in this item&apos;s source, brain dump, research, and approved takes. The strongest direction is marked.</p>
        </div>
        <form action={runConcepts}>
          <input type="hidden" name="item_id" value={id} />
          <PendingButton pendingLabel="generating… (up to 2 min)" className="rounded-md bg-[#262522] px-4 py-2 text-sm text-white">
            Generate concepts
          </PendingButton>
        </form>
      </div>
    </section>

    <section className="mt-5 rounded-xl border border-[#282724] bg-[#282724] p-5 text-white sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[.14em] text-[#aaa69e]">5 · Script</p><h2 className="mt-2 text-lg font-semibold">Turn the winner into a short-form script</h2><p className="mt-1 max-w-xl text-xs leading-5 text-[#bdb9b0]">Uses the source, your notes, research, interview answers, and concepts. Nothing is approved until you edit and save the final script below.</p></div><form action={generateShortFormScript}><input type="hidden" name="item_id" value={id} /><PendingButton pendingLabel="writing script… (up to 2 min)" className="rounded-md bg-white px-4 py-2 text-sm font-medium text-[#262522]">Generate short-form script</PendingButton></form></div>
    </section>

    <form action={updateSection} className="mt-5 rounded-xl border border-[#d8d4cb] bg-white p-5 shadow-[0_1px_2px_rgba(38,37,34,0.04)]">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="section" value="final_script" />
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold">Final script</h2><p className="mt-1 text-xs text-[#8a8780]">Edit the generated draft here. Save only the version you would actually put in front of {speakerLabel}.</p></div><button className="rounded-md bg-[#262522] px-4 py-2 text-xs font-medium text-white">Save script</button></div>
      <textarea name="content" defaultValue={sections.final_script ?? ""} rows={18} placeholder="Your record-ready script will land here…" className="mt-4 w-full resize-y border-0 bg-transparent text-sm leading-7 outline-none placeholder:text-[#bbb8b1]" />
    </form>

    <section className="mt-12 space-y-5">{ITEM_SECTION_DEFINITIONS.filter(def => !["source_notes", "agree_disagree", "evidence_questions", "founder_takes", "raw_material", "final_script"].includes(def.key)).map(def => <form action={updateSection} key={def.key} className="rounded-xl border border-[#e6e3dc] bg-white p-5">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="section" value={def.key} />
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold">{def.label}</h2><p className="mt-1 text-xs text-[#8a8780]">{def.hint}</p></div><button className="rounded-md border border-[#dedbd4] px-3 py-1.5 text-xs hover:bg-[#f7f6f3]">Save</button></div>
      <textarea name="content" defaultValue={sections[def.key] ?? ""} rows={7} placeholder="Start writing…" className="mt-4 w-full resize-y border-0 bg-transparent text-sm leading-6 outline-none placeholder:text-[#bbb8b1]" />
    </form>)}</section>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs text-[#7d7972]">{label}</span>{children}</label>;
}
