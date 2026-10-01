# Inventory every user-visible string and control

Type: task
Status: open
Blocked by: none
Part of: [UI refresh map](../map.md)

## Question

What does Skeleton's UI actually show today? Produce `.scratch/ui-refresh/inventory.md`: every panel, control, label, tooltip, `aria-label`, placeholder, empty state, error, confirmation and toast in `packages/app-renderer` and the overlay chrome, each with (a) where it appears, (b) what it does in plain words, (c) a jargon flag (dev term / CSS term / file name / fine as is), and (d) whether any test (unit or e2e) asserts on that text. Also note which panels are everyday vs plumbing. AFK: the agent drives it alone.
