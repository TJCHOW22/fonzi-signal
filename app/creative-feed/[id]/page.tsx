import Link from "next/link";
import { notFound } from "next/navigation";
import { developThis, notForUs, saveAsIdea } from "@/app/actions";
import { MediaViewer } from "@/components/creative-detail/media-viewer";
import { BookmarkIcon, CommentIcon, ExternalIcon, EyeIcon, HeartIcon, ShareAction } from "@/components/creative-detail/social-actions";
import { Caption, CreatorHeader, InsightDisclosure, MetricGrid, originalLabel } from "@/components/creative-detail/social-post";
import { PendingButton } from "@/components/pending-button";
import { getDb, type Post } from "@/lib/db";

export const dynamic = "force-dynamic";
type DetailPost = Post & { handle:string|null; display_name:string|null; platform:string|null; archetype:string|null; why_we_watch:string|null; gather_id:string|null; gather_notes:string|null; gather_tags:string|null; item_id:number|null };
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const metric = (value:number|null) => value === null ? "Not captured" : compact.format(value);
const pct = (value:number|null) => value === null ? "Not captured" : `${(value * 100).toFixed(2)}%`;
function date(value:string|null) { if (!value) return "Time not captured"; const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed); }
function parseScores(value:string|null):Array<[string,string]> { if (!value) return []; try { const parsed:unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.entries(parsed).map(([key, item]) => [key.replaceAll("_", " "), String(item)]) : []; } catch { return []; } }

export default async function Page({ params }: { params:Promise<{id:string}> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  const post = getDb().prepare(`SELECT p.*,s.handle,s.display_name,s.platform,s.archetype,s.why_we_watch,g.id AS gather_id,g.notes AS gather_notes,g.tags AS gather_tags,(SELECT item_id FROM item_sources WHERE post_id=p.id LIMIT 1) AS item_id FROM posts p LEFT JOIN sources s ON s.id=p.source_id LEFT JOIN gather_saves g ON g.matched_post_id=p.id AND g.hidden=0 WHERE p.id=? LIMIT 1`).get(id) as DetailPost|undefined;
  if (!post) notFound();

  const poster = post.thumb_path ? `/api/media/${post.thumb_path}` : null;
  const creatorName = post.display_name || (post.handle ? `@${post.handle}` : "Unknown creator");
  const handle = post.handle ? `@${post.handle}` : null;
  const saved = Boolean(post.gather_id);
  const baseline = post.baseline_multiple === null ? null : `${post.baseline_multiple.toFixed(1)}× baseline`;
  const sourceLabel = originalLabel(post.platform);
  const scores = parseScores(post.fit_subscores);
  const avatarUrl = post.handle ? `https://unavatar.io/${post.platform?.toLowerCase()==="instagram"?"instagram":"x"}/${encodeURIComponent(post.handle)}` : null;
  const isTextOnlyX = ["x", "twitter"].includes(post.platform?.toLowerCase() ?? "") && !post.media_url && !poster;

  return <main className="min-h-screen bg-black px-3 py-5 text-white sm:px-6 sm:py-8"><div className="mx-auto max-w-[820px]"><article className="overflow-hidden rounded-[28px] border border-[#343434] bg-[#101010] shadow-[0_22px_70px_rgba(0,0,0,.4)]">
          <div className="flex items-center justify-between px-5 py-5 sm:px-6"><Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-lg text-lg font-bold text-[#f4f4f4] outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-[#a98cff]"><span aria-hidden="true">←</span> Creative detail</Link>{baseline?<span className="rounded-full bg-[#46200d] px-4 py-2 text-sm font-bold text-[#ffc7a4]">🔥 {baseline}</span>:null}</div>
          <CreatorHeader name={creatorName} handle={handle} platform={post.platform} timestamp={date(post.posted_at)} badge={baseline ? "Outlier" : null} avatarUrl={avatarUrl} />
          {isTextOnlyX ? <section aria-label="Text post" className="border-t border-[#292929] px-5 py-6 sm:px-6 sm:py-8"><p className="whitespace-pre-wrap text-[18px] leading-7 text-[#f2f2f2] sm:text-[22px] sm:leading-8">{post.text || "The original post text was not captured."}</p></section> : <section aria-label="Creative" className="overflow-hidden bg-black"><MediaViewer mediaType={post.media_type} mediaUrl={post.media_url} posterUrl={poster} alt={`Creative by ${creatorName}`} width={post.media_width} height={post.media_height} sourceUrl={post.url} flush /></section>}
          <div className="flex flex-wrap items-center gap-1 px-3 py-3 sm:px-5" aria-label="Post actions">
            <span className="social-action" aria-label={`${metric(post.impressions)} impressions`}><EyeIcon/> {metric(post.impressions)}</span>
            {post.url ? <a href={post.url} target="_blank" rel="noopener noreferrer" className="social-action" aria-label={`Like this post on ${post.platform ?? "the original platform"}`}><HeartIcon/> {metric(post.likes)}</a> : null}
            {post.url ? <a href={post.url} target="_blank" rel="noopener noreferrer" className="social-action" aria-label={`Comment on this post on ${post.platform ?? "the original platform"}`}><CommentIcon/> {metric(post.replies)}</a> : null}
            {post.url ? <ShareAction url={post.url} title={post.text || `Post by ${creatorName}`} count={metric(post.reposts)} /> : null}
            {post.url ? <a href={post.url} target="_blank" rel="noopener noreferrer" className="social-action rounded-full border border-[#3a3a3a] px-4" aria-label={sourceLabel}><ExternalIcon/> {sourceLabel}</a> : null}
            <div className="ml-auto">{post.item_id ? <Link href={`/ideas/${post.item_id}`} className="social-action"><BookmarkIcon/> {metric(post.bookmarks)}</Link> : <form action={saveAsIdea}><input type="hidden" name="post_id" value={post.id}/><PendingButton pendingLabel="Saving…" className="social-action"><BookmarkIcon/> {metric(post.bookmarks)}</PendingButton></form>}</div>
          </div>
          {!isTextOnlyX ? <Caption><span className="mr-2 font-bold">{handle||creatorName}</span>{post.text || <span className="text-[#aaa]">The original caption was not captured.</span>}</Caption> : null}
          {post.gather_notes ? <div className="mx-5 mb-4 rounded-lg bg-[#172019] px-3 py-2.5 text-sm leading-6 text-[#bfcabb] sm:mx-6"><span className="font-semibold">Saved note: </span>{post.gather_notes}</div> : null}
        </article>
          <section className="py-7" aria-labelledby="why-fonzi"><h2 id="why-fonzi" className="text-lg font-bold text-white">Why Fonzi selected this</h2><p className="mt-3 text-sm leading-6 text-[#aaa]"><span className="mr-2 text-[#a98cff]" aria-hidden="true">✦</span>{post.baseline_multiple !== null ? `It is performing ${post.baseline_multiple.toFixed(1)}× above this creator’s baseline` : "The available engagement signals marked it for review"}{saved ? " and you saved it in GatherOS" : ""}. The analysis below separates the observable performance from the creative hypothesis.</p></section>
          <InsightDisclosure summary={baseline ?? (post.heat_basis === "deferred" ? "Limited data" : "View breakdown")}>
            <MetricGrid metrics={[["Impressions",metric(post.impressions)],["Likes",metric(post.likes)],["Replies",metric(post.replies)],["Reposts",metric(post.reposts)],["Bookmarks",metric(post.bookmarks)],["Save rate",pct(post.save_rate)],["Heat",metric(post.heat)],["Fit",metric(post.fit)],["Baseline",baseline ?? "Not available"],...scores]} />
            <div className="mt-6 space-y-5 border-t border-[#303030] pt-5 text-sm leading-6 text-[#bbb]"><Insight title="Why it worked" value={post.why_it_worked} fallback="This post has not been analyzed yet."/><Insight title="Possible Fonzi angle" value={post.angle} fallback="No grounded Fonzi angle has been proposed yet."/><Insight title="Founder fit" value={[post.angle_for,post.archetype,post.why_we_watch].filter(Boolean).join(" · ")} fallback="No founder-fit context is available yet."/></div>
          </InsightDisclosure>
          <section className="border-t border-[#292929] px-5 py-5 sm:px-6" aria-labelledby="decision-title"><h2 id="decision-title" className="text-sm font-bold text-[#eee]">Develop this creative</h2><div className="mt-4 flex flex-col gap-3 sm:flex-row">{post.item_id ? <Link href={`/ideas/${post.item_id}`} className="rounded-lg border border-[#444] px-4 py-2.5 text-center text-sm font-medium">View saved idea</Link> : null}<form action={developThis}><input type="hidden" name="post_id" value={post.id}/><PendingButton pendingLabel="Opening…" className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-black">Develop This</PendingButton></form><form action={notForUs}><input type="hidden" name="post_id" value={post.id}/><PendingButton pendingLabel="Removing…" className="w-full rounded-lg px-4 py-2.5 text-sm text-[#d99890]">Not for Us</PendingButton></form></div></section>
        </div></main>;
}
function Insight({title,value,fallback}:{title:string;value:string|null;fallback:string}){return <section><h3 className="text-xs font-semibold uppercase tracking-[.1em] text-[#77736c]">{title}</h3><p className="mt-1.5 whitespace-pre-wrap">{value||fallback}</p></section>}
