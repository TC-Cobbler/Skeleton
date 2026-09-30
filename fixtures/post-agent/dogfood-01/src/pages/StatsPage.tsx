import { Container, Stack, Grid } from "@/components/layout";
import { SiteNav } from "@/components/SiteNav";
import { useGameStats } from "@/hooks/use-games";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function StatsPage() {
  const { gameCount, totalHours, completedCount } = useGameStats();

  return (
    <Container data-ui-id="ui_crga2">
      <Stack data-ui-id="ui_we16n" className="gap-6 py-8">
        <SiteNav data-ui-id="ui_pu92q" />
        <h1 data-ui-id="ui_h7lrp" className="text-3xl font-semibold">
          Stats
        </h1>
        <Grid data-ui-id="ui_7sj6n" className="grid-cols-3 gap-6 p-4">
          <Card data-ui-id="ui_gysjq">
            <CardHeader data-ui-id="ui_kyuwd">
              <CardTitle data-ui-id="ui_xcsfi">Games</CardTitle>
              <CardDescription data-ui-id="ui_zdy88">In your library</CardDescription>
            </CardHeader>
            <CardContent data-ui-id="ui_odtux">
              <p data-ui-id="ui_2awhq">{gameCount}</p>
            </CardContent>
          </Card>
          <Card data-ui-id="ui_jg87u">
            <CardHeader data-ui-id="ui_9ius6">
              <CardTitle data-ui-id="ui_5da1r">Hours played</CardTitle>
              <CardDescription data-ui-id="ui_iw099">Across all games</CardDescription>
            </CardHeader>
            <CardContent data-ui-id="ui_02jyj">
              <p data-ui-id="ui_vsqsp">{totalHours}</p>
            </CardContent>
          </Card>
          <Card data-ui-id="ui_9nhda">
            <CardHeader data-ui-id="ui_yutuj">
              <CardTitle data-ui-id="ui_3qa0g">Completed</CardTitle>
              <CardDescription data-ui-id="ui_ihcrg">Finished games</CardDescription>
            </CardHeader>
            <CardContent data-ui-id="ui_smu77">
              <p data-ui-id="ui_p3nv4">{completedCount}</p>
            </CardContent>
          </Card>
        </Grid>
      </Stack>
    </Container>
  );
}
