import React from "react";

type LabeledInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
};

export function LabeledInput({ label, value, onChange, type = "text" }: LabeledInputProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export default LabeledInput;
