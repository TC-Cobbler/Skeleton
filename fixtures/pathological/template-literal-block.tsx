import { Stack } from "@/components/layout";
import { Notice } from "@/components/Notice";

export default function Page() {
  return (
    <Stack data-ui-id="ui_tlr00" className="gap-4">
      <Stack data-ui-id="ui_tla00" className="gap-2">
        <Notice
          data-ui-id="ui_tln00"
          body={`line one
  indented line two
line three`}
        />
      </Stack>
      <Stack data-ui-id="ui_tlb00" className="gap-2">
        <Stack data-ui-id="ui_tlc00" className="gap-1">
          <p data-ui-id="ui_tlp00">Deep</p>
        </Stack>
      </Stack>
    </Stack>
  );
}
