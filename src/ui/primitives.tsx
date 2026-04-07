import type { ReactNode } from "react";
import type { StatusTone } from "./format";

export type StatusPillModel = {
  label: string;
  tone: StatusTone;
};

export type MetricItemModel = {
  label: string;
  value: string;
  caption?: string;
  tone?: StatusTone;
};

type SectionShellProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
  "data-testid"?: string;
};

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function SectionShell(props: SectionShellProps) {
  const { title, subtitle, eyebrow, actions, className, children } = props;

  return (
    <section className={cx("section-shell", className)} data-testid={props["data-testid"]}>
      <header className="section-shell__header">
        <div>
          {eyebrow ? <p className="section-shell__eyebrow">{eyebrow}</p> : null}
          <h2 className="section-shell__title">{title}</h2>
          {subtitle ? <p className="section-shell__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="section-shell__actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

type StatusPillProps = {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
};

export function StatusPill(props: StatusPillProps) {
  const { tone, children, className } = props;

  return (
    <span className={cx("status-pill", `status-pill--${tone}`, className)} data-testid={props["data-testid"]}>
      {children}
    </span>
  );
}

type MetricStripProps = {
  items: MetricItemModel[];
  className?: string;
};

export function MetricStrip({ items, className }: MetricStripProps) {
  return (
    <div className={cx("metric-strip", className)}>
      {items.map((item) => (
        <article key={item.label} className={cx("metric-item", item.tone ? `metric-item--${item.tone}` : undefined)}>
          <span className="metric-item__label">{item.label}</span>
          <strong className="metric-item__value">{item.value}</strong>
          {item.caption ? <span className="metric-item__caption">{item.caption}</span> : null}
        </article>
      ))}
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  body: string;
  actions?: ReactNode;
  className?: string;
};

export function EmptyState({ title, body, actions, className }: EmptyStateProps) {
  return (
    <div className={cx("empty-state", className)}>
      <strong>{title}</strong>
      <p>{body}</p>
      {actions ? <div className="empty-state__actions">{actions}</div> : null}
    </div>
  );
}
