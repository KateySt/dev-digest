import { type IconName } from "../icons";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  kind?: "primary" | "secondary" | "tertiary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  active?: boolean;
  full?: boolean;
  /** Shows a spinning indicator and disables the button while a task runs. */
  loading?: boolean;
  children?: React.ReactNode;
}
