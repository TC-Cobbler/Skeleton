import { NewOrderDialog } from "@/components/NewOrderDialog";
import { Stack } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
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
import { useOrderFilter } from "@/hooks/useOrderFilter";
import { useOrders } from "@/hooks/useOrders";
import { usePagination } from "@/hooks/usePagination";
import { useRecentOrders } from "@/hooks/useRecentOrders";
import { downloadOrdersCsv } from "@/lib/csv";
import { formatPence } from "@/lib/format";
import { formatStatus, statusBadgeVariant } from "@/lib/status";

export default function HomePage() {
  const { orders, addOrder, orderCount, paidRevenue } = useOrders();
  const { filter, setFilter, visibleOrders } = useOrderFilter(orders);
  const recentOrders = useRecentOrders(orders);
  const pagination = usePagination(visibleOrders, 5, filter);

  return (
    <Stack data-ui-id="ui_h0m3p" className="gap-6 p-8">
      <h1 data-ui-id="ui_t1tle" className="font-semibold text-3xl">
        Orders
      </h1>
      <Stack data-ui-id="ui_act10" direction="horizontal" className="gap-2">
        <Button
          data-ui-id="ui_exp0r"
          variant="secondary"
          onClick={() => downloadOrdersCsv(visibleOrders)}
        >
          Export
        </Button>
        <NewOrderDialog onCreate={addOrder}>
          <Button data-ui-id="ui_new0r">New order</Button>
        </NewOrderDialog>
      </Stack>
      <Card data-ui-id="ui_iegpv">
        <CardHeader data-ui-id="ui_bv4ki">
          <CardTitle data-ui-id="ui_lfe1c">Recent activity</CardTitle>
        </CardHeader>
        <CardContent data-ui-id="ui_pe9ro">
          <Stack data-ui-id="ui_4awms" className="gap-3">
            {recentOrders.length === 0 ? (
              <p data-ui-id="ui_qci08" className="text-sm text-muted-foreground">Nothing yet</p>
            ) : (
              recentOrders.map((order) => (
                <p data-ui-id="ui_r3c01" key={order.id} className="text-sm">
                  {order.customer} · {formatPence(order.total)} · {formatStatus(order.status)}
                </p>
              ))
            )}
          </Stack>
        </CardContent>
      </Card>
      <Card data-ui-id="ui_crd01">
        <CardHeader data-ui-id="ui_crdh1">
          <CardTitle data-ui-id="ui_crdt1" className="text-lg">Recent orders ({visibleOrders.length})</CardTitle>
          <Stack data-ui-id="ui_jmlcy" direction="horizontal" className="gap-2">
            <Button
              data-ui-id="ui_5neuv"
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            <Button
              data-ui-id="ui_hztgd"
              variant={filter === "paid" ? "default" : "outline"}
              size="sm"
              aria-pressed={filter === "paid"}
              onClick={() => setFilter("paid")}
            >
              Paid
            </Button>
            <Button
              data-ui-id="ui_bj03j"
              variant={filter === "pending" ? "default" : "outline"}
              size="sm"
              aria-pressed={filter === "pending"}
              onClick={() => setFilter("pending")}
            >
              Pending
            </Button>
            <Button
              data-ui-id="ui_lijr0"
              variant={filter === "refunded" ? "default" : "outline"}
              size="sm"
              aria-pressed={filter === "refunded"}
              onClick={() => setFilter("refunded")}
            >
              Refunded
            </Button>
            <Button
              data-ui-id="ui_nvtvo"
              variant="ghost"
              size="sm"
              disabled={filter === "all"}
              onClick={() => setFilter("all")}
            >
              Clear
            </Button>
          </Stack>
        </CardHeader>
        <CardContent data-ui-id="ui_crdc1">
          <Table data-ui-id="ui_tbl01">
            <TableHeader data-ui-id="ui_thd01">
              <TableRow data-ui-id="ui_thr01">
                <TableHead data-ui-id="ui_th001">Order</TableHead>
                <TableHead data-ui-id="ui_th002">Customer</TableHead>
                <TableHead data-ui-id="ui_th003">Total</TableHead>
                <TableHead data-ui-id="ui_jzb72">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-ui-id="ui_tbd01">
              {pagination.pageItems.map((order) => (
                <TableRow data-ui-id="ui_tbr01" key={order.id}>
                  <TableCell data-ui-id="ui_tc001">#{order.id}</TableCell>
                  <TableCell data-ui-id="ui_tc002">{order.customer}</TableCell>
                  <TableCell data-ui-id="ui_tc003">{formatPence(order.total)}</TableCell>
                  <TableCell data-ui-id="ui_st4tc">
                    <Badge data-ui-id="ui_q7b2x" variant={statusBadgeVariant(order.status)}>
                      {formatStatus(order.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {visibleOrders.length === 0 && (
                <TableRow data-ui-id="ui_nm4tc">
                  <TableCell data-ui-id="ui_e7rw1" colSpan={4} className="text-center text-muted-foreground">
                    No orders match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Stack
            data-ui-id="ui_kni26"
            direction="horizontal"
            className="items-center justify-between pt-6">
            <Stack data-ui-id="ui_b6f28" direction="horizontal" className="gap-2">
              <Button
                data-ui-id="ui_w8i5w"
                variant="outline"
                size="sm"
                disabled={!pagination.hasPrevious}
                onClick={pagination.previous}
              >
                Previous
              </Button>
              <Button
                data-ui-id="ui_wkm3k"
                variant="outline"
                size="sm"
                disabled={!pagination.hasNext}
                onClick={pagination.next}
              >
                Next
              </Button>
            </Stack>
            <p data-ui-id="ui_btk00" className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.pageCount}
            </p>
          </Stack>
        </CardContent>
      </Card>
      <Stack data-ui-id="ui_1e3zl" direction="horizontal" className="gap-6"><Card data-ui-id="ui_155kv" className="flex-1"><CardHeader data-ui-id="ui_18zkk"><CardTitle data-ui-id="ui_ez2ua">Orders</CardTitle></CardHeader><CardContent data-ui-id="ui_b9ht9">{orderCount}</CardContent></Card><Card data-ui-id="ui_bbdyb" className="flex-1"><CardHeader data-ui-id="ui_onl4w"><CardTitle data-ui-id="ui_ndtjy">Revenue</CardTitle></CardHeader><CardContent data-ui-id="ui_eqp05">{formatPence(paidRevenue)}</CardContent></Card></Stack>
    </Stack>
  );
}
