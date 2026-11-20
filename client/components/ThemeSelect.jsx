import { useTheme } from "next-themes";

export default function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground">
      Appearance
      <select className="rounded bg-card text-primary" value={theme || "system"} onChange={(event) => setTheme(event.target.value)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
