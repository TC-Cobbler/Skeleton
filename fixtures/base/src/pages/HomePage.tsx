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

export default function HomePage() {
  return (
    <Stack data-ui-id="ui_h0m3p" className="gap-6 p-8">
      <h1 data-ui-id="ui_t1tle" className="text-2xl font-semibold">
        Orders
      </h1>
      <Stack data-ui-id="ui_act10" direction="horizontal" className="gap-2">
        <Button data-ui-id="ui_new0r">New order</Button>
        <Button data-ui-id="ui_exp0r" variant="outline">
          Export
        </Button>
      </Stack>
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
              <TableRow data-ui-id="ui_tbr01">
                <TableCell data-ui-id="ui_tc001">#1001</TableCell>
                <TableCell data-ui-id="ui_tc002">Ada Lovelace</TableCell>
                <TableCell data-ui-id="ui_tc003">£42.00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}
