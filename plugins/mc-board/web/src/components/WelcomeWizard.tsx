"use client";

import { useState, useEffect, useCallback, useRef } from "react";


interface Step {
  title: string;
  body: string;
  target?: string;
}

const STEPS: Step[] = [
  {
    title: "Welcome to your Brain Board",
    body: "This is where you can see everything I'm thinking about, working on, and have completed. Think of it as a window into my brain — a kanban board that moves cards through four stages as I do the work.",
  },
  {
    title: "Backlog",
    target: "backlog",
    body: "New cards land here. A card can be a task, a feature, a research query — anything you want me to work on. During each heartbeat cycle, I'll look at the backlog, sort by importance, and pick up cards to process. For each one, I'll do the research, pre-planning, and create simple acceptance criteria so we both know when it's done.",
  },
  {
    title: "In Progress",
    target: "in-progress",
    body: "Once a card has been fully planned and all the data is filled in, it moves here. This is where I do the actual work — writing the document, building the feature, completing the research, whatever the card calls for. When the acceptance criteria are met, the card gets picked up and moved to review.",
  },
  {
    title: "In Review",
    target: "in-review",
    body: "I'll review the entire work history, the acceptance criteria, and any relevant standards or practices. If something doesn't pass, the card goes back for additional work. If everything checks out, it moves to Shipped. For software with a git repo, this is where the branch and commit happen.",
  },
  {
    title: "Shipped",
    target: "shipped",
    body: "Completed work lives here. Every card that made it through the pipeline — planned, executed, reviewed, and done. This is me cooking.",
  },
  {
    title: "Search",
    target: "search",
    body: "Use the search bar to find any card with natural language — across all projects, all columns. Just type what you're looking for.",
  },
  {
    title: "Projects",
    target: "projects",
    body: "I organize my work into projects — each one gets its own cards, its own history, its own context. When a project is completed it can be archived, but nothing is ever destroyed. All the history is kept. It's what makes me, me — my memories.",
  },
];

interface Rect { top: number; left: number; width: number; height: number; }

function clamp(val: number, min: number, max: number) { return Math.max(min, Math.min(max, val)); }

export function WelcomeWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [vpSize, setVpSize] = useState({ w: 1920, h: 1080 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const measure = useCallback(() => {
    setVpSize({ w: window.innerWidth, h: window.innerHeight });
    if (!current.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [current.target]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const finish = () => {
    fetch("/api/welcome", { method: "POST" }).catch(() => {});
    onDone();
  };

  // For column steps, find the next column to place the tooltip over
  const TOOLTIP_COL: Record<string, string> = {
    backlog: "in-progress",
    "in-progress": "in-review",
    "in-review": "in-progress",
  };

  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect || !current.target) {
      return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }

    const tw = 360;
    const pad = 14;

    // For column targets, place tooltip over the next column to the right
    const nextCol = TOOLTIP_COL[current.target];
    if (nextCol) {
      const nextEl = document.querySelector(`[data-tour="${nextCol}"]`);
      if (nextEl) {
        const nr = nextEl.getBoundingClientRect();
        return {
          position: "fixed",
          top: nr.top + 60,
          left: nr.left + nr.width / 2 - tw / 2,
          width: tw,
        };
      }
    }

    // Shipped: centered modal like the intro
    if (current.target === "shipped") {
      return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: tw };
    }

    // Search / Projects: below the element
    let top = targetRect.top + targetRect.height + pad;
    let left = targetRect.left;
    top = clamp(top, pad, vpSize.h - 240);
    left = clamp(left, pad, vpSize.w - tw - pad);

    return { position: "fixed", top, left, width: tw };
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, pointerEvents: "none" }}>
      {/* Overlay with cutout */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - 6}
                y={targetRect.top - 6}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx="10"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#tour-mask)" />
      </svg>

      {/* Highlight ring */}
      {targetRect && (
        <div
          style={{
            position: "fixed",
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            border: "2px solid rgba(250,250,250,0.25)",
            borderRadius: 10,
            boxShadow: "0 0 0 4px rgba(250,250,250,0.05)",
            pointerEvents: "none",
            transition: "all .3s ease",
          }}
        />
      )}

      {/* Tooltip */}
      <div ref={tooltipRef} className="tour-tooltip" style={{ ...getTooltipStyle(), pointerEvents: "auto" }}>
        <h3 className="tour-title">{current.title}</h3>
        <p className="tour-text">{current.body}</p>
        <div className="tour-footer">
          <div className="welcome-dots">
            {STEPS.map((_, i) => (
              <div key={i} className={`welcome-dot${i === step ? " active" : i < step ? " done" : ""}`} />
            ))}
          </div>
          <div className="tour-actions">
            {step > 0 && (
              <button className="welcome-btn welcome-btn-ghost" onClick={() => setStep(s => s - 1)}>Back</button>
            )}
            {step === 0 && (
              <button className="welcome-btn welcome-btn-ghost" onClick={finish}>Skip</button>
            )}
            <button className="welcome-btn welcome-btn-primary" onClick={isLast ? finish : () => setStep(s => s + 1)}>
              {isLast ? "Let's go" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useWelcomeWizard() {
  const [show, setShow] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/welcome")
      .then(r => r.json())
      .then(data => { setShow(!data.done); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  return { showWelcome: loaded && show, dismissWelcome: () => setShow(false) };
}
