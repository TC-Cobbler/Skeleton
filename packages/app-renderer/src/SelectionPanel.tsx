import type { UiNode } from "@skeleton/app-main/ipc";
import { ViewSource } from "./ViewSource.js";
import { copy } from "./copy.js";

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
    <section aria-label={copy.selection.title} data-testid="selection">
      <h2>{copy.selection.title}</h2>
      {node ? (
        <dl className="inspector">
          <dt>{copy.selection.element}</dt>
          <dd data-testid="selection-name">{node.name}</dd>
          <dt>{copy.selection.kind}</dt>
          <dd data-testid="selection-kind">{node.kind}</dd>
          <dt>{copy.selection.id}</dt>
          <dd data-testid="selection-id">{node.id ?? copy.selection.noId}</dd>
          {node.lockReason && (
            <>
              <dt>{copy.selection.locked}</dt>
              <dd data-testid="selection-lock">{node.lockReason}</dd>
            </>
          )}
          {node.protectedProps.length > 0 && (
            <>
              <dt>{copy.selection.agentLogic}</dt>
              <dd>{node.protectedProps.join(", ")}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="muted">{hovered ? copy.selection.clickToSelect : copy.selection.nothing}</p>
      )}
      {node && (
        <div className="row actions">
          <button type="button" onClick={() => onMove("up")} disabled={cannotMove.up !== null} title={cannotMove.up ?? copy.selection.moveUpTitle} data-testid="move-up">
            {copy.selection.moveUp}
          </button>
          <button type="button" onClick={() => onMove("down")} disabled={cannotMove.down !== null} title={cannotMove.down ?? copy.selection.moveDownTitle} data-testid="move-down">
            {copy.selection.moveDown}
          </button>
          <button type="button" onClick={onDelete} disabled={cannotDelete !== null} title={cannotDelete ?? copy.selection.deleteTitle}>
            {copy.common.delete}
          </button>
        </div>
      )}
      {node && openable && (
        <div className="row actions">
          <button
            type="button"
            aria-pressed={openable.open === true}
            disabled={openable.open === null}
            title={openable.open === null ? copy.selection.noTrigger(openable.name) : copy.selection.openTitle}
            onClick={onToggleOpen}
            data-testid="open-in-canvas"
          >
            {openable.open ? copy.selection.close(openable.name) : copy.selection.open(openable.name)}
          </button>
        </div>
      )}
      {node && confirming && (
        <div className="confirm" role="alertdialog" aria-label={copy.selection.confirmDelete} data-testid="confirm-delete">
          <p>
            <strong>{copy.selection.deletesAgentCode}</strong>
          </p>
          <ul>
            {confirming.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="row">
            <button type="button" className="danger" onClick={onConfirm}>
              {copy.selection.deleteAnyway}
            </button>
            <button type="button" onClick={onCancel} autoFocus>
              {copy.common.cancel}
            </button>
          </div>
        </div>
      )}
      {node?.kind === "locked" && file && <ViewSource projectRoot={projectRoot} file={file} node={node} />}
    </section>
  );
}
