import { Container, Stack } from "@/components/layout";

export default function HomePage() {
  return (
    <Container data-ui-id="{{id:container}}">
      <Stack data-ui-id="{{id:stack}}" className="gap-6 py-8">
        <h1 data-ui-id="{{id:title}}" className="text-3xl font-semibold">
          {{name}}
        </h1>
      </Stack>
    </Container>
  );
}
