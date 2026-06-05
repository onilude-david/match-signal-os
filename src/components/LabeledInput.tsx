import React from "react";

type LabeledInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
};

export function LabeledInput({ label, value, onChange, type = "text" }: LabeledInputProps) {
  return (
    <label className="flex flex-col gap-1.5 w-full">
      <span className="text-muted-text text-[10px] font-extrabold uppercase tracking-wider">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-field-bg/85 border border-line-border/60 hover:border-line-border rounded-none h-10 px-3.5 text-sm text-ink focus:border-signal-gold focus:outline-none focus:ring-2 focus:ring-signal-gold/20 transition-all duration-200"
      />
    </label>
  );
}

export default LabeledInput;
