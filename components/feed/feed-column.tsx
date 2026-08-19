"use client";
import { useEffect,useRef } from "react";
import { FeedCard } from "./feed-card";
import { useFeed } from "./use-feed";
import type { FeedProfile } from "./types";

export function FeedColumn({profile,compact=false}:{profile:FeedProfile;compact?:boolean}) {
 const feed=useFeed(profile),sentinel=useRef<HTMLDivElement>(null);
 useEffect(()=>{const node=sentinel.current;if(!node)return;const observer=new IntersectionObserver(entries=>{if(entries[0]?.isIntersecting)feed.loadMore();},{rootMargin:"500px"});observer.observe(node);return()=>observer.disconnect();},[feed.loadMore]);
 let crossedFresh=false;
 return <div className="signal-list">
   {feed.items.map((item)=>{const showBoundary=!crossedFresh&&!item.isFreshToday; if(showBoundary)crossedFresh=true; return <div key={item.id}>{showBoundary&&<div className="signal-boundary"><span>earlier signals</span></div>}<FeedCard item={item} profile={profile} sessionId={feed.sessionId} onSkip={feed.remove} compact={compact}/></div>;})}
   {feed.loading&&<div className="signal-loading"><span/><span/><span/></div>}
   {feed.error&&<div className="signal-empty"><p>the feed hit a snag</p><button onClick={feed.retry}>try again</button></div>}
   {!feed.loading&&!feed.error&&feed.items.length===0&&<div className="signal-empty"><p>no ranked signals yet</p><span>new source posts will land here after the next ingest.</span></div>}
   <div ref={sentinel} aria-hidden="true" className="signal-sentinel"/>
 </div>;
}
