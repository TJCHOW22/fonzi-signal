"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sendInteraction } from "./feed-api";
import type { FeedAction, FeedItem, FeedProfile } from "./types";

const fmt = (value?:number) => value === undefined ? null : value >= 1_000_000 ? `${(value/1_000_000).toFixed(1)}m` : value >= 1_000 ? `${(value/1_000).toFixed(1)}k` : String(value);
const time = (value:string|null) => { if(!value)return ""; const ms=Date.now()-new Date(value).getTime(); if(ms<3_600_000)return `${Math.max(1,Math.floor(ms/60_000))}m`; if(ms<86_400_000)return `${Math.floor(ms/3_600_000)}h`; return new Date(value).toLocaleDateString("en-US",{month:"short",day:"numeric"}).toLowerCase(); };
const DISMISS_REASONS = [
 {value:"not_interesting",label:"not interesting"},
 {value:"too_generic",label:"too generic"},
 {value:"wrong_profile",label:"wrong for this feed"},
 {value:"seen_it",label:"already seen it"},
] as const;

function Icon({name}:{name:"save"|"comment"|"thread"|"skip"|"angle"}) {
 const path={save:<path d="M6 4.5h12v16l-6-4-6 4z"/>,comment:<path d="M4 5h16v12H9l-5 4z"/>,thread:<><path d="M8 12h8M12 8l4 4-4 4"/><rect x="3" y="3" width="18" height="18" rx="5"/></>,skip:<><path d="m5 5 14 14M19 5 5 19"/></>,angle:<><path d="m4 17 6-6 4 4 6-7"/><path d="M15 8h5v5"/></>}[name];
 return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
}

export function FeedCard({item,profile,sessionId,onSkip,compact=false}:{item:FeedItem;profile:FeedProfile;sessionId:string|null;onSkip:(id:string)=>void;compact?:boolean}) {
 const router=useRouter();
 const [expanded,setExpanded]=useState(false),[commenting,setCommenting]=useState(false),[comment,setComment]=useState(""),[dismissing,setDismissing]=useState(false),[dismissReason,setDismissReason]=useState(""),[dismissNote,setDismissNote]=useState(""),[notice,setNotice]=useState<string|null>(null),[pending,setPending]=useState<FeedAction|null>(null),[saved,setSaved]=useState(false),[avatarFailed,setAvatarFailed]=useState(false);
 const metrics=useMemo(()=>[["reply",item.metrics.replies],["repost",item.metrics.reposts],["like",item.metrics.likes],["view",item.metrics.views]].filter((entry)=>entry[1]!==undefined),[item.metrics]);
 async function act(action:FeedAction,body?:string,metadata?:Record<string,string>){if(action==="open_thread"&&item.url)window.open(item.url,"_blank","noopener,noreferrer");setPending(action);setNotice(null);try{const result=await sendInteraction({profileId:profile,targetId:item.postId,action,sessionId,comment:body,metadata});if(action==="save")setSaved(true);if(action==="skip")onSkip(item.id);if(action==="create_angle"&&result.itemId){router.push(`/ideas/${result.itemId}`);return;}if(result.suggestedNextMove)setNotice(result.suggestedNextMove);else if(action==="create_angle")setNotice("idea created, but its workspace could not be opened");else if(action==="comment")setNotice("comment saved");}catch{setNotice("could not save that action. try again.");}finally{setPending(null);}}
 function submit(event:FormEvent){event.preventDefault();const value=comment.trim();if(!value)return;void act("comment",value);setComment("");setCommenting(false);}
 function submitDismiss(event:FormEvent){event.preventDefault();const metadata:Record<string,string>={};if(dismissReason)metadata.reason=dismissReason;if(dismissNote.trim())metadata.note=dismissNote.trim();void act("skip",undefined,metadata);}
 return <article className={`signal-card ${compact?"is-compact":""}`}>
   <header className="signal-card-head"><span className="signal-avatar">{item.avatarUrl&&!avatarFailed?<img src={item.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setAvatarFailed(true)}/>:item.author.slice(0,2).toUpperCase()}</span><div><strong>{item.author}</strong><span>{item.handle?`@${item.handle.replace(/^@/,"")}`:""}{item.postedAt?` · ${time(item.postedAt)}`:""}</span></div>{item.url&&<a className="signal-x-link" href={item.url} target="_blank" rel="noreferrer" aria-label="Open source post">↗</a>}</header>
   <p className="signal-post-text">{item.text||"source post"}</p>
   {item.mediaUrl&&<img className="signal-media" src={item.mediaUrl.startsWith("/")||item.mediaUrl.startsWith("http")?item.mediaUrl:`/api/media/${item.mediaUrl}`} alt="" loading="lazy"/>}
   {metrics.length>0&&<div className="signal-metrics">{metrics.map(([label,value])=><span key={String(label)}>{fmt(value as number)} {label}</span>)}</div>}
   {(item.bestAngle||item.lenses.length>0||item.wildcard)&&<section className="signal-frames">
     {item.bestAngle&&<div className="signal-best-angle"><span>best angle</span><p>{item.bestAngle}</p></div>}
     {(item.lenses.length>0||item.wildcard)&&<button className="signal-lenses-toggle" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}>{expanded?"hide frames":"more frames"}<span>{expanded?"−":"+"}</span></button>}
     {expanded&&<div className="signal-lenses">{item.lenses.map((lens,index)=><div key={`${lens}-${index}`}><span>lens {index+1}</span><p>{lens}</p></div>)}{item.wildcard&&<div className="is-wildcard"><span>wildcard</span><p>{item.wildcard}</p></div>}</div>}
   </section>}
   {notice&&<div className="signal-notice"><span>next move</span>{notice}</div>}
   {commenting&&<form className="signal-comment-form" onSubmit={submit}><textarea autoFocus value={comment} onChange={event=>setComment(event.target.value)} placeholder="what are you seeing here?"/><div><button type="button" onClick={()=>setCommenting(false)}>cancel</button><button type="submit" disabled={!comment.trim()||pending!==null}>save comment</button></div></form>}
   {dismissing&&<form className="signal-dismiss-form" onSubmit={submitDismiss}><fieldset><legend>why isn&apos;t this for you?</legend><div className="signal-dismiss-reasons">{DISMISS_REASONS.map(reason=><button type="button" key={reason.value} className={dismissReason===reason.value?"is-selected":""} aria-pressed={dismissReason===reason.value} onClick={()=>setDismissReason(current=>current===reason.value?"":reason.value)}>{reason.label}</button>)}</div></fieldset><textarea value={dismissNote} onChange={event=>setDismissNote(event.target.value)} placeholder="optional note, what should we find instead?"/><div className="signal-dismiss-controls"><button type="button" onClick={()=>setDismissing(false)}>cancel</button><button type="submit" disabled={pending!==null}>dismiss</button></div></form>}
   <footer className="signal-actions">
    <button className={saved?"is-active":""} disabled={pending!==null} onClick={()=>void act("save")}><Icon name="save"/><span>{saved?"saved":"save"}</span></button>
    <button disabled={pending!==null} onClick={()=>setCommenting(value=>!value)}><Icon name="comment"/><span>comment</span></button>
    <button disabled={pending!==null} onClick={()=>void act("open_thread")}><Icon name="thread"/><span>thread</span></button>
    <button disabled={pending!==null} onClick={()=>void act("create_angle")}><Icon name="angle"/><span>angle</span></button>
    <button className={`is-quiet ${dismissing?"is-active":""}`} aria-expanded={dismissing} disabled={pending!==null} onClick={()=>setDismissing(value=>!value)}><Icon name="skip"/><span>skip</span></button>
   </footer>
 </article>;
}
