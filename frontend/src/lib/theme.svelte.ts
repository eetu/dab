// Light, dark, or follow the system — the family's data-theme switch.
//
// Dark is the token default (`:root` in halo.css) and light is the override, so
// applying a theme is one attribute on <html>. "auto" resolves against
// prefers-color-scheme and keeps listening: an OS that turns dark at sunset
// takes the editor with it, which is the whole meaning of auto.
//
// index.html applies the same rule inline before first paint, so a light-mode
// reload does not flash dark while the app boots.
import { recallPrefs, rememberPrefs } from "./persist";

export type Theme = "auto" | "dark" | "light";

export const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Follow the system" },
  { id: "dark", label: "Dark", hint: "Dark, whatever the system says" },
  { id: "light", label: "Light", hint: "Light, whatever the system says" },
];

const stored = recallPrefs().theme;
export const theme = $state({
  choice: (stored === "dark" || stored === "light" ? stored : "auto") as Theme,
});

export function setTheme(choice: Theme) {
  theme.choice = choice;
  rememberPrefs({ theme: choice });
  apply();
}

const system = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";

function apply() {
  const resolved = theme.choice === "auto" ? system() : theme.choice;
  document.documentElement.dataset.theme = resolved;
}

/** Wire the system listener once, from App. Returns the teardown. */
export function watchTheme(): () => void {
  apply();
  const mq = matchMedia("(prefers-color-scheme: light)");
  const onchange = () => {
    if (theme.choice === "auto") apply();
  };
  mq.addEventListener("change", onchange);
  return () => mq.removeEventListener("change", onchange);
}
