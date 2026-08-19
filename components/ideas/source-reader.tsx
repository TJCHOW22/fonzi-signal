"use client";

import { useState } from "react";

type Props = {
  url: string | null;
  title: string;
  text: string | null;
};

function canTryEmbed(url: string | null) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return !["x.com", "twitter.com", "instagram.com", "tiktok.com", "youtube.com", "youtu.be"].includes(host);
  } catch {
    return false;
  }
}

export function SourceReader({ url, title, text }: Props) {
  const [open, setOpen] = useState(false);
  const embeddable = canTryEmbed(url);
  return <div className="overflow-hidden rounded-xl border border-[#e3e0d8] bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ece9e2] px-4 py-3">
      <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-[.1em] text-[#8d8981]">Original source</p><p className="truncate text-sm font-medium">{title}</p></div>
      <div className="flex gap-2">
        {embeddable && <button type="button" onClick={() => setOpen(v => !v)} className="rounded-md border border-[#d9d5cc] px-3 py-1.5 text-xs">{open ? "Close reader" : "Read here"}</button>}
        {url && <a href={url} target="_blank" rel="noreferrer" className="rounded-md border border-[#d9d5cc] px-3 py-1.5 text-xs">Open original ↗</a>}
      </div>
    </div>
    {open && url ? <div><iframe src={url} title={title} className="h-[72vh] min-h-[560px] w-full bg-white" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" /><p className="border-t border-[#ece9e2] px-4 py-2 text-xs text-[#8d8981]">Some publishers block embedding. If the reader is blank, use “Open original.”</p></div> : text ? <div className="max-h-80 overflow-y-auto px-5 py-5"><p className="whitespace-pre-wrap text-sm leading-7 text-[#514f4a]">{text}</p></div> : <p className="px-5 py-5 text-sm text-[#858179]">No article text was captured. Open the original source to read it.</p>}
  </div>;
}
