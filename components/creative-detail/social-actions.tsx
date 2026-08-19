"use client";
import { useState } from "react";
export function ShareAction({url,title,count}:{url:string;title:string;count?:string}){const[copied,setCopied]=useState(false);async function share(){try{if(navigator.share){await navigator.share({title,url});return}await navigator.clipboard.writeText(url);setCopied(true);window.setTimeout(()=>setCopied(false),1800)}catch(error){if(error instanceof DOMException&&error.name==="AbortError")return}}return <button type="button" onClick={share} className="social-action" aria-label={`Share ${title}`}><ShareIcon/><span>{copied?"Copied":count??"Share"}</span></button>}
export function HeartIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z"/></svg>}
export function EyeIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>}
export function CommentIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.8 9.8 0 0 1-4.1-.9L3 21l1.8-4.7A8.6 8.6 0 1 1 21 11.5Z"/></svg>}
function ShareIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 8-6-6-6 6M12 2v13M5 12v8h14v-8"/></svg>}
export function BookmarkIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>}
export function ExternalIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 13v7H4V6h7"/></svg>}
