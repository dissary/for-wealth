import type { ReactNode } from "react";

// The frosted panel shared by the income and expense sections.
export function Card({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur">
      {children}
    </section>
  );
}
