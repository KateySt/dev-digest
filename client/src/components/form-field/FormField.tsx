import type React from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

/** Labelled form row on shadcn Field: label (+ required marker and an optional
 *  right-aligned slot), the control, then a hint below. */
export function FormField({
  label,
  hint,
  required,
  children,
  right,
  htmlFor,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  children?: React.ReactNode;
  right?: React.ReactNode;
  /** Id of the control, to associate the label with it. */
  htmlFor?: string;
}) {
  return (
    <Field className="mb-5 gap-2">
      <div className="flex items-center">
        <FieldLabel htmlFor={htmlFor} className="gap-0 text-sm font-semibold text-muted-foreground">
          {label}
          {required && <span className="ml-1 text-crit">*</span>}
        </FieldLabel>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
      {hint && <FieldDescription className="text-xs leading-[1.45] text-subtle-foreground">{hint}</FieldDescription>}
    </Field>
  );
}
