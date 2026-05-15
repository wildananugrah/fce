import type { ReactNode } from "react";
import { Table as HeroTable } from "@heroui/react";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
}

export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data",
}: TableProps<T>) {
  return (
    <HeroTable>
      <HeroTable.ScrollContainer>
        <HeroTable.Content aria-label="Data table">
          <HeroTable.Header>
            {columns.map((col) => (
              <HeroTable.Column key={col.key}>{col.header}</HeroTable.Column>
            ))}
          </HeroTable.Header>
          <HeroTable.Body
            items={data}
            renderEmptyState={() => (
              <div className="px-4 py-8 text-center text-sm text-muted">{emptyMessage}</div>
            )}
          >
            {(item) => (
              <HeroTable.Row
                key={String(item.id ?? JSON.stringify(item))}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={onRowClick ? "cursor-pointer" : ""}
              >
                {columns.map((col) => (
                  <HeroTable.Cell key={col.key}>
                    {col.render ? col.render(item) : String(item[col.key] ?? "")}
                  </HeroTable.Cell>
                ))}
              </HeroTable.Row>
            )}
          </HeroTable.Body>
        </HeroTable.Content>
      </HeroTable.ScrollContainer>
    </HeroTable>
  );
}
