import React from "react";
import { motion } from "framer-motion";

type MetricProps = {
  label: string;
  value: string;
};

export function Metric({ label, value }: MetricProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, translateY: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className="bg-paper border border-line-border/45 rounded-none p-4 flex flex-col gap-1 shadow-[0_16px_40px_-32px_rgba(0,0,0,0.65)] hover:border-signal-gold/45 transition-colors duration-300"
    >
      <span className="text-muted-text text-[10px] font-extrabold uppercase tracking-wider">
        {label}
      </span>
      <strong className="break-words text-ink text-sm font-black leading-tight tracking-[-0.01em] md:text-base">
        {value}
      </strong>
    </motion.div>
  );
}

export default Metric;
