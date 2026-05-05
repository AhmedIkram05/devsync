import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const flowSteps = [
  {
    step: "01",
    title: "Capture the signal",
    copy: "Unify issues, pull requests, and project milestones into one living stream.",
  },
  {
    step: "02",
    title: "Align the delivery",
    copy: "Map work to teams and priorities with roles, reviews, and automated checks.",
  },
  {
    step: "03",
    title: "Ship with clarity",
    copy: "Surface progress, blockers, and outcomes in a single, shared timeline.",
  },
];

const metricTiles = [
  { value: "3x", label: "Faster context alignment" },
  { value: "24h", label: "Decision-ready updates" },
  { value: "98%", label: "Signal fidelity" },
  { value: "0", label: "Orphaned tasks" },
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
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-cyan-500/20 blur-[120px]"></div>
        <div className="absolute right-0 top-1/4 h-80 w-80 rounded-full bg-red-500/20 blur-[140px]"></div>
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-[140px]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(94,234,212,0.12),transparent_55%)]"></div>
      </div>

      <header className="absolute left-0 right-0 top-0 z-20">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 md:px-10">
          <div className="font-['Space_Grotesk'] text-lg font-semibold tracking-wide">
            DevSync
          </div>

          <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <a
              href="#hero"
              onClick={(event) => handleScrollTo(event, "hero")}
              className="transition hover:text-white"
            >
              Hero
            </a>
            <a
              href="#flow"
              onClick={(event) => handleScrollTo(event, "flow")}
              className="transition hover:text-white"
            >
              Flow
            </a>
            <a
              href="#demo"
              onClick={(event) => handleScrollTo(event, "demo")}
              className="transition hover:text-white"
            >
              Demo
            </a>
            <a
              href="#cta"
              onClick={(event) => handleScrollTo(event, "cta")}
              className="transition hover:text-white"
            >
              Access
            </a>
          </nav>

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

      <nav
        aria-label="Section navigation"
        className="fixed right-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 lg:flex"
      >
        {[
          { id: "hero", label: "Hero" },
          { id: "flow", label: "Flow" },
          { id: "demo", label: "Demo" },
          { id: "cta", label: "Access" },
        ].map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={(event) => handleScrollTo(event, item.id)}
            aria-current={activeSection === item.id ? "true" : undefined}
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

      <div
        ref={scrollContainerRef}
        className="relative h-screen overflow-y-auto snap-y snap-proximity scroll-smooth overscroll-y-contain"
      >
        <section
          id="hero"
          data-section
          className="relative flex min-h-screen snap-start items-center px-6 pt-28 md:px-10"
        >
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
            <div className="space-y-6 font-['Space_Grotesk']">
              <p className="font-['Orbitron'] text-xs uppercase tracking-[0.4em] text-slate-400">
                DevSync platform
              </p>

              <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
                Delivery clarity for modern teams.
              </h1>

              <p className="text-base text-slate-300 md:text-lg">
                DevSync connects the pulse of your codebase to the rhythm of your team.
                Stay aligned across planning, execution, and release with live context.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/login"
                  className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  Enter DevSync
                </Link>

                <a
                  href="#demo"
                  onClick={(event) => handleScrollTo(event, "demo")}
                  className="rounded-full border border-slate-500 px-5 py-2 text-sm text-slate-200 transition hover:border-white hover:text-white"
                >
                  Watch the flow
                </a>

                <Link
                  to="/register"
                  className="rounded-full bg-red-500/90 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-400"
                >
                  Request access
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  Live GitHub sync
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
                  Role-aware visibility
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-400"></span>
                  Real-time alerts
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

        <section
          id="flow"
          data-section
          className="relative min-h-screen snap-start px-6 pt-28 md:px-10"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-3 font-['Space_Grotesk']">
                <p className="font-['Orbitron'] text-xs uppercase tracking-[0.4em] text-slate-400">
                  Sync engine
                </p>
                <h2 className="text-3xl font-semibold md:text-5xl">
                  From signal to delivery in three steps.
                </h2>
              </div>

              <p className="max-w-md text-sm text-slate-400">
                Each stage docks into the next. The experience feels like an elevator,
                stopping only when the story is complete.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {flowSteps.map((step) => (
                <div
                  key={step.step}
                  className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6 backdrop-blur"
                >
                  <p className="font-['Orbitron'] text-xs uppercase tracking-[0.35em] text-slate-500">
                    {step.step}
                  </p>
                  <h3 className="mt-4 text-xl font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm text-slate-300">{step.copy}</p>
                </div>
              ))}
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

        <section
          id="demo"
          data-section
          className="relative min-h-screen snap-start px-6 pt-28 md:px-10"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.05fr_1.35fr]">
            <div className="space-y-6 font-['Space_Grotesk']">
              <p className="font-['Orbitron'] text-xs uppercase tracking-[0.4em] text-slate-400">
                Demo mode
              </p>

              <h2 className="text-3xl font-semibold md:text-5xl">
                A guided preview of the DevSync workspace.
              </h2>

              <p className="text-base text-slate-300 md:text-lg">
                Step through a curated journey of your backlog, team focus, and live
                delivery health. Each screen is tuned for fast context and calm
                decisions.
              </p>

              <div className="flex flex-wrap gap-3 text-sm">
                {["Team overview", "Release control", "Risk insights"].map((chip) => (
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
                Activate full access
                <span aria-hidden="true">-&gt;</span>
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

        <section
          id="cta"
          data-section
          className="relative flex min-h-screen snap-start items-center px-6 pt-28 md:px-10"
        >
          <div className="mx-auto w-full max-w-5xl rounded-[36px] border border-slate-800/70 bg-gradient-to-br from-slate-950 via-slate-900/90 to-red-900/40 p-10 text-center backdrop-blur">
            <p className="font-['Orbitron'] text-xs uppercase tracking-[0.4em] text-slate-400">
              Ready to dock
            </p>

            <h2 className="mt-4 text-3xl font-semibold md:text-5xl">
              Welcome to DevSync. Stay aligned from first commit to release.
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-300 md:text-lg">
              Move through the workflow with purpose. The next stop is your
              workspace.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/login"
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                Enter DevSync
              </Link>

              <Link
                to="/register"
                className="rounded-full border border-slate-500 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white hover:text-white"
              >
                Create your account
              </Link>
            </div>

            <p className="mt-10 text-xs uppercase tracking-[0.35em] text-slate-500">
              Smooth section scrolling enabled
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Landing;