// Asking a question without leaving the app.
//
// `prompt()` and `confirm()` block the whole page, cannot be styled, and in a
// tool whose whole surface is a canvas they read as the browser interrupting
// rather than the editor asking. They are also the only two places in dab where
// the type stops being Inter.
//
// The shape is promise-based on purpose: the call site stays a sentence — `const
// name = await ask(...)` — rather than a callback and a piece of state per
// question.

export type AskSpec = {
  title: string;
  /** The label on the field. Absent means a confirm rather than a prompt. */
  label?: string;
  value?: string;
  placeholder?: string;
  /** Shown under the field, for the consequence a title has no room for. */
  note?: string;
  confirm?: string;
  danger?: boolean;
};

type Pending = { spec: AskSpec; resolve: (v: string | null) => void };

export const dialog = $state({ open: false, spec: null as AskSpec | null });

let pending: Pending | null = null;

/** Ask for a string. Resolves to null when dismissed. */
export function ask(spec: AskSpec): Promise<string | null> {
  return new Promise((resolve) => {
    // A second question while one is open answers the first with a dismissal
    // rather than stacking: two modals over a canvas is nobody's idea.
    pending?.resolve(null);
    pending = { spec, resolve };
    dialog.spec = spec;
    dialog.open = true;
  });
}

/** Ask yes or no. Resolves true only on the confirming press. */
export async function confirmed(spec: Omit<AskSpec, "label" | "value">): Promise<boolean> {
  return (await ask(spec)) !== null;
}

export function settle(value: string | null): void {
  dialog.open = false;
  dialog.spec = null;
  const p = pending;
  pending = null;
  p?.resolve(value);
}
