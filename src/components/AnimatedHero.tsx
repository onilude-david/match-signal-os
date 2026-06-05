import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, RefreshCcw, Sparkles } from "lucide-react";
import { Button } from "./ui/Button";

interface AnimatedHeroProps {
  onGenerate: () => void;
  onSync: () => void;
  loadingGenerate?: boolean;
  loadingSync?: boolean;
}

export function AnimatedHero({
  onGenerate,
  onSync,
  loadingGenerate = false,
  loadingSync = false,
}: AnimatedHeroProps) {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(
    () => ["matchday desk", "signal engine", "editorial system", "social command", "video pipeline"],
    [],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setTitleNumber((current) => (current + 1) % titles.length);
    }, 2400);
    return () => window.clearTimeout(timeoutId);
  }, [titleNumber, titles.length]);

  return (
    <section className="relative mb-8 overflow-hidden rounded-[28px] border border-[#d0b36a]/25 bg-[#101b17] shadow-[0_34px_90px_-60px_rgba(0,0,0,0.8)]">
      <div className="absolute inset-y-0 left-0 w-[38%] bg-[#123f31]" />
      <div className="absolute right-[-120px] top-[-180px] h-[520px] w-[520px] rounded-full border-[42px] border-[#c9972d]/25" />
      <div className="absolute bottom-[-260px] left-[44%] h-[460px] w-[460px] rounded-full border border-[#f6efe0]/10" />
      <div className="relative grid min-h-[390px] grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative flex flex-col justify-between gap-10 p-7 md:p-10 lg:p-12">
          <div>
            <div className="mb-8 inline-flex items-center gap-2 border border-[#c9972d]/35 bg-[#c9972d]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-[#c9972d]">
              <Activity size={13} />
              Field Intelligence Desk
            </div>
            <h1 className="max-w-[760px] text-[clamp(2.35rem,6.4vw,6.5rem)] font-black leading-[0.88] tracking-[-0.055em] text-[#f6efe0]">
              The football
              <span className="relative mt-3 block h-[1em] overflow-hidden text-[#c9972d]">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={titleNumber}
                    className="absolute inset-x-0 block capitalize"
                    initial={{ y: 56, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -56, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 120, damping: 18 }}
                  >
                    {titles[titleNumber]}
                  </motion.span>
                </AnimatePresence>
              </span>
            </h1>
          </div>

          <div className="flex flex-col gap-5">
            <p className="max-w-[620px] text-base leading-7 text-[#d9d0bd] md:text-lg">
              Turn fixtures into match signals, social drafts, vertical clip plans, Telegram briefs, and post-match lessons without losing editorial control.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                icon={<RefreshCcw size={16} />}
                onClick={onSync}
                loading={loadingSync}
                className="min-w-[148px]"
              >
                Sync Feeds
              </Button>
              <Button
                variant="primary"
                icon={<Sparkles size={16} />}
                onClick={onGenerate}
                loading={loadingGenerate}
                className="min-w-[168px]"
              >
                Generate Pack
              </Button>
            </div>
          </div>
        </div>

        <div className="relative min-h-[300px] border-t border-[#f6efe0]/10 bg-[#0c1512] lg:border-l lg:border-t-0">
          <div className="absolute inset-8 border border-[#f6efe0]/10" />
          <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f6efe0]/20" />
          <div className="absolute inset-x-8 top-1/2 border-t border-[#f6efe0]/15" />
          <div className="absolute inset-y-8 left-1/2 border-l border-[#f6efe0]/15" />
          <motion.div
            className="absolute left-1/2 top-1/2 grid h-44 w-44 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[14px] border-[#c9972d] bg-[#10543f] text-[#f6efe0]"
            animate={{ rotate: [0, 0.7, 0, -0.7, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="text-center">
              <div className="text-5xl font-black tracking-[-0.08em]">MS</div>
              <div className="mx-auto mt-3 h-2 w-24 rounded-full bg-[#c9972d]" />
            </div>
          </motion.div>
          <div className="absolute bottom-8 left-8 right-8 grid grid-cols-3 gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#c9972d]">
            <span>Preview</span>
            <span className="text-center">Signal</span>
            <span className="text-right">Publish</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default AnimatedHero;
