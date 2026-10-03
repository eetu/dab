// Runs before every test. The help dialog opens itself on a first visit —
// right for a person, wrong for a test that is about to drive the keyboard —
// so the suites start as a returning visitor.
//
// And with no document behind them. Every suite shares one origin's storage,
// and the app restores a draft on mount: a test that left its sprite dirty long
// enough for the autosave handed it to the next file, whose mount then put it
// back over the sprite that test had just loaded.
import { beforeEach } from "vitest";

beforeEach(() => {
  for (const key of ["sprite-editor:draft", "sprite-editor:saved", "sprite-editor:file"]) {
    localStorage.removeItem(key);
  }
  try {
    const held = JSON.parse(localStorage.getItem("sprite-editor:prefs") ?? "{}") as object;
    localStorage.setItem("sprite-editor:prefs", JSON.stringify({ ...held, seenHelp: true }));
  } catch {
    /* a broken blob is the app's problem to survive, not the setup's */
  }
});
