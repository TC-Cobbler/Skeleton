import { useEffect, useState } from "react";
import type { NoteOp, NoteType, NoteView, NotesView, Reply } from "@skeleton/app-main/ipc";
import { call } from "./bridge.js";
import { copy } from "./copy.js";
import { filterNotes, looseReplies, repliesFor, TYPE_LABEL, type NoteFilter } from "./notes.js";
import { messageFor, type Message } from "./messages.js";
import { MessageText } from "./Toasts.js";
import { IconButton, Tooltip } from "./Tooltip.js";
import { X } from "lucide-react";

/** The project's notes and replies, re-read when files change. */
export function useNotes(projectRoot: string, revision: number): { view: NotesView | null; error: Message | null; set: (view: NotesView) => void } {
  const [view, setView] = useState<NotesView | null>(null);
  const [error, setError] = useState<Message | null>(null);
  useEffect(() => {
    let cancelled = false;
    call("notes:read", { projectRoot }).then(
      (next) => {
        if (cancelled) return;
        setView(next);
        setError(null);
      },
      (err: unknown) => !cancelled && setError(messageFor(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [projectRoot, revision]);
  return { view, error, set: setView };
}

const TYPES: NoteType[] = ["build", "behaviour", "question"];

export interface NotesPanelProps {
  view: NotesView | null;
  error: Message | null;
  /** The selected element, if any. Notes pin to its data-ui-id. */
  selected: { id: string | null; name: string } | null;
  /** Only this element's notes (a pin was clicked), or null for all. */
  focus: string | null;
  onFocus: (target: string | null) => void;
  /** The project is with the agent: notes can be read, not changed. */
  readOnly: boolean;
  onWrite: (op: NoteOp) => Promise<void>;
  onSelectTarget: (note: NoteView) => void;
}

/**
 * Intent notes (T5.1, PRD §12.1): pin Build, Behaviour and Question notes to elements,
 * filter them, and read the agent's replies. Notes whose element is gone wait in the
 * orphan tray (T5.5) to be re-attached or discarded.
 */
export function NotesPanel({ view, error, selected, focus, onFocus, readOnly, onWrite, onSelectTarget }: NotesPanelProps) {
  const [filter, setFilter] = useState<Omit<NoteFilter, "target">>({ type: "all", status: "open" });
  const notes = view ? filterNotes(view.notes, { ...filter, target: focus }) : [];
  const orphans = view?.notes.filter((n) => n.orphaned) ?? [];
  const loose = view ? looseReplies(view) : [];
  const canPin = selected?.id ?? null;
  return (
    <section aria-label={copy.notes.title} className="notes" data-testid="notes">
      <h2>{copy.notes.title}</h2>
      {error && <MessageText message={error} />}
      {readOnly && <p className="muted small">{copy.notes.readOnly}</p>}
      {!readOnly && selected && (canPin ? <AddNote target={canPin} name={selected.name} onWrite={onWrite} /> : <p className="muted small">{copy.notes.cantPin(selected.name)}</p>)}
      {!readOnly && !selected && <p className="muted small">{copy.notes.selectToPin}</p>}
      <div className="segmented" role="group" aria-label={copy.notes.type}>
        {(["all", ...TYPES] as const).map((t) => (
          <button key={t} type="button" aria-pressed={filter.type === t} onClick={() => setFilter((f) => ({ ...f, type: t }))}>
            {t === "all" ? copy.notes.all : TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label={copy.notes.status}>
        {(["open", "resolved", "all"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={filter.status === s} onClick={() => setFilter((f) => ({ ...f, status: s }))}>
            {copy.notes.statusFilter[s]}
          </button>
        ))}
      </div>
      {focus && (
        <p className="row small">
          {copy.notes.focusOn} <code>{focus}</code> {copy.notes.focusOnly}
          <IconButton className="quiet" icon={X} size={16} label={copy.notes.showAll} onClick={() => onFocus(null)} />
        </p>
      )}
      {view && notes.length === 0 && <p className="muted small">{copy.notes.empty}</p>}
      <ul role="list" className="note-list">
        {notes.map((n) => (
          <NoteRow key={n.id} note={n} replies={view ? repliesFor(view.replies, n.target) : []} readOnly={readOnly} onWrite={onWrite} onSelectTarget={onSelectTarget} />
        ))}
      </ul>
      {loose.length > 0 && (
        <>
          <h3>{copy.notes.otherReplies}</h3>
          <ul role="list" className="note-list">
            {loose.map((r, i) => (
              <li key={i} className="note-reply" data-testid="loose-reply">
                {r.target && <code>{r.target}</code>} {r.text} <span className="muted">{copy.notes.replyPass(r.pass)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {orphans.length > 0 && (
        <div className="orphans" data-testid="orphan-tray">
          <h3>{copy.notes.orphaned(orphans.length)}</h3>
          <p className="muted small">{copy.notes.orphanedHint}</p>
          <ul role="list" className="note-list">
            {orphans.map((n) => (
              <li key={n.id} className="note" data-testid="orphan">
                <div className="note-head">
                  <span className={`note-type note-${n.type}`}>{TYPE_LABEL[n.type]}</span>
                  <span className="muted small">{copy.notes.wasOn(n.target)}</span>
                </div>
                <div>{n.text}</div>
                {!readOnly && (
                  <div className="row note-actions">
                    <Tooltip text={canPin ? copy.notes.attachTitle(selected?.name, canPin) : copy.notes.attachNeedsId}>
                      <button type="button" disabled={!canPin} onClick={() => canPin && void onWrite({ op: "update", id: n.id, target: canPin })}>
                        {copy.notes.attach}
                      </button>
                    </Tooltip>
                    <button type="button" className="danger" onClick={() => void onWrite({ op: "delete", id: n.id })}>
                      {copy.notes.discard}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AddNote({ target, name, onWrite }: { target: string; name: string; onWrite: (op: NoteOp) => Promise<void> }) {
  const [type, setType] = useState<NoteType>("build");
  const [text, setText] = useState("");
  return (
    <form
      className="note-form"
      aria-label={copy.notes.addForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() === "") return;
        onWrite({ op: "add", target, type, text }).then(
          () => setText(""),
          () => undefined, // The error is shown as a toast; the text stays to try again.
        );
      }}
    >
      <label className="small muted">
        {copy.notes.noteOn(name, target)}
      </label>
      <div className="row">
        <select aria-label={copy.notes.type} value={type} onChange={(e) => setType(e.target.value as NoteType)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <input aria-label={copy.notes.text} placeholder={type === "question" ? copy.notes.askPlaceholder : copy.notes.taskPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={text.trim() === ""}>
          {copy.notes.add}
        </button>
      </div>
    </form>
  );
}

function NoteRow({ note, replies, readOnly, onWrite, onSelectTarget }: { note: NoteView; replies: Reply[]; readOnly: boolean; onWrite: (op: NoteOp) => Promise<void>; onSelectTarget: (note: NoteView) => void }) {
  return (
    <li className={`note${note.status === "resolved" ? " is-resolved" : ""}`} data-testid="note" data-note-id={note.id}>
      <div className="note-head">
        <span className={`note-type note-${note.type}`}>{TYPE_LABEL[note.type]}</span>
        <Tooltip text={note.file ?? undefined}>
          <button type="button" className="link" onClick={() => onSelectTarget(note)}>
            {copy.pass.elementRef(note.element ?? copy.notes.element, note.target)}
          </button>
        </Tooltip>
        <span className="muted small" data-testid="note-status">
          {note.status === "resolved" ? copy.notes.resolvedStatus : note.handoff ? copy.notes.sentIn(note.handoff) : copy.notes.openStatus}
        </span>
      </div>
      <div className="note-text">{note.text}</div>
      {replies.map((r, i) => (
        <div key={i} className="note-reply" data-testid="note-reply">
          <span className="muted">{copy.notes.agentReply(r.pass)}</span> {r.text}
        </div>
      ))}
      {!readOnly && (
        <div className="row note-actions">
          <button type="button" onClick={() => void onWrite({ op: "update", id: note.id, status: note.status === "open" ? "resolved" : "open" })}>
            {note.status === "open" ? copy.notes.resolve : copy.notes.reopen}
          </button>
          <button type="button" className="quiet" onClick={() => void onWrite({ op: "delete", id: note.id })}>
            {copy.common.delete}
          </button>
        </div>
      )}
    </li>
  );
}
