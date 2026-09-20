import React from "react";
import { IconBtn } from "../primitives";

function isModalHeader(node: React.ReactNode): boolean {
  return React.isValidElement(node) && node.type === ModalHeader;
}

function isModalFooter(node: React.ReactNode): boolean {
  return React.isValidElement(node) && node.type === ModalFooter;
}

export function Modal({
  width = 720,
  onClose,
  children,
}: {
  width?: number;
  onClose?: () => void;
  children?: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  const header = items.find(isModalHeader);
  const footer = items.filter(isModalFooter);
  const body = items.filter((item) => !isModalHeader(item) && !isModalFooter(item));

  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", zIndex: 50, padding: 28 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", animation: "ddfadein .15s ease" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "relative",
          width,
          maxWidth: "100%",
          maxHeight: "92%",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: 14,
          boxShadow: "var(--shadow-modal)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "ddpop .18s ease",
        }}
      >
        {header}
        <div style={{ flex: 1, overflow: "auto" }}>{body}</div>
        {footer}
      </div>
    </div>
  );
}

/** Slot for a modal's title row — place as the first child of `Modal`
 *  instead of `title`/`subtitle`/`onClose` props:
 *  `<Modal onClose={...}><Modal.Header title="..." subtitle="..." onClose={...} />...</Modal>`.
 *  `onClose` here only wires the visible close button; `Modal`'s own
 *  `onClose` prop still handles the backdrop click. */
function ModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "18px 24px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {onClose && <IconBtn icon="X" label="Close" onClick={onClose} />}
    </div>
  );
}

Modal.Header = ModalHeader;

/** Slot for a modal's action row — place as the last child of `Modal`
 *  instead of a `footer` prop:
 *  `<Modal ...><div>...</div><Modal.Footer>...</Modal.Footer></Modal>`.
 *  Only supplies the shared chrome (divider/padding/background); layout of
 *  the buttons inside is up to the caller. */
function ModalFooter({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "16px 24px", background: "var(--bg-elevated)", }}>
      {children}
    </div>
  );
}

Modal.Footer = ModalFooter;
