import { ReactNode } from "react";

interface CardProps {
  eyebrow?: string;
  title?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function Card({ eyebrow, title, action, children, className = "" }: CardProps) {
  return (
    <section
      className={`bg-[var(--bg-surface)] border border-[var(--rule)] ${className}`}
      style={{ borderRadius: 2 }}
    >
      {(eyebrow || title || action) && (
        <header className="flex items-end justify-between gap-4 px-6 pt-5 pb-4 border-b border-[var(--rule)]">
          <div>
            {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
            {title && <h2 className="display text-[20px] leading-tight">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}
