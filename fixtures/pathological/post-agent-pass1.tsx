import { NewOrderDialog } from "@/components/NewOrderDialog";
import { Stack } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOrders } from "@/hooks/useOrders";
import { formatPence } from "@/lib/format";

export default function HomePage() {
  const { orders, addOrder, orderCount, paidRevenue } = useOrders();

  return (
    <Stack data-ui-id="ui_h0m3p" className="gap-6 p-8">
      <h1 data-ui-id="ui_t1tle" className="text-2xl font-semibold">
        Orders
      </h1>
      <Stack data-ui-id="ui_act10" direction="horizontal" className="gap-2">
        <NewOrderDialog onCreate={addOrder}>
          <Button data-ui-id="ui_new0r">New order</Button>
        </NewOrderDialog>
        <Button data-ui-id="ui_exp0r" variant="secondary">
          Export
        </Button>
      </Stack>
      <Stack data-ui-id="ui_1e3zl" direction="horizontal" className="gap-4"><Card data-ui-id="ui_155kv" className="flex-1"><CardHeader data-ui-id="ui_18zkk"><CardTitle data-ui-id="ui_ez2ua">Orders</CardTitle></CardHeader><CardContent data-ui-id="ui_b9ht9">{orderCount}</CardContent></Card><Card data-ui-id="ui_bbdyb" className="flex-1"><CardHeader data-ui-id="ui_onl4w"><CardTitle data-ui-id="ui_ndtjy">Revenue</CardTitle></CardHeader><CardContent data-ui-id="ui_eqp05">{formatPence(paidRevenue)}</CardContent></Card></Stack>
      <Card data-ui-id="ui_crd01">
        <CardHeader data-ui-id="ui_crdh1">
          <CardTitle data-ui-id="ui_crdt1">Recent orders</CardTitle>
        </CardHeader>
        <CardContent data-ui-id="ui_crdc1">
          <Table data-ui-id="ui_tbl01">
            <TableHeader data-ui-id="ui_thd01">
              <TableRow data-ui-id="ui_thr01">
                <TableHead data-ui-id="ui_th001">Order</TableHead>
                <TableHead data-ui-id="ui_th002">Customer</TableHead>
                <TableHead data-ui-id="ui_th003">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-ui-id="ui_tbd01">
              {orders.map((order) => (
                <TableRow data-ui-id="ui_tbr01" key={order.id}>
                  <TableCell data-ui-id="ui_tc001">#{order.id}</TableCell>
                  <TableCell data-ui-id="ui_tc002">{order.customer}</TableCell>
                  <TableCell data-ui-id="ui_tc003">{formatPence(order.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}
