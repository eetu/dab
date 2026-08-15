// Runs before every suite. The help dialog opens itself on a first visit —
// right for a person, wrong for a test that is about to drive the keyboard —
// so the suites start as a returning visitor.
import { beforeEach } from "vitest";

beforeEach(() => {
  try {
    const held = JSON.parse(localStorage.getItem("sprite-editor:prefs") ?? "{}") as object;
    localStorage.setItem("sprite-editor:prefs", JSON.stringify({ ...held, seenHelp: true }));
  } catch {
    /* a broken blob is the app's problem to survive, not the setup's */
  }
});
