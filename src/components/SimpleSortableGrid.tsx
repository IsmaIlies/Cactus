import React from 'react';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export type SortableItem = {
  id: string;
  title?: string;
};

function SortableCard(props: React.PropsWithChildren<{ id: string }>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    cursor: 'grab',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {props.children}
    </div>
  );
}

/**
 * Simple sortable grid wrapper with localStorage persistence.
 */
export default function SimpleSortableGrid<T extends SortableItem>({
  storageKey,
  items,
  renderItem,
  className,
}: {
  storageKey: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  className?: string;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [order, setOrder] = React.useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return items.map((i) => i.id);
  });

  // Ensure order contains all items (in case of new widgets)
  React.useEffect(() => {
    const ids = items.map((i) => i.id);
    setOrder((prev) => {
      const merged = [...prev.filter((id) => ids.includes(id)), ...ids.filter((id) => !prev.includes(id))];
      try { localStorage.setItem(storageKey, JSON.stringify(merged)); } catch {}
      return merged;
    });
  }, [items, storageKey]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      const next = arrayMove(prev, oldIndex, newIndex);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const sorted = order.map((id) => items.find((i) => i.id === id)).filter(Boolean) as T[];

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={sorted.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className={className}>
          {sorted.map((item) => (
            <SortableCard key={item.id} id={item.id}>
              {renderItem(item)}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
