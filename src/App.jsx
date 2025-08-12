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
      className={`tl-input w-full px-3 py-2 text-sm outline-none focus:border-blue-500 focus:shadow-sm ${className || ""}`}
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
      className={`tl-input w-full min-h-[100px] px-3 py-2 text-sm outline-none focus:border-blue-500 focus:shadow-sm resize-none ${className || ""}`}
      {...props}
    />
  );
}

function Badge({ children, color = "gray" }) {
  const colors = {
    gray: "bg-gray-100 text-gray-800",
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-800",
    purple: "bg-purple-100 text-purple-800",
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
}

// Modal
function Modal({ open, onClose, children, title, actions }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full max-w-2xl bg-white rounded-lg shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <div className="p-4">{children}</div>
        {actions && (
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50">
            {actions}
          </div>
        )}
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
        className={`tl-card group mb-2 p-3 cursor-pointer select-none ${
          isDragging ? "shadow-lg rotate-3 z-50" : "hover:shadow-md"
        }`}
        whileHover={{ y: -1 }}
        transition={{ duration: 0.1 }}
      >
        {/* Labels */}
        {card.labels?.length ? (
          <div className="mb-2 flex flex-wrap gap-1">
            {card.labels.map((label, index) => {
              const colors = ["blue", "green", "yellow", "red", "purple"];
              const color = colors[index % colors.length];
              return <Badge key={label} color={color}>{label}</Badge>;
            })}
          </div>
        ) : null}

        {/* Title */}
        <div className="text-sm font-medium text-gray-900 mb-1 leading-5">
          {card.title}
        </div>

        {/* Description */}
        {card.description ? (
          <div className="text-xs text-gray-600 mb-2 line-clamp-3">
            {card.description}
          </div>
        ) : null}

        {/* Footer with checklist and actions */}
        <div className="flex items-center justify-between">
          {card.checklist?.length ? (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>
                {card.checklist.filter((i) => i.done).length}/{card.checklist.length}
              </span>
            </div>
          ) : <div />}

          {/* Action buttons */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(card); }}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              aria-label="Edit card"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
              aria-label="Delete card"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 112 0v4a1 1 0 11-2 0V9zm4 0a1 1 0 112 0v4a1 1 0 11-2 0V9z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Column
function ColumnView({ column, cards, onAddCard, onEditCard, onDeleteCard, onRename, onDeleteColumn }) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  return (
    <div className="tl-column w-72 flex flex-col max-h-full">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        {isEditingTitle ? (
          <TextInput
            value={column.title}
            onChange={onRename}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
            className="font-semibold text-sm bg-transparent border-none p-1 -ml-1"
            autoFocus
          />
        ) : (
          <h3
            onClick={() => setIsEditingTitle(true)}
            className="font-semibold text-sm text-gray-800 cursor-pointer px-2 py-1 rounded hover:bg-gray-200 flex-1 truncate"
          >
            {column.title}
          </h3>
        )}

        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
            {cards.length}
          </span>
          <button
            onClick={onDeleteColumn}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            aria-label="Delete column"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Cards Area */}
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto u-fancy-scrollbar min-h-0 pb-2">
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} onEdit={onEditCard} onDelete={onDeleteCard} />
          ))}
        </div>
      </SortableContext>

      {/* Add Card */}
      {adding ? (
        <div className="mt-2 p-2 bg-white rounded border shadow-sm">
          <TextArea
            value={newTitle}
            onChange={setNewTitle}
            placeholder="Enter a title for this card..."
            className="mb-2 text-sm min-h-[60px]"
            autoFocus
          />
          <div className="flex gap-1">
            <button
              onClick={() => {
                if (!newTitle.trim()) return;
                onAddCard(newTitle.trim());
                setNewTitle("");
                setAdding(false);
              }}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
            >
              Add card
            </button>
            <button
              onClick={() => { setAdding(false); setNewTitle(""); }}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-1 p-2 text-sm text-gray-600 hover:bg-gray-200 hover:text-gray-800 rounded transition-colors flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add a card
        </button>
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
    setBoard((b) => ({ ...b, columns: [...b.columns, { id, title: "New List", cardIds: [] }] }));
  }

  function deleteColumn(colId) {
    if (!confirm("Are you sure you want to delete this list?")) return;
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
    if (!confirm("Are you sure you want to delete this card?")) return;
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

  if (!board) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800">
      {/* Header */}
      <header className="bg-black bg-opacity-20 backdrop-blur-sm border-b border-white border-opacity-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-white text-lg font-semibold">ClassTutor Content Plan</h1>
              <span className="text-blue-100 text-sm">August to November</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search cards..."
                  className="w-64 px-3 py-2 text-sm bg-white bg-opacity-90 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:bg-white"
                />
                <svg className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>

              <button
                onClick={addColumn}
                className="px-4 py-2 bg-white bg-opacity-90 hover:bg-white text-gray-800 text-sm font-medium rounded-lg transition-colors"
              >
                Add List
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={exportJSON}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                  title="Export board"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                <button
                  onClick={() => setImportOpen(true)}
                  className="p-2 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                  title="Import board"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 11-1.414 1.414L11 4.414V15a1 1 0 11-2 0V4.414L7.707 5.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>

                <button
                  onClick={() => {
                    if (confirm("This will reset the board to default. Are you sure?")) {
                      localStorage.removeItem(LS_KEY);
                      location.reload();
                    }
                  }}
                  className="p-2 text-white hover:bg-red-500 hover:bg-opacity-80 rounded-lg transition-colors"
                  title="Reset board"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Board */}
      <div className="p-4 h-[calc(100vh-64px)] overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-4 h-full overflow-x-auto u-fancy-scrollbar pb-4">
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

            {/* Add Column Button */}
            <div className="flex-shrink-0 w-72">
              <button
                onClick={addColumn}
                className="w-full p-3 text-white hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add another list
              </button>
            </div>
          </div>
        </DndContext>
      </div>

      {/* Edit Card Modal */}
      <AnimatePresence>
        {editingCard && (
          <Modal
            open={!!editingCard}
            onClose={() => setEditingCard(undefined)}
            title={editingCard.title}
            actions={
              <>
                <button
                  onClick={() => setEditingCard(undefined)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (editingCard) deleteCard(editingCard.id);
                    setEditingCard(undefined);
                  }}
                  className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => {
                    if (editingCard) updateCard(editingCard);
                    setEditingCard(undefined);
                  }}
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Save
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Title
                </label>
                <TextInput
                  value={editingCard.title}
                  onChange={(v) => setEditingCard({ ...editingCard, title: v })}
                  placeholder="Enter card title..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <TextArea
                  value={editingCard.description || ""}
                  onChange={(v) => setEditingCard({ ...editingCard, description: v })}
                  placeholder="Add a more detailed description..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Labels
                </label>
                <TextInput
                  value={(editingCard.labels || []).join(", ")}
                  onChange={(v) =>
                    setEditingCard({
                      ...editingCard,
                      labels: v.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="Enter labels separated by commas..."
                />
              </div>

              <ChecklistEditor
                value={editingCard.checklist || []}
                onChange={(list) => setEditingCard({ ...editingCard, checklist: list })}
              />
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Import Modal */}
      <AnimatePresence>
        {importOpen && (
          <Modal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            title="Import Board"
            actions={
              <>
                <button
                  onClick={() => setImportOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Choose File
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => e.target.files && importJSON(e.target.files[0])}
                />
              </>
            }
          >
            <div className="text-center py-8">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600 mb-2">
                Import a board file exported from this app
              </p>
              <p className="text-sm text-gray-500">
                Select a JSON file to import your board data
              </p>
            </div>
          </Modal>
        )}
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
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Checklist
      </label>

      <div className="space-y-2 mb-3">
        {(value || []).map((item) => (
          <div key={item.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => toggle(item.id)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span
              className={`flex-1 text-sm ${
                item.done ? "line-through text-gray-500" : "text-gray-900"
              }`}
            >
              {item.text}
            </span>
            <button
              onClick={() => remove(item.id)}
              className="p-1 text-gray-400 hover:text-red-600 rounded"
              aria-label="Remove item"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <TextInput
          value={text}
          onChange={setText}
          placeholder="Add checklist item..."
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          className="flex-1"
        />
        <button
          onClick={addItem}
          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}
