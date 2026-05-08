import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  ClipboardList,
  GitPullRequest,
  Zap,
  Bell,
  ShieldCheck,
  MessageSquare,
} from "lucide-react";

const featureCards = [
  {
    icon: ClipboardList,
    title: "Full task lifecycle",
    copy: "Create tasks, assign to team members, set deadlines, track progress, and close — all in one board. Team Leads create and assign; Developers update their own.",
  },
  {
    icon: GitPullRequest,
    title: "Bidirectional GitHub linking",
    copy: "Link any task to a GitHub Issue or Pull Request. Create Issues directly from tasks, or attach existing ones. Issue and PR state syncs live back to the task.",
  },
  {
    icon: Zap,
    title: "Real-time collaboration",
    copy: "Task updates broadcast instantly to every project member via WebSockets. Live presence indicators show who's viewing. No refresh needed.",
  },
  {
    icon: Bell,
    title: "Notifications",
    copy: "Get notified when you're assigned a task or a task you own is updated. Notifications are scoped per user and marked read in-app.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    copy: "Three roles — Developer, Team Lead, Admin — enforced on every route. Developers see their work; Team Leads manage sprints; Admins control the platform.",
  },
  {
    icon: MessageSquare,
    title: "Task comments",
    copy: "Discuss work in context. Every task has a comment thread visible to all project members, keeping decisions attached to the work itself.",
  },
];

const metricTiles = [
  { value: "3", label: "RBAC roles enforced" },
  { value: "2-way", label: "GitHub Issue & PR sync" },
  { value: "JWT", label: "Secure auth on every route" },
  { value: "0", label: "GitHub tokens in the browser" },
];

const Landing = () => {
  const scrollContainerRef = useRef(null);
  const [activeSection, setActiveSection] = useState("hero");

  const handleScrollTo = (event, targetId) => {
    event.preventDefault();
    const section = document.getElementById(targetId);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const sections = Array.from(container.querySelectorAll("[data-section]"));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let mostVisible = null;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!mostVisible || entry.intersectionRatio > mostVisible.intersectionRatio) {
              mostVisible = entry;
            }
          }
        });
        if (mostVisible?.target?.id) {
          setActiveSection(mostVisible.target.id);
        }
      },
      {
        root: container,
        threshold: [0.35, 0.6, 0.8],
      }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-950 text-white font-['Space_Grotesk']">
      {/* Background glows */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-cyan-500/20 blur-[120px]"></div>
        <div className="absolute right-0 top-1/4 h-80 w-80 rounded-full bg-red-500/20 blur-[140px]"></div>
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-[140px]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(94,234,212,0.12),transparent_55%)]"></div>
      </div>

      {/* Header */}
      <header className="absolute left-0 right-0 top-0 z-20">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 md:px-10">
          <div className="font-['Space_Grotesk'] text-lg font-semibold tracking-wide">
            DevSync
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/login" className="text-slate-300 transition hover:text-white">
              Login
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-red-500 px-4 py-2 font-semibold text-white transition hover:bg-red-400"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      {/* Side nav dots */}
      <nav
        aria-label="Section navigation"
        className="fixed right-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 lg:flex"
      >
        {[
          { id: "hero",     label: "Home" },
          { id: "features", label: "Features" },
          { id: "github",   label: "GitHub" },
          { id: "demo",     label: "Preview" },
          { id: "cta",      label: "Get Started" },
        ].map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={(event) => handleScrollTo(event, item.id)}
            aria-current={activeSection === item.id ? "page" : undefined}
            className="group flex items-center gap-3 text-xs text-slate-400"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full border transition ${
                activeSection === item.id
                  ? "border-white bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)]"
                  : "border-slate-500 group-hover:border-white group-hover:bg-white"
              }`}
            ></span>
            <span className="opacity-0 transition group-hover:opacity-100">
              {item.label}
            </span>
          </a>
        ))}
      </nav>

      {/* Scroll container */}
      <div
        ref={scrollContainerRef}
        className="relative h-screen overflow-y-auto scroll-smooth overscroll-y-contain"
      >

        {/* ── HERO ── */}
        <section
          id="hero"
          data-section
          className="relative flex min-h-screen snap-start items-center px-6 pt-28 md:px-10"
        >
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
            <div className="space-y-6 font-['Space_Grotesk']">
              <p className="font-['Orbitron'] text-xs uppercase tracking-[0.4em] text-slate-400">
                Built for GitHub-native teams
              </p>

              <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
                Manage sprints. Link PRs. Ship together.
              </h1>

              <p className="text-base text-slate-300 md:text-lg">
                DevSync connects your GitHub repos to a full project board -
                bidirectional Issue and PR linking, real-time task updates via
                WebSockets, and role-based access for every team member.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/login"
                  className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  Open your dashboard
                </Link>
                <Link
                  to="/register"
                  className="rounded-full bg-red-500/90 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-400"
                >
                  Sign up
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  Live GitHub Issue & PR sync
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
                  Developer / Team Lead / Admin roles
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-400"></span>
                  Real-time task broadcast
                </div>
              </div>
            </div>

            <div className="relative h-[420px] w-full md:h-[520px]">
              <div className="absolute inset-0 rounded-[36px] border border-slate-800/70 bg-slate-900/40 shadow-[0_20px_60px_rgba(15,23,42,0.45)] backdrop-blur"></div>
              <div className="absolute inset-4 overflow-hidden rounded-[28px] border border-slate-800/70 bg-slate-950/80">
                <img
                  src="/landing/devsync-hero-demo.gif"
                  alt="Animated preview of the DevSync dashboard"
                  width="1400"
                  height="1040"
                  loading="eager"
                  className="h-full w-full object-cover object-top"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent"></div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.4em] text-slate-500">
            Scroll to explore
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section
          id="features"
          data-section
          className="relative min-h-screen snap-start px-6 pt-28 md:px-10"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="relative space-y-3 font-['Space_Grotesk']">
                {/* subtle red ambient glow - anchored behind the heading */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-10 -top-6 h-40 w-80 rounded-full bg-red-500/10 blur-[80px]"
                />
                <p className="font-['Orbitron'] text-xs uppercase tracking-[0.4em] text-slate-400">
                  What's inside
                </p>
                <h2 className="text-3xl font-semibold md:text-5xl">
                  Everything your sprint needs. Nothing it doesn't.
                </h2>
              </div>
              <p className="max-w-md text-sm text-slate-400">
                DevSync covers the full task lifecycle - from GitHub repo connection
                to live team collaboration - without asking you to change how you
                already work.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {featureCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.title}
                      className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6 backdrop-blur"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80 text-slate-300">
                        <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                      </div>
                      <h3 className="mt-4 text-xl font-semibold text-white">{card.title}</h3>
                      <p className="mt-3 text-sm text-slate-300">{card.copy}</p>
                    </div>
                  );
                })}
              </div>

            <div className="grid gap-4 rounded-3xl border border-slate-800/70 bg-slate-900/40 p-6 md:grid-cols-4">
              {metricTiles.map((metric) => (
                <div key={metric.label} className="space-y-2">
                  <p className="text-2xl font-semibold text-white">{metric.value}</p>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    {metric.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── GITHUB INTEGRATION ── */}
        <section
          id="github"
          data-section
          className="relative min-h-screen snap-start px-6 pt-28 md:px-10"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.1fr_1.3fr]">
            <div className="space-y-6 font-['Space_Grotesk']">
              <p className="font-['Orbitron'] text-xs uppercase tracking-[0.4em] text-slate-400">
                GitHub integration
              </p>

              <h2 className="text-3xl font-semibold md:text-5xl">
                Your repos, issues, and PRs - connected, not copied.
              </h2>

              <p className="text-base text-slate-300 md:text-lg">
                Connect your GitHub account via OAuth 2.0 and link any repository
                to a project. When an Issue closes or a PR merges on GitHub, the
                linked task updates automatically. Your GitHub token never touches
                the browser.
              </p>

              <ul className="space-y-3 text-sm text-slate-300">
                {[
                  "OAuth 2.0 with PKCE - no token stored in the frontend",
                  "Link a repository to any DevSync project",
                  "Create GitHub Issues directly from tasks",
                  "Attach open Pull Requests to tasks",
                  "Live Issue & PR state syncs back to the platform",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400"></span>
                    {item}
                  </li>
                ))}
              </ul>

              <a
                href="#demo"
                onClick={(event) => handleScrollTo(event, "demo")}
                className="inline-flex items-center gap-2 text-sm text-slate-200 transition hover:text-white"
              >
                See it in action
                <span aria-hidden="true">→</span>
              </a>
            </div>

            <div className="relative h-[420px] w-full md:h-[520px]">
              <div className="absolute inset-0 rounded-[36px] border border-slate-800/70 bg-slate-900/40 shadow-[0_20px_60px_rgba(15,23,42,0.45)] backdrop-blur"></div>
              <div className="absolute inset-4 overflow-hidden rounded-[28px] border border-slate-800/70 bg-slate-950/80">
                <img
                  src="/landing/devsync-github-demo.gif"
                  alt="DevSync GitHub integration - bidirectional Issue and PR linking"
                  width="1400"
                  height="1040"
                  loading="lazy"
                  className="h-full w-full object-cover object-top"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent"></div>
              </div>
            </div>
          </div>
        </section>

        {/* ── DEMO / PREVIEW ── */}
        <section
          id="demo"
          data-section
          className="relative min-h-screen snap-start px-6 pt-28 md:px-10"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.05fr_1.35fr]">
            <div className="space-y-6 font-['Space_Grotesk']">
              <p className="font-['Orbitron'] text-xs uppercase tracking-[0.4em] text-slate-400">
                Live preview
              </p>

              <h2 className="text-3xl font-semibold md:text-5xl">
                Your sprint board, GitHub links, and team - in one view.
              </h2>

              <p className="text-base text-slate-300 md:text-lg">
                See the project dashboard with live task state, GitHub Issue links,
                and collaborator presence. Switch between your backlog, active
                tasks, and PR pipeline without leaving the board.
              </p>

              <div className="flex flex-wrap gap-3 text-sm">
                {["Sprint board", "GitHub Issue linking", "Live presence"].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-slate-700/70 px-4 py-2 text-slate-300"
                  >
                    {chip}
                  </span>
                ))}
              </div>

              <a
                href="#cta"
                onClick={(event) => handleScrollTo(event, "cta")}
                className="inline-flex items-center gap-2 text-sm text-slate-200 transition hover:text-white"
              >
                Get full access
                <span aria-hidden="true">→</span>
              </a>
            </div>

            <div className="relative h-[420px] w-full md:h-[520px]">
              <div className="absolute inset-0 rounded-[36px] border border-slate-800/70 bg-slate-900/40 shadow-[0_20px_60px_rgba(15,23,42,0.45)] backdrop-blur"></div>
              <div className="absolute inset-4 overflow-hidden rounded-[28px] border border-slate-800/70 bg-slate-950/80">
                <img
                  src="/landing/devsync-workspace-demo.gif"
                  alt="Animated DevSync workspace walkthrough"
                  width="1600"
                  height="1000"
                  loading="lazy"
                  className="h-full w-full object-cover object-top"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent"></div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section
          id="cta"
          data-section
          className="relative flex min-h-screen snap-start items-center px-6 pt-28 md:px-10"
        >
            <div className="mx-auto w-full max-w-5xl rounded-[36px] border border-slate-800/70 bg-slate-900/60 p-10 text-center backdrop-blur">            <p className="font-['Orbitron'] text-xs uppercase tracking-[0.4em] text-slate-400">
              Start now
            </p>

            <h2 className="mt-4 text-3xl font-semibold md:text-5xl">
              Your GitHub repos. Your team. One place.
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-300 md:text-lg">
              Connect your GitHub account, add your team, and have your first
              sprint board live in under five minutes. No configuration required.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/login"
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                Open your dashboard
              </Link>
              <Link
                to="/register"
                className="rounded-full border border-slate-500 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white hover:text-white"
              >
                Sign up
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default Landing;