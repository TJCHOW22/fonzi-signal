"use client";
import Link from "next/link";
import { useState } from "react";
import { FeedColumn } from "./feed-column";
import { ProfileSwitch } from "./profile-switch";
import type { FeedProfile } from "./types";

const DESCRIPTIONS:Record<FeedProfile,string>={thomas:"skills, original takes, and useful rabbit holes",fonzi:"candidate truth, hiring shifts, and usable brand angles",brett:"company stories, strange wedges, and founder tension"};
export function SignalFeed(){const [profile,setProfile]=useState<FeedProfile>("thomas");return <div className="signal-page">
 <header className="signal-page-head"><div><span className="signal-kicker">signal feed</span><h1>your corner of the internet.</h1><p>{DESCRIPTIONS[profile]}</p></div><Link href="/radar" className="signal-radar-link"><span className="signal-radar-icon">⌘</span>radar view</Link></header>
 <div className="signal-sticky"><ProfileSwitch value={profile} onChange={setProfile}/><span className="signal-profile-note">ranked for {profile}</span></div>
 <main className="signal-feed-wrap"><div className="signal-fresh-label"><span/>fresh today<span/></div><FeedColumn key={profile} profile={profile}/></main>
 </div>}
