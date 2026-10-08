import type { ComponentProps } from "react";
import { MONEY_INPUT_PATTERN } from "../lib/money";

type Props = Omit<
  ComponentProps<"input">,
  "type" | "inputMode" | "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
};

// A text box that only accepts a positive amount with up to 2 decimals.
// Keystrokes or pastes that would break that are ignored.
export function MoneyInput({ value, onChange, ...rest }: Props) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder="0.00"
      value={value}
      onChange={(e) => {
        if (MONEY_INPUT_PATTERN.test(e.target.value)) onChange(e.target.value);
      }}
      {...rest}
    />
  );
}
