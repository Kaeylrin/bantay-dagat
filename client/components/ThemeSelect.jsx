import { useId } from "react";
import { useTheme } from "next-themes";

export default function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const group = useId();
  return (
    <fieldset className="inline-flex gap-0.5 rounded-xl border bg-card p-1">
      <legend className="sr-only">Appearance</legend>
      {["system", "light", "dark"].map((value) => (
        <label key={value} className="cursor-pointer">
          <input type="radio" name={group} className="peer sr-only"
            value={value} checked={(theme || "system") === value} onChange={() => setTheme(value)} />
          <span className="block rounded-lg px-2 py-1.5 text-xs font-semibold capitalize text-muted-foreground peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
            {value}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
