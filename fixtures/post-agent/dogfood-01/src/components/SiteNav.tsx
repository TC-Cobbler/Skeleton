import type { ComponentProps } from "react";
import { NavLink } from "react-router";
import { Stack } from "@/components/layout";
import { Button } from "@/components/ui/button";

/** Top navigation between Library and Stats. Extra props (e.g. data-ui-id) go on the root. */
export function SiteNav(props: Omit<ComponentProps<typeof Stack>, "direction" | "children">) {
  return (
    <Stack direction="horizontal" className="gap-2" {...props}>
      <NavLink to="/" end>
        {({ isActive }) => (
          <Button data-ui-id="ui_35d0p" asChild variant={isActive ? "default" : "ghost"}>
            <span>Library</span>
          </Button>
        )}
      </NavLink>
      <NavLink to="/stats">
        {({ isActive }) => (
          <Button data-ui-id="ui_cjq3f" asChild variant={isActive ? "default" : "ghost"}>
            <span>Stats</span>
          </Button>
        )}
      </NavLink>
    </Stack>
  );
}
