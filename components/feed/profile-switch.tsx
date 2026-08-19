"use client";
import type { FeedProfile } from "./types";
import { FEED_PROFILES,PROFILE_LABELS } from "./types";
export function ProfileSwitch({value,onChange}:{value:FeedProfile;onChange:(profile:FeedProfile)=>void}){return <div className="signal-profile-switch" role="tablist" aria-label="Feed profile">{FEED_PROFILES.map(profile=><button key={profile} role="tab" aria-selected={profile===value} className={profile===value?"is-active":""} onClick={()=>onChange(profile)}>{PROFILE_LABELS[profile]}</button>)}</div>}
