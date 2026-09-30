import type { SkeletonBridge } from "@skeleton/app-main/ipc";

declare global {
  interface Window {
    /** Exposed by app-main's preload. The renderer's only way to reach main. */
    skeleton: SkeletonBridge;
  }
}
