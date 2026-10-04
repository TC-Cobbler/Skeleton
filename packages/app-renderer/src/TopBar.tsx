// The top bar (T8.6, layout D, docs/ui-refresh-spec.md §2): the project's name, the
// page picker, undo and redo, and the ⋯ menu with the advanced things (the app
// preview and its log, About, closing the project).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Ellipsis } from "lucide-react";
import type { AppInfo } from "@skeleton/app-main/ipc";
import { copy } from "./copy.js";
import { IconButton } from "./Tooltip.js";

/**
 * A pop-over that opens from a button and closes on Escape, on a press outside it, or
 * when `close` is called. Its content stays in the page while closed (hidden), so what
 * it shows can still be read.
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPress = (e: PointerEvent) => {
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress);
    };
  }, [open]);
  return { open, setOpen, box, toggle: () => setOpen((o) => !o), close: () => setOpen(false) };
}

/** The page picker: "Page: Home ▾", opening the pages list with add, rename and delete. */
export function PagePicker({ current, children }: { current: string | null; children: (close: () => void) => ReactNode }) {
  const pop = usePopover();
  return (
    <div className="popover-anchor" ref={pop.box}>
      <button type="button" className="page-picker" aria-expanded={pop.open} aria-haspopup="true" onClick={pop.toggle}>
        {copy.topBar.page(current ?? copy.topBar.noPage)}
        <ChevronDown size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      </button>
      <div className="menu page-menu" hidden={!pop.open}>
        {children(pop.close)}
      </div>
    </div>
  );
}

/** The ⋯ menu: the app preview, About, and closing the project. */
export function MoreMenu({
  appPreview,
  onAppPreview,
  onClose,
  about,
}: {
  /** Whether the app preview panel is showing; absent before a project is open. */
  appPreview?: boolean;
  onAppPreview?: () => void;
  onClose?: () => void;
  about: ReactNode;
}) {
  const pop = usePopover();
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <div className="popover-anchor" ref={pop.box}>
      <IconButton label={copy.topBar.more} icon={Ellipsis} aria-expanded={pop.open} aria-haspopup="menu" onClick={pop.toggle} />
      <div className="menu more-menu" role="menu" hidden={!pop.open}>
        {onAppPreview && (
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={appPreview === true}
            onClick={() => {
              onAppPreview();
              pop.close();
            }}
          >
            {copy.topBar.appPreview}
          </button>
        )}
        <button type="button" role="menuitemcheckbox" aria-checked={aboutOpen} onClick={() => setAboutOpen((o) => !o)}>
          {copy.topBar.about}
        </button>
        {onClose && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              pop.close();
              onClose();
            }}
          >
            {copy.app.closeProject}
          </button>
        )}
        <div className="about" hidden={!aboutOpen}>
          {about}
        </div>
      </div>
    </div>
  );
}

/** What Skeleton is and runs on, and the licences of what it ships. */
export function About({ info, projectRoot }: { info: AppInfo | null; projectRoot: string | null }) {
  return (
    <div className="small">
      {projectRoot && (
        <p>
          <code data-testid="project-root">{projectRoot}</code>
        </p>
      )}
      {info && (
        <p className="muted" data-testid="app-info">
          {copy.app.info(info)}
        </p>
      )}
      <p className="muted">{copy.app.licences}</p>
    </div>
  );
}
