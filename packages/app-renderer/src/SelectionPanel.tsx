import type { UiNode } from "@skeleton/app-main/ipc";
import { ViewSource } from "./ViewSource.js";
import { copy } from "./copy.js";
import { agentControlName, agentControlShown, elementKind, elementName } from "./names.js";
import { Tooltip } from "./Tooltip.js";

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

/** The selected element: what it is, its agent controls, reordering it (F-2) and deleting it (T3.4). */
export function SelectionPanel({ projectRoot, file, node, hovered, cannotDelete, confirming, onDelete, cannotMove, onMove, openable, onToggleOpen, onConfirm, onCancel }: SelectionPanelProps) {
  const controls = node ? [...new Set(node.protectedProps.filter(agentControlShown).map(agentControlName))] : [];
  return (
    <section aria-label={copy.selection.title} data-testid="selection">
      <h2>{copy.selection.title}</h2>
      {node ? (
        <dl className="inspector">
          {/* What tests check it by, never shown: code name, classification, data-ui-id, lock reason. */}
          <div hidden>
            <span data-testid="selection-name">{node.name}</span>
            <span data-testid="selection-kind">{node.kind}</span>
            <span data-testid="selection-id">{node.id ?? ""}</span>
            {node.lockReason && <span data-testid="selection-lock">{node.lockReason}</span>}
          </div>
          <dt>{copy.selection.element}</dt>
          <dd data-testid="selection-element">{elementName(node)}</dd>
          {node.kind === "locked" && (
            <>
              <dt>{copy.selection.locked}</dt>
              <dd>{elementKind(node)}</dd>
            </>
          )}
          {controls.length > 0 && (
            <>
              <dt>{copy.selection.agentLogic}</dt>
              <dd>{controls.join(", ")}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="muted">{hovered ? copy.selection.clickToSelect : copy.selection.nothing}</p>
      )}
      {node && (
        <div className="row actions">
          <Tooltip text={cannotMove.up ?? copy.selection.moveUpTitle}>
            <button type="button" onClick={() => onMove("up")} disabled={cannotMove.up !== null} data-testid="move-up">
              {copy.selection.moveUp}
            </button>
          </Tooltip>
          <Tooltip text={cannotMove.down ?? copy.selection.moveDownTitle}>
            <button type="button" onClick={() => onMove("down")} disabled={cannotMove.down !== null} data-testid="move-down">
              {copy.selection.moveDown}
            </button>
          </Tooltip>
          <Tooltip text={cannotDelete ?? copy.selection.deleteTitle}>
            <button type="button" onClick={onDelete} disabled={cannotDelete !== null}>
              {copy.common.delete}
            </button>
          </Tooltip>
        </div>
      )}
      {node && openable && (
        <div className="row actions">
          <Tooltip text={openable.open === null ? copy.selection.noTrigger(openable.name) : copy.selection.openTitle}>
            <button
              type="button"
              aria-pressed={openable.open === true}
              disabled={openable.open === null}
              onClick={onToggleOpen}
              data-testid="open-in-canvas"
            >
              {openable.open ? copy.selection.close(openable.name) : copy.selection.open(openable.name)}
            </button>
          </Tooltip>
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
