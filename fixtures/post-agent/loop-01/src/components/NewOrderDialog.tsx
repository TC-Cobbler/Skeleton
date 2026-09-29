import { useState, type FormEvent, type ReactNode } from "react";
import { Stack } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NewOrderInput } from "@/hooks/useOrders";

type NewOrderDialogProps = {
  /** The element that opens the dialog (rendered via `asChild`). */
  children: ReactNode;
  onCreate: (input: NewOrderInput) => void;
};

/** Parses a pounds amount like "12.5" or "£12.50" into pence; null if invalid. */
function parsePoundsToPence(value: string): number | null {
  const cleaned = value.trim().replace(/^£/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const pence = Math.round(Number(cleaned) * 100);
  return pence > 0 ? pence : null;
}

export function NewOrderDialog({ children, onCreate }: NewOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [total, setTotal] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCustomer("");
    setTotal("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = customer.trim();
    const pence = parsePoundsToPence(total);
    if (!name) {
      setError("Enter a customer name.");
      return;
    }
    if (pence === null) {
      setError("Enter a total greater than £0, e.g. 42.50.");
      return;
    }
    onCreate({ customer: name, total: pence });
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent data-ui-id="ui_pqqid">
        <form data-ui-id="ui_kqpvr" onSubmit={handleSubmit} noValidate>
          <Stack data-ui-id="ui_2q93a" className="gap-4">
            <DialogHeader data-ui-id="ui_arwqg">
              <DialogTitle data-ui-id="ui_tf1to">New order</DialogTitle>
              <DialogDescription data-ui-id="ui_2tz6z">
                The order is added with status pending.
              </DialogDescription>
            </DialogHeader>
            <Stack data-ui-id="ui_ydxfj" className="gap-2">
              <Label data-ui-id="ui_yrqxy" htmlFor="new-order-customer">
                Customer
              </Label>
              <Input
                data-ui-id="ui_bkkhg"
                id="new-order-customer"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                autoComplete="off"
              />
            </Stack>
            <Stack data-ui-id="ui_3nh0j" className="gap-2">
              <Label data-ui-id="ui_myyka" htmlFor="new-order-total">
                Total (£)
              </Label>
              <Input
                data-ui-id="ui_5dkio"
                id="new-order-total"
                inputMode="decimal"
                placeholder="0.00"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </Stack>
            {error && (
              <p data-ui-id="ui_b6zml" role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <DialogFooter data-ui-id="ui_r3x8x">
              <DialogClose asChild>
                <Button data-ui-id="ui_n49s8" type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button data-ui-id="ui_9h8qo" type="submit">
                Add order
              </Button>
            </DialogFooter>
          </Stack>
        </form>
      </DialogContent>
    </Dialog>
  );
}
