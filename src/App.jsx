import React, { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";

// Types
// Board shape: { columns: [{id,title,cardIds:[]}], cards: { [id]: {id,title,description?,labels?,checklist?} } }
const LS_KEY = "trello-lite-nodates-v1";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function starterBoard() {
  const c1 = uid("card");
  const c2 = uid("card");
  const c3 = uid("card");
  return {
    columns: [
      { id: uid("col"), title: "To Do", cardIds: [c1] },
      { id: uid("col"), title: "Doing", cardIds: [c2] },
      { id: uid("col"), title: "Done", cardIds: [c3] },
    ],
    cards: {
      [c1]: { id: c1, title: "Set up client board", description: "Create a clean, client‑safe board.", labels: ["setup"] },
      [c2]: { id: c2, title: "Draft copy", description: "Hero, benefits, CTA.", labels: ["copy"] },
      [c3]: { id: c3, title: "Share preview", description: "Send read‑only link.", labels: ["share"] },
    },
  };
}

function useBoardState() {
  const [board, setBoard] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null; // We'll lazy-load seed
  });

  // On first load, populate from public/board.json if present; fallback to starter
  useEffect(() => {
    if (board !== null) return;
    (async () => {
      try {
        const res = await fetch("/board.json", { cache: "no-store" });
        if (res.ok) {
          const seed = await res.json();
          if (seed && Array.isArray(seed.columns) && typeof seed.cards === "object") {
            localStorage.setItem(LS_KEY, JSON.stringify(seed));
            return setBoard(seed);
          }
        }
      } catch (e) {}
      const s = starterBoard();
      localStorage.setItem(LS_KEY, JSON.stringify(s));
      setBoard(s);
    })();
  }, [board]);

  // Persist
  useEffect(() => {
    if (board) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(board)); } catch(e) {}
    }
  }, [board]);

  return [board, setBoard];
}

// Inputs
function TextInput({ value, onChange, placeholder, className, ...props }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${className || ""}`}
      {...props}
    />
  );
}
function TextArea({ value, onChange, placeholder, className, ...props }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full min-h-[100px] rounded-xl border border-gray-300 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${className || ""}`}
      {...props}
    />
  );
}
function Badge({ children }) {
  return <span className="inline-flex items-center rounded-full border px-2 text-xs font-medium">{children}</span>;
}

// Modal
function Modal({ open, onClose, children, title, actions }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="relative z-10 w-full max-w-xl rounded-2xl bg-white p-5"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}
      >
        <div className="mb-3 text-lg font-semibold">{title}</div>
        <div className="mb-4">{children}</div>
        <div className="flex justify-end gap-2">{actions}</div>
      </motion.div>
    </div>
  );
}

// Sortable Card
function SortableCard({ card, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <motion.div
        layout
        className={`group mb-3 rounded-2xl bg-white p-4 ${isDragging ? "ring-2 ring-indigo-500" : ""}`}
        style={{ boxShadow: "0 6px 14px rgba(0,0,0,0.08)" }}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="text-sm font-semibold leading-snug">{card.title}</div>
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button onClick={() => onEdit(card)} className="rounded-xl border px-2 py-1 text-xs" aria-label="Edit card">Edit</button>
            <button onClick={() => onDelete(card.id)} className="rounded-xl border px-2 py-1 text-xs" aria-label="Delete card">Delete</button>
          </div>
        </div>
        {card.labels?.length ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {card.labels.map((l) => (<Badge key={l}>{l}</Badge>))}
          </div>
        ) : null}
        {card.description ? (<div className="text-sm" style={{ color: "#4b5563" }}>{card.description}</div>) : null}
        {card.checklist?.length ? (
          <div className="mt-3 text-sm" style={{ color: "#4b5563" }}>
            {card.checklist.filter((i) => i.done).length}/{card.checklist.length} checklist items
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

// Column
function ColumnView({ column, cards, onAddCard, onEditCard, onDeleteCard, onRename, onDeleteColumn }) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  return (
    <div className="flex w-[320px] flex-col rounded-2xl p-3" style={{ background: "rgba(248,250,252,0.9)", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <input
          value={column.title}
          onChange={(e) => onRename(e.target.value)}
          className="w-full rounded-xl border-0 bg-transparent px-2 py-1 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Column title"
        />
        <button onClick={onDeleteColumn} className="rounded-xl border px-2 py-1 text-xs" aria-label="Delete column">Del</button>
      </div>

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="min-h-[20px] flex-1">
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} onEdit={onEditCard} onDelete={onDeleteCard} />
          ))}
        </div>
      </SortableContext>

      {adding ? (
        <div className="mt-2">
          <TextInput value={newTitle} onChange={setNewTitle} placeholder="Card title" />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => { if (!newTitle.trim()) return; onAddCard(newTitle.trim()); setNewTitle(""); setAdding(false); }}
              className="rounded-xl px-3 py-1 text-sm font-medium text-white"
              style={{ background: "#4f46e5" }}
            >Add</button>
            <button onClick={() => setAdding(false)} className="rounded-xl border px-3 py-1 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 w-full rounded-xl border border-dashed px-3 py-2 text-left text-sm">+ Add card</button>
      )}
    </div>
  );
}

export default function App() {
  const [board, setBoard] = useBoardState();
  const [query, setQuery] = useState("");
  const [editingCard, setEditingCard] = useState(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const filteredBoard = useMemo(() => {
    if (!board || !query.trim()) return board;
    const q = query.toLowerCase();
    const cards = Object.fromEntries(
      Object.entries(board.cards).filter(([, c]) =>
        (c.title + " " + (c.description || "") + " " + (c.labels?.join(" ") || "")).toLowerCase().includes(q)
      )
    );
    const cardIds = new Set(Object.keys(cards));
    return {
      cards,
      columns: board.columns.map((col) => ({
        ...col,
        cardIds: col.cardIds.filter((id) => cardIds.has(id)),
      })),
    };
  }, [board, query]);

  function addColumn() {
    const id = uid("col");
    setBoard((b) => ({ ...b, columns: [...b.columns, { id, title: "New Column", cardIds: [] }] }));
  }
  function deleteColumn(colId) {
    setBoard((b) => ({ ...b, columns: b.columns.filter((c) => c.id !== colId) }));
  }
  function addCard(colId, title) {
    const id = uid("card");
    const newCard = { id, title, description: "", labels: [], checklist: [] };
    setBoard((b) => ({
      cards: { ...b.cards, [id]: newCard },
      columns: b.columns.map((c) => (c.id === colId ? { ...c, cardIds: [...c.cardIds, id] } : c)),
    }));
  }
  function updateCard(updated) {
    setBoard((b) => ({ ...b, cards: { ...b.cards, [updated.id]: updated } }));
  }
  function deleteCard(cardId) {
    setBoard((b) => ({
      cards: Object.fromEntries(Object.entries(b.cards).filter(([id]) => id !== cardId)),
      columns: b.columns.map((c) => ({ ...c, cardIds: c.cardIds.filter((id) => id !== cardId) })),
    }));
  }
  function renameColumn(colId, title) {
    setBoard((b) => ({ ...b, columns: b.columns.map((c) => (c.id === colId ? { ...c, title } : c)) }));
  }

  function onDragEnd(event) {
    const { active, over } = event;
    if (!over || !board) return;

    const fromCol = board.columns.find((c) => c.cardIds.includes(active.id));
    const toCol = board.columns.find((c) => c.cardIds.includes(over.id)) ||
                  board.columns.find((c) => c.cardIds.includes(active.id));

    if (fromCol && toCol) {
      const overIndex = toCol.cardIds.indexOf(over.id);
      setBoard((b) => {
        const cols = b.columns.map((c) => ({ ...c }));
        const f = cols.find((c) => c.id === fromCol.id);
        const t = cols.find((c) => c.id === toCol.id);
        if (!f || !t) return b;
        f.cardIds = f.cardIds.filter((id) => id !== active.id);
        if (overIndex >= 0) {
          t.cardIds = [...t.cardIds.slice(0, overIndex), active.id, ...t.cardIds.slice(overIndex)];
        } else {
          t.cardIds = [...t.cardIds, active.id];
        }
        return { ...b, columns: cols };
      });
      return;
    }

    const col = board.columns.find((c) => c.id === over.id);
    if (col && col.cardIds.includes(active.id)) {
      const oldIndex = col.cardIds.indexOf(active.id);
      const newIndex = col.cardIds.indexOf(over.id);
      setBoard((b) => ({
        ...b,
        columns: b.columns.map((c) => (c.id === col.id ? { ...c, cardIds: arrayMove(c.cardIds, oldIndex, newIndex) } : c)),
      }));
    }
  }

  function exportJSON() {
    const data = JSON.stringify(board, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "board-no-dates.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || !Array.isArray(data.columns) || typeof data.cards !== "object") throw new Error("Invalid file");
        localStorage.setItem(LS_KEY, JSON.stringify(data));
        setBoard(data);
        setImportOpen(false);
      } catch (e) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  }

  if (!board) return null;

  return (
    <div className="min-h-screen w-full" style={{ background: "linear-gradient(135deg,#f1f5f9,#e2e8f0)" }}>
      <div className="mx-auto max-w-[1400px] p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Trello‑lite (No Dates)</h1>
            <p className="text-sm" style={{ color: "#475569" }}>A clean Kanban board — no timestamps, no activity feed.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TextInput value={query} onChange={setQuery} placeholder="Search cards…" className="w-56" />
            <button onClick={addColumn} className="rounded-2xl px-3 py-2 text-sm font-semibold text-white" style={{ background: "#4f46e5" }}>Add Column</button>
            <button onClick={exportJSON} className="rounded-2xl border px-3 py-2 text-sm font-semibold">Export</button>
            <button onClick={() => setImportOpen(true)} className="rounded-2xl border px-3 py-2 text-sm font-semibold">Import</button>
            <button onClick={() => { if (confirm("Reset board?")) { localStorage.removeItem(LS_KEY); location.reload(); } }} className="rounded-2xl border px-3 py-2 text-sm font-semibold">Reset</button>
          </div>
        </div>

        <DndContext sensors={useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className="grid auto-cols-[320px] grid-flow-col gap-4">
            {filteredBoard.columns.map((col) => (
              <ColumnView
                key={col.id}
                column={col}
                cards={col.cardIds.map((id) => filteredBoard.cards[id]).filter(Boolean)}
                onAddCard={(title) => addCard(col.id, title)}
                onEditCard={(c) => setEditingCard(c)}
                onDeleteCard={deleteCard}
                onRename={(t) => renameColumn(col.id, t)}
                onDeleteColumn={() => deleteColumn(col.id)}
              />
            ))}
          </div>
        </DndContext>
      </div>

      <AnimatePresence>
        <Modal
          open={!!editingCard}
          onClose={() => setEditingCard(undefined)}
          title={editingCard ? `Edit: ${editingCard.title}` : ""}
          actions={(
            <>
              <button onClick={() => setEditingCard(undefined)} className="rounded-xl border px-3 py-1.5 text-sm">Close</button>
              <button onClick={() => { if (editingCard) deleteCard(editingCard.id); setEditingCard(undefined); }} className="rounded-xl border px-3 py-1.5 text-sm">Delete</button>
              <button onClick={() => { if (editingCard) updateCard(editingCard); setEditingCard(undefined); }} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-white" style={{ background: "#4f46e5" }}>Save</button>
            </>
          )}
        >
          {editingCard ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Title</label>
                <TextInput value={editingCard.title} onChange={(v) => setEditingCard({ ...editingCard, title: v })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Description</label>
                <TextArea value={editingCard.description || ""} onChange={(v) => setEditingCard({ ...editingCard, description: v })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Labels (comma separated)</label>
                <TextInput
                  value={(editingCard.labels || []).join(", ")}
                  onChange={(v) => setEditingCard({ ...editingCard, labels: v.split(",").map((s) => s.trim()).filter(Boolean) })}
                />
              </div>
              <ChecklistEditor
                value={editingCard.checklist || []}
                onChange={(list) => setEditingCard({ ...editingCard, checklist: list })}
              />
            </div>
          ) : null}
        </Modal>
      </AnimatePresence>

      <AnimatePresence>
        <Modal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          title="Import Board JSON"
          actions={(
            <>
              <button onClick={() => setImportOpen(false)} className="rounded-xl border px-3 py-1.5 text-sm">Cancel</button>
              <button onClick={() => fileRef.current?.click()} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-white" style={{ background: "#4f46e5" }}>Choose File</button>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files && importJSON(e.target.files[0])} />
            </>
          )}
        >
          <p className="text-sm" style={{ color: "#475569" }}>Import a board file exported from this app (or the preloaded one). This app never stores timestamps.</p>
        </Modal>
      </AnimatePresence>
    </div>
  );
}

function ChecklistEditor({ value, onChange }) {
  const [text, setText] = useState("");
  function addItem() {
    const t = text.trim();
    if (!t) return;
    onChange([...(value || []), { id: uid("chk"), text: t, done: false }]);
    setText("");
  }
  function toggle(id) {
    onChange(value.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }
  function remove(id) {
    onChange(value.filter((i) => i.id !== id));
  }
  return (
    <div>
      <div className="mb-2 text-sm font-medium">Checklist</div>
      <div className="space-y-2">
        {(value || []).map((i) => (
          <label key={i.id} className="flex items-center gap-2">
            <input type="checkbox" checked={i.done} onChange={() => toggle(i.id)} />
            <span className={`flex-1 text-sm ${i.done ? "line-through" : ""}`} style={{ color: i.done ? "#94a3b8" : "inherit" }}>{i.text}</span>
            <button onClick={() => remove(i.id)} className="rounded-lg border px-2 py-0.5 text-xs">Del</button>
          </label>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <TextInput value={text} onChange={setText} placeholder="Add checklist item" />
        <button onClick={addItem} className="rounded-xl border px-3 py-1.5 text-sm">Add</button>
      </div>
    </div>
  );
}
