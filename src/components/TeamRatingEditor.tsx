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
    <section className="rating-card">
      <p className="eyebrow gold">Team Rating</p>
      <h3 className="mt-1 mb-3 text-ink font-display [font-variation-settings:'opsz'_60] font-medium text-[1.25rem] tracking-[-0.015em]">
        {rating.team}
      </h3>
      <div className="flex flex-col gap-3 mt-1">
        {fields.map(([key, label]) => (
          <label key={key} className="slider">
            <span>{label}</span>
            <input
              type="range"
              min="0"
              max="10"
              value={Number(rating[key])}
              onChange={(event) =>
                onChange({ [key]: Number(event.target.value) } as Partial<TeamRating>)
              }
            />
            <b>{Number(rating[key])}</b>
          </label>
        ))}
      </div>
    </section>
  );
}

export default TeamRatingEditor;
