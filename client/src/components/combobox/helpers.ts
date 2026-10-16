/** A select option: a bare value, or a value with a display label. */
export type SelectOption = string | { value: string; label: string };

export const optionValue = (o: SelectOption) => (typeof o === "string" ? o : o.value);
export const optionLabel = (o: SelectOption) => (typeof o === "string" ? o : o.label);
