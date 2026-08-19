"use client";
import Link from "next/link";
import { FeedColumn } from "./feed-column";
import { FEED_PROFILES,PROFILE_LABELS } from "./types";
export function RadarView(){return <div className="radar-page">
 <div className="radar-mobile"><span className="signal-kicker">radar view</span><h1>radar needs a bigger screen.</h1><p>use the profile switch in the main feed on mobile.</p><Link href="/">back to feed</Link></div>
 <div className="radar-desktop"><header className="radar-head"><div><span className="signal-kicker">radar view</span><h1>three ways into the story.</h1></div><Link href="/">single feed</Link></header>
 <main className="radar-grid">{FEED_PROFILES.map(profile=><section className="radar-column" key={profile}><header><div><span className={`radar-dot is-${profile}`}/><h2>{PROFILE_LABELS[profile]}</h2></div><span>live signals</span></header><div className="radar-scroll"><div className="signal-fresh-label"><span/>fresh today<span/></div><FeedColumn profile={profile} compact/></div></section>)}</main>
 </div></div>}
