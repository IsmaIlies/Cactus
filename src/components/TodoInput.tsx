import React, { useEffect, useState } from "react";
import {
  listenToTodos,
  addTodo,
  deleteTodo,
  toggleTodo,
  TodoItem,
} from "../services/todoService"; // adapte le chemin si besoin

interface TodoInputProps {
  userUID: string; // L'UID Firebase de l'utilisateur connecté
}

const TodoInput: React.FC<TodoInputProps> = ({ userUID }) => {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [input, setInput] = useState("");

  // 🔁 Écoute temps réel
  useEffect(() => {
    if (!userUID) return;

    const unsubscribe = listenToTodos(userUID, setTodos);
    return () => unsubscribe();
  }, [userUID]);

  // ➕ Ajouter une tâche
  const handleAdd = async () => {
    const trimmed = input.trim();
    if (trimmed) {
      await addTodo(userUID, trimmed);
      setInput("");
    }
  };

  // ❌ Supprimer une tâche
  const handleDelete = async (id: string) => {
    await deleteTodo(userUID, id);
  };

  const handleCheckboxChange = async (id: string, completedTodo: boolean) => {
    await toggleTodo(userUID, id, !completedTodo);
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          className="border rounded px-2 py-1 flex-1"
          placeholder="Ajouter une tâche..."
          onKeyDown={e => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <button
          onClick={handleAdd}
          className="px-2 py-0.5 bg-cactus-600 text-white rounded hover:bg-cactus-700 text-xs min-w-0"
        >
          Ajouter
        </button>
      </div>
      <ul className="space-y-1">
        {todos.map(todo => (
          <li
            key={todo.id}
            className="flex items-center justify-between bg-gray-50 rounded px-2 py-1"
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-cactus-600 w-4 h-4"
                checked={todo.completed}
                onChange={() => handleCheckboxChange(todo.id, todo.completed)}
                readOnly
              />
              <span>{todo.title}</span>
            </div>
            <button
              onClick={() => handleDelete(todo.id)}
              className="text-lg text-red-500 hover:bg-red-100 rounded px-2 py-1 flex items-center justify-center"
              title="Supprimer"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TodoInput;
