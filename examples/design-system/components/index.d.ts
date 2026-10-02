import type { ReactNode } from "react";
import type { ActionProps } from "./actions.js";
/** A deliberate reading-room action.
 * @startingPoint section="Actions" subtitle="A reusable editorial control" viewport="700x180"
 */
export interface ButtonProps extends ActionProps<"primary" | "quiet"> {
  children: ReactNode;
}
export interface StatusProps {
  children: ReactNode;
}
