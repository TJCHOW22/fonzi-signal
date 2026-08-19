"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconName = "feed" | "ideas" | "angles" | "memory" | "label" | "roster" | "briefs";

const PRIMARY: { href: string; label: string; shortLabel: string; icon: IconName }[] = [
  { href: "/", label: "Creative feed", shortLabel: "Feed", icon: "feed" },
  { href: "/ideas", label: "Ideas", shortLabel: "Ideas", icon: "ideas" },
  { href: "/angle-feed", label: "Angles", shortLabel: "Angles", icon: "angles" },
  { href: "/memory", label: "Memory", shortLabel: "Memory", icon: "memory" },
];

const LIBRARY: { href: string; label: string; icon: IconName }[] = [
  { href: "/label", label: "Label", icon: "label" },
  { href: "/roster", label: "Roster", icon: "roster" },
  { href: "/briefs", label: "Briefs", icon: "briefs" },
];

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    feed: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></>,
    ideas: <><path d="M9 18h6M10 22h4"/><path d="M8.2 15.5A7 7 0 1 1 15.8 15.5C14.7 16.3 14.2 17 14 18h-4c-.2-1-.7-1.7-1.8-2.5Z"/></>,
    angles: <><path d="m4 17 6-6 4 4 6-7"/><path d="M15 8h5v5"/></>,
    memory: <><path d="M9 4.5A3.5 3.5 0 0 0 5.5 8v1A3.5 3.5 0 0 0 4 15.4 3.5 3.5 0 0 0 9 19.5"/><path d="M15 4.5A3.5 3.5 0 0 1 18.5 8v1a3.5 3.5 0 0 1 1.5 6.4 3.5 3.5 0 0 1-5 4.1M12 3v18M8 9h4M12 15h4"/></>,
    label: <><path d="M20 13 13 20l-9-9V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1"/></>,
    roster: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3 3 0 0 1 0 5.5M17 14c2.3.7 4 2.8 4 5.5"/></>,
    briefs: <><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: IconName }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" || pathname.startsWith("/creative-feed") : pathname.startsWith(href);
  return <Link href={href} aria-current={active ? "page" : undefined} className={`app-nav-link ${active ? "is-active" : ""}`}><Icon name={icon}/><span>{label}</span></Link>;
}

export function AppNavigation() {
  return (
    <>
      <aside className="app-sidebar">
        <Link href="/" className="app-wordmark"><span className="app-mark">f</span><span>fonzi</span></Link>
        <nav aria-label="Main navigation" className="app-nav-group">
          {PRIMARY.map((item) => <NavLink key={item.href} {...item}/>) }
        </nav>
        <div className="app-nav-section">
          <p>Library</p>
          {LIBRARY.map((item) => <NavLink key={item.href} {...item}/>) }
        </div>
        <div className="app-sidebar-profile"><span className="app-avatar">TC</span><span><strong>TJ</strong><small>content team</small></span></div>
      </aside>
      <header className="app-mobile-header"><Link href="/" className="app-wordmark"><span className="app-mark">f</span><span>fonzi</span></Link><span className="app-avatar">TC</span></header>
      <nav aria-label="Mobile navigation" className="app-bottom-nav">
        {PRIMARY.map((item) => <NavLink key={item.href} href={item.href} label={item.shortLabel} icon={item.icon}/>) }
      </nav>
    </>
  );
}
