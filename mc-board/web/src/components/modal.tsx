"use client";

import { useEffect } from "react";
import { registerModal, unregisterModal } from "./modal-stack";

interface Props {
  onClose: () => void;
  children: React.ReactNode;
  zIndex?: number;
}

export function Modal({ onClose, children, zIndex = 50 }: Props) {
  useEffect(() => {
    registerModal(onClose);
    return () => unregisterModal(onClose);
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black" style={{ zIndex: zIndex * 10 }}>
      <div className="flex flex-col w-full max-w-3xl mx-auto bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl" style={{ height: "90vh" }}>
        {children}
      </div>
    </div>
  );
}
