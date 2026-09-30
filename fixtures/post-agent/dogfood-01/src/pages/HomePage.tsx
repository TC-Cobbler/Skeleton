import { Container, Stack, Grid } from "@/components/layout";
import { SiteNav } from "@/components/SiteNav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddGameForm, PLATFORMS, STATUSES } from "@/hooks/use-add-game-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGames, type GameStatus, type StatusFilter } from "@/hooks/use-games";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useGameDetails } from "@/hooks/use-game-details";
import { Separator } from "@/components/ui/separator";

const STATUS_VARIANT: Record<GameStatus, "default" | "secondary" | "outline" | "destructive"> = {
  Playing: "default",
  Completed: "secondary",
  Backlog: "outline",
  Dropped: "destructive",
};

export default function HomePage() {
  const { games, query, setQuery, status, setStatus, addGame, setGameStatus } = useGames();
  const details = useGameDetails();
  const { open, setOpen, form, update, canSubmit, submit } = useAddGameForm(addGame);

  return (
    <Container data-ui-id="ui_xdblt">
      <Stack data-ui-id="ui_clwq7" className="gap-6 py-8">
        <SiteNav data-ui-id="ui_31f5x" />
        <h1 data-ui-id="ui_52d7x" className="text-3xl font-semibold">
          My library
        </h1>
        <Separator data-ui-id="ui_25qbg" />
        <Stack
          data-ui-id="ui_e68kd"
          direction="horizontal"
          className="gap-4 p-4 justify-between"
        >
          <Select
            data-ui-id="ui_aar14"
            value={status}
            onValueChange={(v) => setStatus(v as StatusFilter)}
          >
            <SelectTrigger data-ui-id="ui_b8mvp" className="w-48">
              <SelectValue data-ui-id="ui_dtv81" placeholder="Choose an option" />
            </SelectTrigger>
            <SelectContent data-ui-id="ui_fs8dh">
              <SelectItem data-ui-id="ui_v01kc" value="all">
                All statuses
              </SelectItem>
              <SelectItem data-ui-id="ui_m0mxj" value="Playing">
                Playing
              </SelectItem>
              <SelectItem data-ui-id="ui_r6t1v" value="Completed">
                Completed
              </SelectItem>
              <SelectItem data-ui-id="ui_y5d0s" value="Backlog">
                Backlog
              </SelectItem>
              <SelectItem data-ui-id="ui_c9b4x" value="Dropped">
                Dropped
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            data-ui-id="ui_wd9tf"
            placeholder="Filter by title"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Dialog data-ui-id="ui_yk6u6" open={open} onOpenChange={setOpen}>
            <DialogTrigger data-ui-id="ui_08glc" asChild>
              <Button data-ui-id="ui_c322u">Add game</Button>
            </DialogTrigger>
            <DialogContent data-ui-id="ui_9wgk3">
              <DialogHeader data-ui-id="ui_i9h1d">
                <DialogTitle data-ui-id="ui_7tciq">Add a game</DialogTitle>
                <DialogDescription data-ui-id="ui_g92dq">
                  It goes straight into your library.
                </DialogDescription>
              </DialogHeader>
              <Stack
                data-ui-id="ui_k5equ"
                className="gap-4"
              >
                <Stack data-ui-id="ui_inpa9" className="gap-2">
                  <Label data-ui-id="ui_a2hr6">Title</Label>
                  <Input
                    data-ui-id="ui_9x8y6"
                    required
                    value={form.title}
                    onChange={(e) => update("title", e.target.value)}
                  />
                </Stack>
              <Stack data-ui-id="ui_y592u" className="gap-2">
                <Label data-ui-id="ui_lye9s">Platform</Label>
                <Select
                  data-ui-id="ui_zpcmr"
                  value={form.platform}
                  onValueChange={(v) => update("platform", v as never)}
                >
                  <SelectTrigger data-ui-id="ui_ecn7r" className="w-full">
                    <SelectValue data-ui-id="ui_0ndal" />
                  </SelectTrigger>
                  <SelectContent data-ui-id="ui_9dvqi">
                    {PLATFORMS.map((o) => (
                      <SelectItem key={o} data-ui-id="ui_zf1n0" value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Stack>
              <Stack data-ui-id="ui_a5zma" className="gap-2">
                <Label data-ui-id="ui_vsajv">Status</Label>
                <Select
                  data-ui-id="ui_jkhkz"
                  value={form.status}
                  onValueChange={(v) => update("status", v as never)}
                >
                  <SelectTrigger data-ui-id="ui_0we3c" className="w-full">
                    <SelectValue data-ui-id="ui_mfk4o" />
                  </SelectTrigger>
                  <SelectContent data-ui-id="ui_nz4rm">
                    {STATUSES.map((o) => (
                      <SelectItem key={o} data-ui-id="ui_0y9h5" value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Stack>
                <Stack data-ui-id="ui_xxt2l" className="gap-1">
                  <Label data-ui-id="ui_dkbru">Hours</Label>
                  <Input
                    data-ui-id="ui_9xn0i"
                    type="number"
                    min={0}
                    value={form.hours}
                    onChange={(e) => update("hours", e.target.value)}
                  />
                </Stack>
              </Stack>
              <DialogFooter data-ui-id="ui_ykev6">
                <DialogClose data-ui-id="ui_0bglm" asChild>
                  <Button data-ui-id="ui_3nmky" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button data-ui-id="ui_gqae1" disabled={!canSubmit} onClick={submit}>
                  Confirm
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Stack>
        <Grid data-ui-id="ui_am9jy" className="grid-cols-4 gap-4 p-4">
          {games.length === 0 && (
            <Stack
              data-ui-id="ui_e7k2q"
              className="col-span-full items-center gap-2 py-12"
            >
              <p data-ui-id="ui_p4w9n" className="text-lg font-medium">
                Nothing here yet
              </p>
              <p data-ui-id="ui_h3z8c" className="text-muted-foreground">
                Try a different title or status.
              </p>
            </Stack>
          )}
          {games.map((game) => (
            <Card
              key={game.id}
              data-ui-id="ui_uxdga"
              role="button"
              tabIndex={0}
              className="cursor-pointer hover:bg-accent"
              onClick={() => details.openGame(game.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  details.openGame(game.id);
                }
              }}
            >
              <CardHeader data-ui-id="ui_m1683">
                <CardTitle data-ui-id="ui_o62mg">{game.title}</CardTitle>
                <CardDescription data-ui-id="ui_dygg8">{game.platform}</CardDescription>
              </CardHeader>
              <CardContent data-ui-id="ui_btysi">
                <p data-ui-id="ui_ulrgz">{game.hoursPlayed} hours played</p>
                <Badge data-ui-id="ui_zogii" variant={STATUS_VARIANT[game.status]}>{game.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </Grid>
        <Sheet
          data-ui-id="ui_n8l15"
          open={details.open}
          onOpenChange={(o) => !o && details.close()}
        >
          <SheetContent data-ui-id="ui_5isiw">
            {details.selectedGame && (
              <>
                <SheetHeader data-ui-id="ui_aqu19">
                  <SheetTitle data-ui-id="ui_btf45">{details.selectedGame.title}</SheetTitle>
                  <SheetDescription data-ui-id="ui_ochm7">
                    {details.selectedGame.platform}
                  </SheetDescription>
                </SheetHeader>
                <Stack data-ui-id="ui_n720r" className="gap-6 p-4">
                  <Stack data-ui-id="ui_1gs5c" className="gap-1">
                    <Label data-ui-id="ui_zdt2m">Hours</Label>
                    <p data-ui-id="ui_f7ap4">{details.selectedGame.hoursPlayed}</p>
                  </Stack>
                  <Stack data-ui-id="ui_ko6me" className="gap-2">
                    <Label data-ui-id="ui_xceoc">Status</Label>
                    <Select
                      data-ui-id="ui_n2oh2"
                      value={details.selectedGame.status}
                      onValueChange={(v) => setGameStatus(details.selectedGame!.id, v as GameStatus)}
                    >
                      <SelectTrigger data-ui-id="ui_a7d3k" className="w-full">
                        <SelectValue data-ui-id="ui_b4q9w" />
                      </SelectTrigger>
                      <SelectContent data-ui-id="ui_c6r2e">
                        {STATUSES.map((o) => (
                          <SelectItem key={o} data-ui-id="ui_d1t8y" value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Stack>
                </Stack>
              </>
            )}
          </SheetContent>
        </Sheet>
      </Stack>
    </Container>
  );
}
