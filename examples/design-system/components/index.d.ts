import type { ReactNode } from "react";
/** A deliberate reading-room action.
 * @startingPoint section="Actions" subtitle="A reusable editorial control" viewport="700x180"
 */
export interface ButtonProps {
  children: ReactNode;
  /** Visual emphasis.
   * @default "primary"
   */
  variant?: "primary" | "quiet";
  /** @default false */
  disabled?: boolean;
  onClick?(): void;
}
export interface StatusProps {
  children: ReactNode;
}
