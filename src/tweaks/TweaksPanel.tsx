import { useState } from "react";
import { ACCENT_OPTIONS, useTweaks, type AIProminence, type Density } from "./TweaksProvider";

const PANEL_CSS = `
.twk-trigger {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483645;
  height: 32px; padding: 0 14px; border-radius: 999px;
  background: rgba(21,20,15,0.92); color: #f6f3eb;
  font: 12px/1 "Geist", ui-sans-serif, system-ui, sans-serif; font-weight: 500;
  border: none; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  letter-spacing: 0.02em;
}
.twk-trigger:hover { background: #15140f; }

.twk-panel {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
  width: 280px;
  background: rgba(250,249,247,0.86); color: #29261b;
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  backdrop-filter: blur(24px) saturate(160%);
  border: 0.5px solid rgba(255,255,255,0.6); border-radius: 14px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.5) inset, 0 12px 40px rgba(0,0,0,0.18);
  font: 11.5px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
  overflow: hidden; display: flex; flex-direction: column;
}
.twk-hd { display: flex; align-items: center; justify-content: space-between;
  padding: 10px 8px 10px 14px; user-select: none; }
.twk-hd b { font-size: 12px; font-weight: 600; letter-spacing: 0.01em; }
.twk-x { appearance: none; border: 0; background: transparent;
  color: rgba(41,38,27,0.55); width: 22px; height: 22px; border-radius: 6px;
  cursor: pointer; font-size: 13px; line-height: 1; }
.twk-x:hover { background: rgba(0,0,0,0.06); color: #29261b; }
.twk-body { padding: 2px 14px 14px; display: flex; flex-direction: column; gap: 10px; }

.twk-sect { font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: rgba(41,38,27,0.45); padding: 10px 0 0; }
.twk-sect:first-child { padding-top: 0; }

.twk-row { display: flex; flex-direction: column; gap: 5px; }
.twk-lbl { display: flex; justify-content: space-between; align-items: baseline;
  color: rgba(41,38,27,0.72); }
.twk-lbl > span:first-child { font-weight: 500; }
.twk-val { color: rgba(41,38,27,0.5); }

.twk-seg { position: relative; display: flex; padding: 2px; border-radius: 8px;
  background: rgba(0,0,0,0.06); user-select: none; }
.twk-seg button { appearance: none; flex: 1; border: 0; background: transparent;
  color: inherit; font: inherit; font-weight: 500; min-height: 22px;
  border-radius: 6px; cursor: pointer; padding: 4px 6px; line-height: 1.2;
  position: relative; z-index: 1; text-transform: capitalize; }
.twk-seg button[aria-checked="true"] { background: rgba(255,255,255,0.9);
  box-shadow: 0 1px 2px rgba(0,0,0,0.12); }

.twk-chips { display: flex; gap: 6px; }
.twk-chip { position: relative; appearance: none; flex: 1; min-width: 0; height: 46px;
  padding: 0; border: 0; border-radius: 6px; overflow: hidden; cursor: pointer;
  box-shadow: 0 0 0 0.5px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06);
  transition: transform 0.12s, box-shadow 0.12s; }
.twk-chip:hover { transform: translateY(-1px);
  box-shadow: 0 0 0 0.5px rgba(0,0,0,0.18), 0 4px 10px rgba(0,0,0,0.12); }
.twk-chip[data-on="1"] { box-shadow: 0 0 0 1.5px rgba(0,0,0,0.85),
  0 2px 6px rgba(0,0,0,0.15); }
.twk-chip svg { position: absolute; top: 6px; left: 6px; width: 13px; height: 13px;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,0.3)); }
`;

function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, "0");
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}

function Check({ light }: { light: boolean }) {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2" strokeLinecap="round"
            strokeLinejoin="round" stroke={light ? "rgba(0,0,0,0.78)" : "#fff"} />
    </svg>
  );
}

export function TweaksPanel() {
  const { tweaks, setTweak } = useTweaks();
  const [open, setOpen] = useState(false);

  return (
    <>
      <style>{PANEL_CSS}</style>
      {!open && (
        <button className="twk-trigger" onClick={() => setOpen(true)}>
          Tweaks
        </button>
      )}
      {open && (
        <div className="twk-panel" data-noncommentable="">
          <div className="twk-hd">
            <b>Tweaks</b>
            <button className="twk-x" aria-label="Close tweaks" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <div className="twk-body">
            <div className="twk-sect">Accent</div>
            <div className="twk-row">
              <div className="twk-lbl">
                <span>Color</span>
                <span className="twk-val">
                  {ACCENT_OPTIONS.find((o) => o.value === tweaks.accent)?.label ?? tweaks.accent}
                </span>
              </div>
              <div className="twk-chips" role="radiogroup">
                {ACCENT_OPTIONS.map((o) => {
                  const on = o.value === tweaks.accent;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className="twk-chip"
                      role="radio"
                      aria-checked={on}
                      data-on={on ? "1" : "0"}
                      aria-label={o.label}
                      title={o.label}
                      style={{ background: o.value }}
                      onClick={() => setTweak("accent", o.value)}
                    >
                      {on && <Check light={isLight(o.value)} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="twk-sect">Density</div>
            <div className="twk-row">
              <div className="twk-lbl">
                <span>Spacing</span>
              </div>
              <div className="twk-seg" role="radiogroup">
                {(["comfortable", "compact"] as Density[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={tweaks.density === d}
                    onClick={() => setTweak("density", d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="twk-sect">AI Assistant</div>
            <div className="twk-row">
              <div className="twk-lbl">
                <span>Prominence</span>
              </div>
              <div className="twk-seg" role="radiogroup">
                {(["quiet", "balanced", "loud"] as AIProminence[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={tweaks.aiProminence === a}
                    onClick={() => setTweak("aiProminence", a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
