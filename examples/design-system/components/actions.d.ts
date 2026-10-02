export interface ActionProps<Variant extends string = "primary"> {
  /** Visual emphasis.
   * @default "primary"
   */
  variant?: Variant;
  /** @default false */
  disabled?: boolean;
  onClick?(): void;
}
