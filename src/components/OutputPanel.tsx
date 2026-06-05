import React from "react";
import { Clipboard, Send } from "lucide-react";
import { Button } from "./ui/Button";

type OutputPanelProps = {
  title: string;
  icon: React.ReactNode;
  text: string;
  onCopy: () => void;
  copied: boolean;
  onPublish?: () => void;
  disabled?: boolean;
};

export function OutputPanel({
  title,
  icon,
  text,
  onCopy,
  copied,
  onPublish,
  disabled = false,
}: OutputPanelProps) {
  return (
    <article className="bg-paper border border-line-border/50 rounded-none p-5 flex flex-col gap-4 shadow-[0_24px_70px_-54px_rgba(0,0,0,0.8)] hover:border-signal-gold/35 transition-colors duration-300">
      <div className="flex items-center justify-between gap-4 border-b border-line-border/30 pb-3">
        <h2 className="flex items-center gap-2 text-ink font-black tracking-[-0.02em] text-base md:text-lg">
          {icon && <span className="text-signal-gold">{icon}</span>}
          {title}
        </h2>
        <div className="flex gap-2">
          <Button
            variant="glass"
            icon={<Clipboard size={15} />}
            onClick={onCopy}
            disabled={disabled}
            className="h-8 px-3 text-xs"
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          {onPublish && (
            <Button
              variant="success"
              icon={<Send size={15} />}
              onClick={onPublish}
              disabled={disabled}
              className="h-8 px-3 text-xs text-[#060913]"
            >
              {disabled ? "Publishing" : "Publish"}
            </Button>
          )}
        </div>
      </div>
      <pre className="bg-[#101b17]/95 border border-[#d0b36a]/20 rounded-none p-4 text-xs md:text-sm text-[#f6efe0] font-mono leading-relaxed overflow-auto max-h-72 min-h-48 whitespace-pre-wrap">
        {text}
      </pre>
    </article>
  );
}

export default OutputPanel;
