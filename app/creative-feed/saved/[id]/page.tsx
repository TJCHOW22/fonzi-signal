import Link from "next/link";
import { notFound } from "next/navigation";
import { developThis, notForUs, saveAsIdea } from "@/app/actions";
import { hydrateGatherXMetrics, runGatherAnalysis } from "@/app/creative-feed/saved/actions";
import { MediaViewer } from "@/components/creative-detail/media-viewer";
import { BookmarkIcon, CommentIcon, ExternalIcon, EyeIcon, HeartIcon, ShareAction } from "@/components/creative-detail/social-actions";
import { Caption, CreatorHeader, InsightDisclosure, MetricGrid, originalLabel } from "@/components/creative-detail/social-post";
import { PendingButton } from "@/components/pending-button";
import { getDb, getLatestGatherAnalysis, type GatherSave } from "@/lib/db";

export const dynamic = "force-dynamic";
type SavedDetail=GatherSave&{item_id:number|null;post_media_url:string|null;post_why_it_worked:string|null;post_angle:string|null;impressions:number|null;likes:number|null;replies:number|null;reposts:number|null;bookmarks:number|null;baseline_multiple:number|null;save_rate:number|null;heat:number|null;heat_basis:string|null;scraped_at:string|null;baseline_post_count:number|null};
const compact=new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1});
const metric=(value:number|null)=>value===null?"Not captured":compact.format(value);
function date(value:string|null){if(!value)return"Time not captured";const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?value:new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(parsed)}

export default async function SavedDetailPage({params}:{params:Promise<{id:string}>}){
  const{id}=await params;
  const save=getDb().prepare(`SELECT g.*,(SELECT item_id FROM item_sources WHERE gather_save_id=g.id LIMIT 1) AS item_id,p.media_url AS post_media_url,p.why_it_worked AS post_why_it_worked,p.angle AS post_angle,p.impressions,p.likes,p.replies,p.reposts,p.bookmarks,p.baseline_multiple,p.save_rate,p.heat,p.heat_basis,p.scraped_at,b.post_count AS baseline_post_count FROM gather_saves g LEFT JOIN posts p ON p.id=g.matched_post_id LEFT JOIN baselines b ON b.source_id=p.source_id WHERE g.id=? AND g.hidden=0 LIMIT 1`).get(id) as SavedDetail|undefined;
  if(!save)notFound();
  const latest=getLatestGatherAnalysis(id);const analysis=latest?.result;
  const poster=save.thumb_path?`/api/media/${save.thumb_path}`:null;
  const mediaUrl=save.media_path?`/api/media/${save.media_path}`:save.post_media_url;
  const caption=save.content_text||save.title;
  const creator=save.creator?`@${save.creator.replace(/^@/,"")}`:"Saved creator";
  const baseline=save.baseline_multiple===null?null:`${save.baseline_multiple.toFixed(1)}× baseline`;
  const sourceLabel=originalLabel(save.source);
  const avatarHandle=save.creator?.replace(/^@/,"")||null;
  const avatarUrl=avatarHandle?`https://unavatar.io/${save.source?.toLowerCase()==="instagram"?"instagram":"x"}/${encodeURIComponent(avatarHandle)}`:null;
  const isTextOnlyX=["x","twitter"].includes(save.source?.toLowerCase()??"")&&!mediaUrl&&!poster;
  const isX=["x","twitter"].includes(save.source?.toLowerCase()??"");
  const metricsCaptured=[save.impressions,save.likes,save.replies,save.reposts,save.bookmarks].some((value)=>value!==null);
  const partialBaseline=!baseline&&metricsCaptured&&(save.baseline_post_count??0)>0;
  const performanceNote=baseline
    ? `Performance is scored against this creator’s ${save.baseline_post_count??"available"}-post median. This is separate from your decision to save it.`
    : partialBaseline
      ? `We sampled ${save.baseline_post_count} posts from this creator, but X did not expose enough nonzero bookmark history for a reliable save-rate multiple. The performance score can still use the available engagement baseline, so treat it as directional.`
    : metricsCaptured
      ? `Live post metrics were captured${save.scraped_at?` on ${date(save.scraped_at)}`:""}, but there is not enough valid creator history for a baseline comparison yet.`
      : "You saving this is a taste signal, not evidence that the post performed well. Fetch X insights to capture observable metrics and build a creator baseline where possible.";
  return <main className="min-h-screen bg-black px-3 py-5 text-white sm:px-6 sm:py-8"><div className="mx-auto max-w-[820px]"><article className="overflow-hidden rounded-[28px] border border-[#343434] bg-[#101010] shadow-[0_22px_70px_rgba(0,0,0,.4)]">
      <div className="flex items-center justify-between px-5 py-5 sm:px-6"><Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-lg text-lg font-bold text-[#f4f4f4] outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-[#a98cff]"><span aria-hidden="true">←</span> Creative detail</Link>{baseline?<span className="rounded-full bg-[#46200d] px-4 py-2 text-sm font-bold text-[#ffc7a4]">🔥 {baseline}</span>:null}</div>
      <CreatorHeader name={creator} platform={save.source} timestamp={date(save.saved_at??save.imported_at)} badge="Saved by me" avatarUrl={avatarUrl}/>
      {isTextOnlyX?<section aria-label="Text post" className="border-t border-[#292929] px-5 py-6 sm:px-6 sm:py-8"><p className="whitespace-pre-wrap text-[18px] leading-7 text-[#f2f2f2] sm:text-[22px] sm:leading-8">{caption||"The original post text was not captured."}</p></section>:<section aria-label="Creative" className="overflow-hidden bg-black"><MediaViewer mediaType={save.media_type??save.kind} mediaUrl={mediaUrl} posterUrl={poster} alt={caption||`Creative by ${creator}`} width={save.media_width} height={save.media_height} sourceUrl={save.source_url} flush/></section>}
        <div className="flex flex-wrap items-center gap-1 px-3 py-3 sm:px-5" aria-label="Post KPIs and actions">
          <span className="social-action" aria-label={`${metric(save.impressions)} impressions`}><EyeIcon/> {metric(save.impressions)}</span>
          {save.source_url?<a href={save.source_url} target="_blank" rel="noopener noreferrer" className="social-action" aria-label={`Like this post on ${save.source??"the original platform"}`}><HeartIcon/> {metric(save.likes)}</a>:null}
          {save.source_url?<a href={save.source_url} target="_blank" rel="noopener noreferrer" className="social-action" aria-label={`Comment on this post on ${save.source??"the original platform"}`}><CommentIcon/> {metric(save.replies)}</a>:null}
          {save.source_url?<ShareAction url={save.source_url} title={caption||`Post by ${creator}`} count={metric(save.reposts)}/>:null}
          {save.source_url?<a href={save.source_url} target="_blank" rel="noopener noreferrer" className="social-action rounded-full border border-[#3a3a3a] px-4" aria-label={sourceLabel}><ExternalIcon/> {sourceLabel}</a>:null}
          <div className="ml-auto">{save.item_id?<Link href={`/ideas/${save.item_id}`} className="social-action"><BookmarkIcon/> {metric(save.bookmarks)}</Link>:<form action={saveAsIdea}><input type="hidden" name="gather_id" value={save.id}/><PendingButton pendingLabel="Saving…" className="social-action"><BookmarkIcon/> {metric(save.bookmarks)}</PendingButton></form>}</div>
        </div>
        {!isTextOnlyX?<Caption><span className="mr-2 font-bold">{creator}</span>{caption||<span className="text-[#aaa]">The original caption was not captured.</span>}</Caption>:null}
      </article>
        <section className="py-7" aria-labelledby="why-fonzi"><h2 id="why-fonzi" className="text-lg font-bold text-white">Why Fonzi selected this</h2><p className="mt-3 text-sm leading-6 text-[#aaa]"><span className="mr-2 text-[#a98cff]" aria-hidden="true">✦</span>You saved it to your GatherOS swipefile, which is a direct taste signal. {performanceNote}</p></section>
        <InsightDisclosure summary={baseline??(partialBaseline?"Partial baseline":metricsCaptured?"Metrics captured":analysis?`${analysis.confidence} confidence analysis`:"Insights not fetched")}>
          <MetricGrid metrics={[["Impressions",metric(save.impressions)],["Likes",metric(save.likes)],["Replies",metric(save.replies)],["Reposts",metric(save.reposts)],["Bookmarks",metric(save.bookmarks)],["Save rate",save.save_rate===null?"Not captured":`${(save.save_rate*100).toFixed(2)}%`],["Baseline",baseline??"Not available"],["Performance score",save.heat===null?"Not scored":`${save.heat.toFixed(1)} / 10`]]}/>
          {isX?<form action={hydrateGatherXMetrics} className="mt-5"><input type="hidden" name="gather_id" value={save.id}/><PendingButton pendingLabel="Fetching X insights…" className="rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-black">{metricsCaptured?"Refresh X insights":"Fetch X insights"}</PendingButton><p className="mt-2 text-xs leading-5 text-[#777]">Fetches this post’s public metrics. If no creator baseline exists, it also samples up to 30 posts from that account.</p></form>:null}
          <div className="mt-6 space-y-5 border-t border-[#303030] pt-5 text-sm leading-6 text-[#bbb]">
            <Insight title="Thumbnail + opening frame" value={analysis?[analysis.thumbnail_opening_frame.description,analysis.thumbnail_opening_frame.effectiveness].filter(Boolean).join(" "):null} fallback="Run the media analysis to inspect the opening frame."/>
            <Insight title="Hook" value={analysis?[analysis.visible_text_hook.text,analysis.spoken_text_hook.text,analysis.spoken_text_hook.analysis].filter(Boolean).join(" · "):null} fallback="No grounded hook analysis is available yet."/>
            <Insight title="Format, pacing + structure" value={analysis?[analysis.format,analysis.pacing_structure].filter(Boolean).join(" · "):null} fallback="The delivery format has not been analyzed yet."/>
            <Insight title="Why it likely worked" value={analysis?.why_likely_worked.analysis||save.post_why_it_worked} fallback="No grounded explanation is available yet."/>
            <Insight title="Reusable pattern" value={analysis?.reusable_pattern||null} fallback="No reusable pattern has been extracted yet."/>
            <Insight title="Possible Fonzi angle" value={analysis?.possible_fonzi_angle.angle||save.post_angle} fallback="No grounded Fonzi angle has been developed yet."/>
            {analysis?.limitations.length?<Insight title="Limitations" value={analysis.limitations.join(" · ")} fallback=""/>:null}
          </div>
          <form action={runGatherAnalysis} className="mt-6"><input type="hidden" name="gather_id" value={save.id}/><PendingButton pendingLabel="Analyzing media…" className="rounded-lg border border-[#444] bg-[#202020] px-4 py-2.5 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#a98cff]">{analysis?"Reanalyze creative":"Analyze creative"}</PendingButton></form>
          {latest?.status==="error"?<p className="mt-2 text-xs text-[#8d4d43]" role="status">Analysis failed: {latest.error??"unknown error"}</p>:null}{latest?.status==="running"?<p className="mt-2 text-xs text-[#756a4d]" role="status">Media analysis is running.</p>:null}
        </InsightDisclosure>
      <section className="border-t border-[#292929] px-5 py-5 sm:px-6"><h2 className="text-sm font-bold text-[#eee]">Develop this creative</h2><div className="mt-4 flex flex-col gap-3 sm:flex-row">{save.item_id?<Link href={`/ideas/${save.item_id}`} className="rounded-lg border border-[#444] px-4 py-2.5 text-center text-sm font-medium">View saved idea</Link>:null}<form action={developThis}><input type="hidden" name="gather_id" value={save.id}/><PendingButton pendingLabel="Opening…" className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-black">Develop This</PendingButton></form><form action={notForUs}><input type="hidden" name="gather_id" value={save.id}/><PendingButton pendingLabel="Removing…" className="w-full rounded-lg px-4 py-2.5 text-sm text-[#d99890]">Not for Us</PendingButton></form></div></section>
  </div></main>
}
function Insight({title,value,fallback}:{title:string;value:string|null;fallback:string}){return <section><h3 className="text-xs font-semibold uppercase tracking-[.1em] text-[#77736c]">{title}</h3><p className="mt-1.5 whitespace-pre-wrap">{value||fallback}</p></section>}
