export const FEED_PROFILES = ["thomas", "fonzi", "brett"] as const;
export type FeedProfile = (typeof FEED_PROFILES)[number];
export type FeedAction = "save" | "comment" | "open_thread" | "skip" | "create_angle";
export type FeedItem = { id:string; postId:string; author:string; handle:string|null; avatarUrl:string|null; text:string; url:string|null; postedAt:string|null; mediaUrl:string|null; bestAngle:string|null; lenses:string[]; wildcard:string|null; isFreshToday:boolean; metrics:{likes?:number; replies?:number; reposts?:number; views?:number} };
export type FeedPage = { items:FeedItem[]; nextCursor:string|null; sessionId:string|null };
export const PROFILE_LABELS: Record<FeedProfile,string> = { thomas:"Thomas", fonzi:"Fonzi", brett:"Brett" };
