import React from "react";
import { TeamRating } from "../types";

type TeamRatingEditorProps = {
  rating: TeamRating;
  onChange: (patch: Partial<TeamRating>) => void;
};

export function TeamRatingEditor({ rating, onChange }: TeamRatingEditorProps) {
  const fields: Array<[keyof TeamRating, string]> = [
    ["form", "Form"],
    ["attack", "Attack"],
    ["defense", "Defense"],
    ["midfield", "Midfield"],
    ["depth", "Depth"],
    ["coach", "Coach"],
    ["injuryImpact", "Injury impact"],
    ["motivation", "Motivation"],
  ];

  return (
    <div className="bg-paper border border-line-border/45 rounded-none p-5 flex flex-col gap-4 hover:border-signal-gold/45 transition-colors duration-300">
      <div>
        <p className="text-signal-gold text-[10px] font-extrabold uppercase tracking-[0.2em] mb-1">
          Team Rating
        </p>
        <h3 className="text-ink text-lg font-black tracking-tight">{rating.team}</h3>
      </div>
      <div className="flex flex-col gap-3.5 mt-2">
        {fields.map(([key, label]) => (
          <label key={key} className="grid grid-cols-[minmax(92px,120px)_minmax(120px,1fr)_28px] items-center gap-3 w-full">
            <span className="text-muted-text text-[11px] font-semibold uppercase tracking-[0.12em]">
              {label}
            </span>
            <input
              type="range"
              min="0"
              max="10"
              value={Number(rating[key])}
              onChange={(event) =>
                onChange({ [key]: Number(event.target.value) } as Partial<TeamRating>)
              }
              className="w-full min-w-0 cursor-pointer accent-pitch-green"
            />
            <b className="text-pitch-green text-sm font-bold text-right font-mono">
              {Number(rating[key])}
            </b>
          </label>
        ))}
      </div>
    </div>
  );
}

export default TeamRatingEditor;
