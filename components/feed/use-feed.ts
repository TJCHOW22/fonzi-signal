"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { getFeed } from "./feed-api";
import type { FeedItem,FeedProfile } from "./types";
export function useFeed(profile:FeedProfile){
 const [items,setItems]=useState<FeedItem[]>([]),[cursor,setCursor]=useState<string|null>(null),[sessionId,setSessionId]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[hasMore,setHasMore]=useState(true); const requestRef=useRef(false);
 const load=useCallback(async(nextCursor:string|null,replace=false,signal?:AbortSignal)=>{if(requestRef.current)return;requestRef.current=true;setLoading(true);setError(null);try{const page=await getFeed(profile,nextCursor,signal);setItems(current=>{const combined=replace?page.items:[...current,...page.items];return [...new Map(combined.map(item=>[item.id,item])).values()];});setCursor(page.nextCursor);if(page.sessionId)setSessionId(page.sessionId);setHasMore(Boolean(page.nextCursor));}catch(cause){if(!(cause instanceof DOMException&&cause.name==="AbortError"))setError(cause instanceof Error?cause.message:"could not load feed");}finally{requestRef.current=false;setLoading(false);}},[profile]);
 useEffect(()=>{const controller=new AbortController();setItems([]);setCursor(null);setHasMore(true);requestRef.current=false;void load(null,true,controller.signal);return()=>controller.abort();},[load]);
 return {items,sessionId,loading,error,hasMore,loadMore:useCallback(()=>{if(hasMore&&!loading)void load(cursor);},[cursor,hasMore,load,loading]),retry:useCallback(()=>void load(items.length?cursor:null,items.length===0),[cursor,items.length,load]),remove:useCallback((id:string)=>setItems(current=>current.filter(item=>item.id!==id)),[])};
}
