import { useState, type ReactNode } from "react";
import { Stack } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OrdersTable } from "@/components/OrdersTable";

// Agent-authored generic hook, weird formatting on purpose
function useList<T extends { id: string }>(initial: T[]):   [T[], (t: T) => void] {
  const [items, setItems] = useState<T[]>(initial);
  const add = (t: T) => setItems((prev) => [...prev,t]);   // trailing comment
  return [items, add];
}

type Row = { id: string; label: string };

export default function Page({ children }: { children?: ReactNode }) {
  const [rows, addRow] = useList<Row>([]);
  const loading = rows.length > 99;
  return (
    <Stack data-ui-id="ui_root1" className="gap-4">
      {/* toolbar */}
      <Stack data-ui-id="ui_bar01" direction="horizontal" className="gap-2">
        <Button data-ui-id="ui_btn01" onClick={() => addRow({ id: String(rows.length), label: "x" })}>Add</Button>
        {/* keep me */}
        <Button data-ui-id="ui_btn02" variant='outline'>
          Export
        </Button>
      </Stack>
      {rows.map((r) => (
        <div key={r.id} data-ui-id="ui_row01">
          {r.label}
        </div>
      ))}
      {loading ? <p data-ui-id="ui_load1">Loading…</p> : null}
      <Card data-ui-id="ui_card1">
        <CardContent data-ui-id="ui_cc001">
          <OrdersTable data-ui-id="ui_ordt1" rows={rows} />
        </CardContent>
      </Card>
      <Stack data-ui-id="ui_empty" className="gap-2" />
      {children}
    </Stack>
  );
}
