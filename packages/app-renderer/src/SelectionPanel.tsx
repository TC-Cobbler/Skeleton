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
  onConfirm: () => void;
  onCancel: () => void;
}

/** The selected element: what it is, its agent logic, and deleting it (T3.4). */
export function SelectionPanel({ projectRoot, file, node, hovered, cannotDelete, confirming, onDelete, onConfirm, onCancel }: SelectionPanelProps) {
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
          <button type="button" onClick={onDelete} disabled={cannotDelete !== null} title={cannotDelete ?? "Delete (Del)"}>
            Delete
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
