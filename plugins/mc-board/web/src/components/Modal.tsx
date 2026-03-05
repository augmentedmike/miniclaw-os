"use client";

import { useEffect } from "react";

interface Props {
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ onClose, children }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      <div className="flex flex-col flex-1 min-h-0 w-full max-w-3xl mx-auto">
        {children}
      </div>
    </div>
  );
}
