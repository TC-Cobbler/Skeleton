// Today's jargon on screen, as "copy path: avoid-word" (T8.2). The plain-words check
// fails on any new one, and on any entry here that's been fixed: each UI refresh
// slice removes what it rewords, and the list is empty by v1.0.y's gate.
export const PENDING: readonly string[] = [
  "overlay:gizmos.borderGlobal: --name",
  "overlay:gizmos.borderNotToken: token",
  "overlay:gizmos.noRadiusToken: token",
  "overlay:gizmos.radiusGlobal: --name",
  "overlay:gizmos.radiusGlobal: derived",
  "overlay:gizmos.spacingGlobal: --name",
  "overlay:gizmos.typeGlobal: --name",
  "overlay:overlay.lockedKinds.conditional: conditional",
  "overlay:overlay.lockedKinds.expression: {\u2026}",
  "overlay:overlay.lockedKinds.fragment: <>\u2026</>",
  "overlay:overlay.lockedKinds.map: .map()",
  "overlay:overlay.lockedKinds.map: map",
];
