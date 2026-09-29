import { Container } from "@grad/ui";

export default function Loading() {
  return (
    <main style={{ minHeight: "100svh", padding: "var(--space-6) 0" }}>
      <Container narrow>
        <p role="status">Loading your invitation…</p>
      </Container>
    </main>
  );
}
