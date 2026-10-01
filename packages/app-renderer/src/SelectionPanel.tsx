import type { UiNode } from "@skeleton/app-main/ipc";
import { ViewSource } from "./ViewSource.js";

export interface SelectionPanelProps {
  projectRoot: string;
  file: string | null;
  node: UiNode | null;
  hovered: boolean;
  /** Why the selection can't be deleted, or null if it can. */
  cannotDelete: string | null;
  /** Agent code a delete would take with it; shown for confirmation when set. */
  confirming: string[] | null;
  onDelete: () => void;
  /** Why the selection can't move up / down among its siblings, or null if it can (F-2). */
  cannotMove: { up: string | null; down: string | null };
  onMove: (direction: "up" | "down") => void;
  /** The Dialog or Sheet the selection is or is in, and whether it's open on the canvas (null: unknown, F-6). */
  openable: { name: string; open: boolean | null } | null;
  onToggleOpen: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The selected element: what it is, its agent logic, reordering it (F-2) and deleting it (T3.4). */
export function SelectionPanel({ projectRoot, file, node, hovered, cannotDelete, confirming, onDelete, cannotMove, onMove, openable, onToggleOpen, onConfirm, onCancel }: SelectionPanelProps) {
  return (
    <section aria-label="Selection" data-testid="selection">
      <h2>Selection</h2>
      {node ? (
        <dl className="inspector">
          <dt>Element</dt>
          <dd data-testid="selection-name">{node.name}</dd>
          <dt>Kind</dt>
          <dd data-testid="selection-kind">{node.kind}</dd>
          <dt>ID</dt>
          <dd data-testid="selection-id">{node.id ?? "none"}</dd>
          {node.lockReason && (
            <>
              <dt>Locked</dt>
              <dd data-testid="selection-lock">{node.lockReason}</dd>
            </>
          )}
          {node.protectedProps.length > 0 && (
            <>
              <dt>Agent logic</dt>
              <dd>{node.protectedProps.join(", ")}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="muted">{hovered ? "Click to select." : "Nothing selected."}</p>
      )}
      {node && (
        <div className="row actions">
          <button type="button" onClick={() => onMove("up")} disabled={cannotMove.up !== null} title={cannotMove.up ?? "Move up (Alt+↑)"} data-testid="move-up">
            Move up
          </button>
          <button type="button" onClick={() => onMove("down")} disabled={cannotMove.down !== null} title={cannotMove.down ?? "Move down (Alt+↓)"} data-testid="move-down">
            Move down
          </button>
          <button type="button" onClick={onDelete} disabled={cannotDelete !== null} title={cannotDelete ?? "Delete (Del)"}>
            Delete
          </button>
        </div>
      )}
      {node && openable && (
        <div className="row actions">
          <button
            type="button"
            aria-pressed={openable.open === true}
            disabled={openable.open === null}
            title={openable.open === null ? `Its trigger isn't on the canvas: the app opens this ${openable.name} some other way.` : "Opens it the way the app does, by its trigger; the code doesn't change."}
            onClick={onToggleOpen}
            data-testid="open-in-canvas"
          >
            {openable.open ? `Close ${openable.name}` : `Open ${openable.name} in canvas`}
          </button>
        </div>
      )}
      {node && confirming && (
        <div className="confirm" role="alertdialog" aria-label="Confirm delete" data-testid="confirm-delete">
          <p>
            <strong>This deletes agent code too:</strong>
          </p>
          <ul>
            {confirming.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="row">
            <button type="button" className="danger" onClick={onConfirm}>
              Delete anyway
            </button>
            <button type="button" onClick={onCancel} autoFocus>
              Cancel
            </button>
          </div>
        </div>
      )}
      {node?.kind === "locked" && file && <ViewSource projectRoot={projectRoot} file={file} node={node} />}
    </section>
  );
}
