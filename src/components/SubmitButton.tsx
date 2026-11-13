"use client";

import { useFormStatus } from "react-dom";

/**
 * A form button that turns redwood and shows a spinner while the form is working,
 * so it's obvious the tap registered.
 */
export default function SubmitButton({ children, pendingText, className = "btn secondary", style }: {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      disabled={pending}
      aria-busy={pending}
      style={{
        width: "100%",
        ...style,
        ...(pending ? { background: "var(--redwood)", color: "var(--ground)", borderColor: "var(--redwood)", opacity: 1 } : {}),
      }}
    >
      {pending && <span className="spinner" aria-hidden="true" />}
      {pending ? pendingText : children}
    </button>
  );
}
