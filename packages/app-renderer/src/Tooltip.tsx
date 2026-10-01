// Tooltips and icon buttons (T8.5, docs/ui-refresh-spec.md §3, §5). Every icon-only
// button says what it does on hover and on keyboard focus; hints that were native
// `title=` attributes show the same way. A hint is also the element's
// aria-description, so screen readers (and tests) get it without hovering.

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";

/** How long the pointer rests before a hover shows the hint. Keyboard focus shows it at once. */
const HOVER_DELAY_MS = 500;

/**
 * A hint for the element these props go on: shown after a short hover or at once on
 * keyboard focus, hidden on leaving, blur or Escape. Render `node` inside the element.
 */
export function useTooltip(text: string | null | undefined, describe = true) {
  // Where to show it: under the element, in the window (panels scroll and clip).
  const [shown, setShown] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const hide = useCallback(() => {
    clear();
    setShown(null);
  }, []);
  const at = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom + 6 };
  };
  useEffect(() => clear, []);
  useEffect(() => {
    if (!text) hide();
  }, [text, hide]);
  const props = {
    "data-tooltip-anchor": "",
    "aria-description": describe ? (text ?? undefined) : undefined,
    onMouseEnter: (e: { currentTarget: Element }) => {
      if (!text) return;
      clear();
      const point = at(e.currentTarget);
      timer.current = setTimeout(() => setShown(point), HOVER_DELAY_MS);
    },
    onMouseLeave: hide,
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (
        text &&
        e.target instanceof HTMLElement &&
        e.target.matches(":focus-visible")
      )
        setShown(at(e.currentTarget));
    },
    onBlur: hide,
    onKeyDown: (e: { key: string }) => {
      if (e.key === "Escape") hide();
    },
  };
  const node =
    shown && text ? (
      <span
        className="tooltip"
        role="tooltip"
        id={id}
        style={{ left: shown.x, top: shown.y }}
      >
        {text}
      </span>
    ) : null;
  return { props, node, shown: shown !== null };
}

/**
 * A hint on one element, e.g. a button. The hint goes on a wrapper, because a disabled
 * button gets no pointer events and its hint (why it's off) must still show.
 */
export function Tooltip({
  text,
  describe = true,
  children,
}: {
  text: string | null | undefined;
  /** Also make the hint the element's aria-description (not when it only repeats the label). */
  describe?: boolean;
  children: ReactElement<{ "aria-description"?: string | undefined }>;
}) {
  const tip = useTooltip(text, describe);
  const { "aria-description": description, ...anchor } = tip.props;
  return (
    <span className="tooltip-wrap" {...anchor}>
      {cloneElement(children, { "aria-description": description })}
      {tip.node}
    </span>
  );
}

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "title" | "children"
> {
  /** What it does, in plain words: its accessible name and its tooltip. Required. */
  label: string;
  icon: LucideIcon;
  /** Shown instead of the label when there's more to say, e.g. why it's off. */
  hint?: string | null;
  /** 20 by default; 16 in lists. */
  size?: 16 | 20;
  children?: ReactNode;
}

/** A button that shows only an icon (spec §3): Lucide at a 1.5px stroke, with its label as the tooltip. */
export function IconButton({
  label,
  icon: Icon,
  hint,
  size = 20,
  className,
  children,
  ...button
}: IconButtonProps) {
  return (
    <Tooltip text={hint ?? label} describe={hint != null}>
      <button
        type="button"
        {...button}
        aria-label={label}
        className={`icon-button${className ? ` ${className}` : ""}`}
      >
        <Icon
          size={size}
          strokeWidth={1.5}
          absoluteStrokeWidth
          aria-hidden="true"
        />
        {children}
      </button>
    </Tooltip>
  );
}

type Hintable = HTMLAttributes<HTMLElement> & {
  "aria-description"?: string | undefined;
};

/**
 * A hint on an element that can't be wrapped, e.g. a list row: the hint's handlers join
 * the element's own, and the tooltip is drawn inside it.
 */
export function Hinted({
  text,
  children,
}: {
  text: string | null | undefined;
  children: ReactElement<Hintable>;
}) {
  const tip = useTooltip(text);
  const own = children.props;
  const both =
    <E,>(a: ((e: E) => void) | undefined, b: (e: E) => void) =>
    (e: E) => {
      a?.(e);
      b(e);
    };
  return cloneElement(
    children,
    {
      "data-tooltip-anchor": "",
      "aria-description": tip.props["aria-description"],
      onMouseEnter: both(own.onMouseEnter, tip.props.onMouseEnter),
      onMouseLeave: both(own.onMouseLeave, tip.props.onMouseLeave),
      onFocus: both(own.onFocus, tip.props.onFocus),
      onBlur: both(own.onBlur, tip.props.onBlur),
      onKeyDown: both(own.onKeyDown, tip.props.onKeyDown),
    } as Hintable,
    own.children,
    tip.node,
  );
}
