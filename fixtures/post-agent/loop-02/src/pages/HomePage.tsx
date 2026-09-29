import { NewOrderDialog } from "@/components/NewOrderDialog";
import { Stack } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import { formatGBP, formatOrderStatus } from "@/lib/format";
import { orderStatusBadgeVariant } from "@/lib/orderStatusBadge";
import { downloadOrdersCsv } from "@/lib/ordersCsv";
import { Input } from "@/components/ui/input";

export default function HomePage() {
  const { orders, orderCount, paidRevenue, addOrder } = useOrders();
  const { filter, setFilter, search, setSearch, visibleOrders, isFiltered, clearFilters } =
    useOrderFilter(orders);
  const recentOrders = useRecentOrders(orders);
  const { page, pageCount, pageItems, hasPrevious, hasNext, goToPrevious, goToNext } =
    usePagination(visibleOrders, 5, JSON.stringify([filter, search]));

  return (
    <Stack data-ui-id="ui_h0m3p" className="gap-6 p-8">
      <h1 data-ui-id="ui_t1tle" className="text-3xl font-semibold">
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
        <NewOrderDialog data-ui-id="ui_hskdg" onCreate={addOrder}>
          <Button data-ui-id="ui_new0r">New order</Button>
        </NewOrderDialog>
        <Badge data-ui-id="ui_7sig1" variant="outline">
          Beta
        </Badge>
      </Stack>
      <Card data-ui-id="ui_31wm8">
        <CardHeader data-ui-id="ui_bt7vp">
          <CardTitle data-ui-id="ui_f7zw4">Recent activity</CardTitle>
        </CardHeader>
        <CardContent data-ui-id="ui_riyfm">
          <Stack data-ui-id="ui_ewmis" className="gap-3">
            {recentOrders.length === 0 ? (
              <p data-ui-id="ui_8624o" className="text-sm text-muted-foreground">
                Nothing yet
              </p>
            ) : (
              recentOrders.map((order) => (
                <p data-ui-id="ui_r3c7n" key={order.id} className="text-sm">
                  {order.customer} · {formatGBP(order.total)} · {formatOrderStatus(order.status)}
                </p>
              ))
            )}
          </Stack>
        </CardContent>
      </Card>
      <Card data-ui-id="ui_crd01">
        <CardHeader data-ui-id="ui_crdh1">
          <CardTitle data-ui-id="ui_crdt1" className="text-lg">Recent orders ({visibleOrders.length})</CardTitle>
          <Stack data-ui-id="ui_jfa7u" direction="horizontal" className="gap-2">
            <Button
              data-ui-id="ui_dxhpp"
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            <Button
              data-ui-id="ui_akoy6"
              variant={filter === "paid" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("paid")}
            >
              Paid
            </Button>
            <Button
              data-ui-id="ui_2fhe7"
              variant={filter === "pending" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("pending")}
            >
              Pending
            </Button>
            <Button
              data-ui-id="ui_k88ss"
              variant={filter === "refunded" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("refunded")}
            >
              Refunded
            </Button>
            <Button
              data-ui-id="ui_nu5sf"
              variant="ghost"
              size="sm"
              disabled={!isFiltered}
              onClick={clearFilters}
            >
              Clear
            </Button>
          </Stack>
          <Input
            data-ui-id="ui_la72v"
            placeholder="Search customers"
            className="max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardHeader>
        <CardContent data-ui-id="ui_crdc1">
          <Table data-ui-id="ui_tbl01">
            <TableHeader data-ui-id="ui_thd01">
              <TableRow data-ui-id="ui_thr01">
                <TableHead data-ui-id="ui_th001">Order</TableHead>
                <TableHead data-ui-id="ui_th002">Customer</TableHead>
                <TableHead data-ui-id="ui_th003">Total</TableHead>
                <TableHead data-ui-id="ui_g6d3q">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-ui-id="ui_tbd01">
              {pageItems.map((order) => (
                <TableRow data-ui-id="ui_tbr01" key={order.id}>
                  <TableCell data-ui-id="ui_tc001">#{order.id}</TableCell>
                  <TableCell data-ui-id="ui_tc002">{order.customer}</TableCell>
                  <TableCell data-ui-id="ui_tc003">{formatGBP(order.total)}</TableCell>
                  <TableCell data-ui-id="ui_q7s2v">
                    <Badge data-ui-id="ui_kyn50" variant={orderStatusBadgeVariant(order.status)}>
                      {formatOrderStatus(order.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Stack
            data-ui-id="ui_ekjs6"
            direction="horizontal"
            className="items-center justify-between pt-6"
          >
            <Stack data-ui-id="ui_d5ne2" direction="horizontal" className="gap-2">
              <Button
                data-ui-id="ui_etgp9"
                variant="outline"
                size="sm"
                disabled={!hasPrevious}
                onClick={goToPrevious}
              >
                Previous
              </Button>
              <Button
                data-ui-id="ui_rzhmr"
                variant="outline"
                size="sm"
                disabled={!hasNext}
                onClick={goToNext}
              >
                Next
              </Button>
            </Stack>
            <p data-ui-id="ui_t77ts" className="text-sm text-muted-foreground">
              Page {page} of {pageCount}
            </p>
          </Stack>
        </CardContent>
      </Card>
      <Stack data-ui-id="ui_iwhmi" direction="horizontal" className="gap-6">
        <Card data-ui-id="ui_tt0lf" className="flex-1">
          <CardHeader data-ui-id="ui_6a0op">
            <CardTitle data-ui-id="ui_zxutd">Orders</CardTitle>
          </CardHeader>
          <CardContent data-ui-id="ui_je6ph">{orderCount}</CardContent>
          <CardFooter data-ui-id="ui_7c1lw" className="text-sm text-muted-foreground">
            All time
          </CardFooter>
        </Card>
        <Card data-ui-id="ui_srkwf" className="flex-1">
          <CardHeader data-ui-id="ui_dgxud">
            <CardTitle data-ui-id="ui_5200h">Revenue</CardTitle>
          </CardHeader>
          <CardContent data-ui-id="ui_ydwbx">{formatGBP(paidRevenue)}</CardContent>
          <CardFooter data-ui-id="ui_mesuh" className="text-sm text-muted-foreground">
            Paid orders
          </CardFooter>
        </Card>
      </Stack>
    </Stack>
  );
}
