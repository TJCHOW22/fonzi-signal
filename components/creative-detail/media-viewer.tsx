"use client";
import { useRef, useState } from "react";
type Props = { mediaType:string|null; mediaUrl:string|null; posterUrl:string|null; alt:string; width:number|null; height:number|null; sourceUrl:string|null; flush?:boolean };
export function MediaViewer(p: Props) {
  const ref=useRef<HTMLVideoElement>(null); const [started,setStarted]=useState(false);
  const video=p.mediaType?.toLowerCase().includes("video")===true || /\.(mp4|mov|m4v|webm)(?:\?|$)/i.test(p.mediaUrl??"");
  const style={aspectRatio:p.width&&p.height?`${p.width} / ${p.height}`:"16 / 9"};
  async function play(){setStarted(true);try{await ref.current?.play();}catch{}}
  const radius=p.flush?"":"rounded-2xl";
  if(video&&p.mediaUrl)return <div className={`relative overflow-hidden bg-[#171715] ${radius}`} style={style}><video ref={ref} src={p.mediaUrl} poster={p.posterUrl??undefined} controls={started} preload="metadata" playsInline className="h-full w-full object-contain" aria-label={p.alt}/>{!started?<button type="button" onClick={play} className="absolute inset-0 flex items-center justify-center bg-black/10 text-white hover:bg-black/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white" aria-label="Play video"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/70 text-2xl shadow-lg" aria-hidden>▶</span></button>:null}</div>;
  if(p.posterUrl||p.mediaUrl)return <div className={`overflow-hidden bg-[#f3f2ef] ${radius}`} style={style}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.posterUrl??p.mediaUrl??""} alt={p.alt} className="h-full w-full object-contain"/></div>;
  return <div className={`flex min-h-52 flex-col items-center justify-center border border-dashed border-[#d9d6ce] bg-[#faf9f7] px-6 text-center ${radius}`}><p className="text-sm text-[#77736c]">No media preview was captured for this post.</p>{p.sourceUrl?<a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 text-sm text-[#315d9a] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">View the original post ↗</a>:null}</div>;
}
