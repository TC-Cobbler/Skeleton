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
import { parsePoundsToPence } from "@/lib/format";

type NewOrderDialogProps = {
  /** The trigger element (e.g. the "New order" button). Rendered as-is. */
  children: ReactNode;
  onCreate: (order: NewOrderInput) => void;
  /** Skeleton ID of this wrapper. It renders no DOM node of its own. */
  "data-ui-id"?: string;
};

/**
 * "New order" dialog. Owns the form state; the trigger is passed in as
 * `children` so it stays in the page layout with its own data-ui-id.
 */
export function NewOrderDialog({ children, onCreate }: NewOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [total, setTotal] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCustomer("");
      setTotal("");
      setError(null);
    }
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
      setError("Enter a total in pounds, e.g. 42.50.");
      return;
    }
    onCreate({ customer: name, total: pence });
    handleOpenChange(false);
  }

  return (
    <Dialog data-ui-id="ui_48ekq" open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent data-ui-id="ui_nuuu2">
        <form data-ui-id="ui_utbav" onSubmit={handleSubmit} noValidate>
          <Stack data-ui-id="ui_sg7ej" className="gap-4">
            <DialogHeader data-ui-id="ui_yfa5b">
              <DialogTitle data-ui-id="ui_75wbk">New order</DialogTitle>
              <DialogDescription data-ui-id="ui_sjajj">
                The order is added with status pending.
              </DialogDescription>
            </DialogHeader>
            <Stack data-ui-id="ui_8ha4o" className="gap-2">
              <Label data-ui-id="ui_mfbpe" htmlFor="new-order-customer">
                Customer
              </Label>
              <Input
                data-ui-id="ui_9q4iy"
                id="new-order-customer"
                autoComplete="off"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
              />
            </Stack>
            <Stack data-ui-id="ui_0tbu1" className="gap-2">
              <Label data-ui-id="ui_am6pv" htmlFor="new-order-total">
                Total (£)
              </Label>
              <Input
                data-ui-id="ui_tzmy8"
                id="new-order-total"
                inputMode="decimal"
                placeholder="0.00"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </Stack>
            {error && (
              <p data-ui-id="ui_7ckly" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter data-ui-id="ui_4woqt">
              <DialogClose asChild>
                <Button data-ui-id="ui_fr1lw" type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button data-ui-id="ui_ql4fi" type="submit">
                Add order
              </Button>
            </DialogFooter>
          </Stack>
        </form>
      </DialogContent>
    </Dialog>
  );
}
