<script lang="ts">
  // The sprite editor: a dev tool for the character-grid sprites the scene's
  // visualisers draw from (packages/player/src/sprites/*.json).
  //
  // Not a shipped app — it is the other half of the sprite format. Point it at
  // the repo's sprites folder once and Save writes the file the visualiser
  // imports, so the loop is draw → save → look at the running scene.
  import "./halo.css";

  import CircleHelp from "@lucide/svelte/icons/circle-help";
  import PanelBottom from "@lucide/svelte/icons/panel-bottom";
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import { cloneSprite, validateSprite } from "dab-core";
  import { onMount } from "svelte";

  import AskDialog from "./lib/AskDialog.svelte";
  import Canvas from "./lib/Canvas.svelte";
  import Clips from "./lib/Clips.svelte";
  import ContextMenu from "./lib/ContextMenu.svelte";
  import { ask, confirmed, dialog } from "./lib/dialog.svelte";
  import {
    activeNode,
    applyTurn,
    cancelPaste,
    cancelTurn,
    clearSelection,
    copySelection,
    cutSelection,
    deleteSelection,
    dropPaste,
    editor,
    floating,
    gesture,
    hasSelection,
    history,
    loadSprite,
    nudgePart,
    nudgeSelection,
    pasteClipboard,
    redoEdit,
    removePart,
    selectAll,
    setTurn,
    sheet,
    spriteFromPart,
    stageBox,
    type Tool,
    TOOLS,
    turning,
    undoEdit,
    usedBy,
    usePartInstead,
  } from "./lib/editor.svelte";
  import { EXAMPLE_SHEET, exampleCar } from "./lib/examples";
  import {
    canWriteToDisk,
    deleteFromFolder,
    downloadSprite,
    dropFolder,
    ensureWritable,
    type Entry,
    type Folder,
    isWritable,
    listSprites,
    pickFolder,
    readDroppedFiles,
    restoreFolder,
    saveSprite,
    saveToFolder,
  } from "./lib/files";
  import Frames from "./lib/Frames.svelte";
  import HelpDialog from "./lib/HelpDialog.svelte";
  import IconButton from "./lib/IconButton.svelte";
  import Inspector from "./lib/Inspector.svelte";
  import { typing } from "./lib/menu.svelte";
  import NewSpriteDialog from "./lib/NewSpriteDialog.svelte";
  import Palette from "./lib/Palette.svelte";
  import {
    panels,
    setUnderlay,
    showing,
    toggleRegion,
    type Underlay,
    UNDERLAYS,
  } from "./lib/panels.svelte";
  import { partDialog } from "./lib/partdialog.svelte";
  import Parts from "./lib/Parts.svelte";
  import {
    clearDraft,
    forgetSaved,
    recallDraft,
    recallFile,
    recallPrefs,
    recallSaved,
    rememberDraft,
    rememberFile,
    rememberPrefs,
    rememberSaved,
    savedFile,
  } from "./lib/persist";
  import Preview from "./lib/Preview.svelte";
  import { openResize, resizer } from "./lib/resize.svelte";
  import ResizeDialog from "./lib/ResizeDialog.svelte";
  import SegmentedControl from "./lib/SegmentedControl.svelte";
  import SettingsDialog from "./lib/SettingsDialog.svelte";
  import Sprites from "./lib/Sprites.svelte";
  import { watchTheme } from "./lib/theme.svelte";
  import ToolRail from "./lib/ToolRail.svelte";
  import { type Backdrop, BACKDROPS, fit, zoomIn, zoomOut } from "./lib/viewport.svelte";

  let backdrop = $state<Backdrop>("checker");
  let settingsOpen = $state(false);
  /** Captured before anything writes prefs: the one signal that this browser
   *  has never seen the app. Decides the help AND the example document. */
  const firstVisit = !recallPrefs().seenHelp;
  // The help opens itself exactly once — the standalone build has no README in
  // reach, and a blank canvas with nine icons explains nothing.
  let helpOpen = $state(firstVisit);
  function closeHelp() {
    helpOpen = false;
    rememberPrefs({ seenHelp: true });
  }
  let folder = $state<Folder | null>(null);
  let entries = $state<Entry[]>([]);
  let problems = $state<{ file: string; errors: string[] }[]>([]);
  let dropping = $state(false);
  let making = $state(false);
  /** A remembered folder whose permission the browser dropped: it needs one
   *  click to come back, because requestPermission demands a user gesture. */
  let needsReconnect = $state(false);

  const say = (msg: string) => {
    editor.status = msg;
    editor.statusBad = false;
  };
  /** A refusal or a failure — same bar, error colour. */
  const sayBad = (msg: string) => {
    editor.status = msg;
    editor.statusBad = true;
  };

  /** What Revert would go back to, or null when there is nothing. Re-read on
   *  every change to the document, which is when it can have become nothing —
   *  New abandons the baseline along with the file. */
  const savedName = $derived.by(() => {
    void editor.sprite;
    return editor.dirty ? savedFile() : null;
  });

  async function openFolder() {
    try {
      const picked = await pickFolder();
      if (!picked) return;
      folder = picked;
      needsReconnect = false;
      await refresh();
      say(`${picked.name}: ${entries.length} sprites`);
    } catch {
      sayBad("folder not opened");
    }
  }

  async function refresh() {
    if (!folder) return;
    const res = await listSprites(folder);
    entries = res.entries;
    problems = res.problems;
    // What a `use` part draws. Core has no folder, so the sheet is the editor's
    // to keep — and it is already loaded, since the list parses every file.
    sheet.byName = Object.fromEntries(res.entries.map((e) => [e.sprite.name, e.sprite]));
  }

  async function save() {
    const errors = validateSprite(editor.sprite);
    if (errors.length) return sayBad(`not saved — ${errors[0]}`);
    if (folder && (await ensureWritable(folder))) {
      // A rename MOVES: the new file is written, then the old one removed. Two
      // files for one sprite leaves the folder lying about which is current.
      const { file, removed } = await saveSprite(folder, editor.sprite, editor.file);
      editor.file = file;
      editor.dirty = false;
      needsReconnect = false;
      // Remembered so the next save goes to the same place with no dialog —
      // including after a hot reload, which is most of them.
      rememberFile(file);
      clearDraft();
      rememberSaved(editor.sprite, file);
      await refresh();
      if (removed) return say(`renamed ${removed} → ${file}`);
      return say(`saved ${file}`);
    }
    downloadSprite(editor.sprite);
    editor.dirty = false;
    // A download is the last state that left this tab, so it is what Revert
    // comes back to — there is no folder to re-read it from.
    rememberSaved(editor.sprite, editor.file);
    say(`downloaded ${editor.sprite.name}.json`);
  }

  async function open(entry: Entry) {
    if (editor.dirty && !(await confirmed(discardSpec()))) return;
    // cloneSprite, not structuredClone: `entries` is $state, so everything in
    // it is a deep proxy, and structuredClone refuses a proxy outright
    // (DataCloneError). Copying field by field reads straight through it.
    // Cloned at all so editing the open sprite doesn't mutate the list entry —
    // the list is what "discard changes" would otherwise have to restore from.
    loadSprite(cloneSprite(entry.sprite), entry.file);
    rememberFile(entry.file);
    clearDraft();
    rememberSaved(entry.sprite, entry.file);
    say(`opened ${entry.file}`);
  }

  /**
   * Open the example — scene's car — as an unsaved document.
   *
   * The sheet gains the example sprites so the wheel resolves; a real folder,
   * opened later, replaces the sheet wholesale, which is the right precedence:
   * your files outrank the demo.
   */
  async function openExample() {
    if (editor.dirty && !(await confirmed(discardSpec()))) return;
    sheet.byName = { ...EXAMPLE_SHEET, ...sheet.byName };
    loadSprite(exampleCar(), null);
    forgetSaved();
    say("the example car — pop the lights, open a door, spin the wheel");
  }

  const discardSpec = () => ({
    title: `Discard unsaved changes to ${editor.sprite.name}?`,
    note: "Undo cannot bring them back.",
    confirm: "Discard",
    danger: true,
  });

  // ---------- the folder's verbs, from a sprite row's menu ----------
  //
  // Each acts on a CLOSED file: the open one is renamed in the Sprite panel and
  // saved from the header, and the menu says so instead of offering a second,
  // subtly different route to the same result.

  async function renameEntry(entry: Entry) {
    if (!folder) return;
    const borrowers = usedBy(entry.sprite.name);
    const to = await ask({
      title: `Rename ${entry.file}`,
      label: "Name",
      value: entry.sprite.name,
      note: borrowers.length
        ? `${borrowers.join(", ")} draw${borrowers.length === 1 ? "s" : ""} this by name — their use parts will point at nothing until they are updated.`
        : "The file moves with the name.",
      confirm: "Rename",
    });
    const name = to?.trim();
    if (!name || name === entry.sprite.name) return;
    if (sheet.byName[name]) return sayBad(`${name} already exists`);
    if (!(await ensureWritable(folder))) return sayBad("permission refused");
    const moved = await saveSprite(folder, { ...cloneSprite(entry.sprite), name }, entry.file);
    await refresh();
    say(`renamed ${entry.file} → ${moved.file}`);
  }

  async function duplicateEntry(entry: Entry) {
    if (!folder || !(await ensureWritable(folder)))
      return sayBad("duplicate needs a writable folder");
    let name = `${entry.sprite.name} 2`;
    for (let i = 3; sheet.byName[name]; i++) name = `${entry.sprite.name} ${i}`;
    const file = await saveToFolder(folder, { ...cloneSprite(entry.sprite), name });
    await refresh();
    say(`duplicated to ${file}`);
  }

  /** Disconnect from the folder. Files untouched; the handle and the listing
   *  go, which was previously possible only through devtools. */
  async function forgetFolder() {
    await dropFolder();
    folder = null;
    entries = [];
    problems = [];
    sheet.byName = {};
    needsReconnect = false;
    say("folder forgotten — files untouched");
  }

  async function deleteEntry(entry: Entry) {
    if (!folder) return;
    const borrowers = usedBy(entry.sprite.name);
    const sure = await confirmed({
      title: `Delete ${entry.file}?`,
      note: borrowers.length
        ? `${borrowers.join(", ")} draw${borrowers.length === 1 ? "s" : ""} it — their use parts will point at nothing. This cannot be undone.`
        : "This cannot be undone.",
      confirm: "Delete",
      danger: true,
    });
    if (!sure) return;
    if (!(await ensureWritable(folder))) return sayBad("permission refused");
    if (await deleteFromFolder(folder, entry.file)) {
      await refresh();
      say(`deleted ${entry.file}`);
    } else sayBad(`${entry.file} was not deleted`);
  }

  /**
   * Throw away the unsaved change and go back to what is on disk.
   *
   * The reason this exists rather than "just press undo": undo lives in memory,
   * so a reload comes back with the work restored and nothing behind it. The
   * draft is the thing that makes this tool safe to reload, and without a way
   * out it also makes a reload the one gesture that commits a change you had not
   * decided on.
   */
  async function revert() {
    const base = recallSaved();
    if (!base) return sayBad("nothing saved to go back to");
    if (!(await confirmed({ ...discardSpec(), title: `Revert ${editor.sprite.name} to saved?` }))) {
      return;
    }
    loadSprite(base.sprite, base.file);
    rememberFile(base.file);
    clearDraft();
    say(`reverted to ${base.file ?? "the last saved state"}`);
  }

  /**
   * Promote a part into a sprite of its own, and point the part at it.
   *
   * The answer to "one wheel, placed twice": once it is a file, every further
   * copy of that part is a REFERENCE to the same drawing rather than a second
   * one to keep in step. Duplicating a `use` part gives you the other wheel.
   *
   * Only when the file actually lands. Without a folder to write to, replacing
   * the pixels with a name would point the part at nothing and lose the art.
   */
  async function detach(path: string[]) {
    const suggested = path[path.length - 1];
    const name = await ask({
      title: "Detach to sprite",
      label: "Name",
      value: suggested,
      note: "Written to the folder as its own file. This part, and every copy of it, then draws that sprite — so fixing it once fixes all of them.",
      confirm: "Detach",
    });
    if (!name) return;
    if (sheet.byName[name.trim()]) return sayBad(`${name.trim()} already exists`);
    const sprite = spriteFromPart(path, name.trim());
    if (!sprite) return;
    if (!folder || !(await ensureWritable(folder))) {
      return sayBad("detach needs a folder to write the sprite into");
    }
    const file = await saveToFolder(folder, sprite);
    await refresh();
    usePartInstead(path, sprite.name);
    say(`${path.join("/")} now draws ${file} — duplicate it for another`);
  }

  async function drop(e: DragEvent) {
    dropping = false;
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    const res = await readDroppedFiles(files);
    problems = res.problems;
    if (res.entries[0]) {
      loadSprite(res.entries[0].sprite, res.entries[0].file);
      say(`opened ${res.entries[0].file}`);
    } else sayBad("no sprite in that drop");
  }

  /**
   * The browser's own menu, everywhere we do not have one.
   *
   * In a tool whose surface is a canvas and a set of panels, that menu offers
   * Back, Reload and Save Image As — none of which is ever what a right-click
   * here meant. Worse, it made right-click a coin toss: our menu on the things
   * that had one, the browser's on everything else, and no way to tell which
   * you were about to get.
   *
   * Text fields keep theirs. That is where the system clipboard, spellcheck and
   * the browser's own paste actually live, and none of those have an answer
   * here.
   */
  function contextmenu(e: MouseEvent) {
    if (!typing(e.target)) e.preventDefault();
  }

  function keydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable) return;
    // A dialog owns the keyboard outright. Each handles its own Escape/Enter and
    // stops propagation from inside its box — this is the backstop for a key
    // pressed while focus has wandered to the page, so `b` cannot switch tools
    // behind a veil.
    if (dialog.open || resizer.open || partDialog.open || making || settingsOpen || helpOpen)
      return;
    // The one key that means "explain this app".
    if (e.key === "?") {
      helpOpen = true;
      return;
    }
    const meta = e.metaKey || e.ctrlKey;
    // A turn in progress answers first, and to the two keys every editor's
    // free-transform answers to. Nothing else should reach the tools: the
    // document on screen is a preview, and Escape's usual meaning here —
    // deselect — would strand it.
    if (turning.on) {
      if (e.key === "Enter") {
        e.preventDefault();
        applyTurn();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelTurn();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // A degree a press, ten with Shift — the fine end of the same dial.
        e.preventDefault();
        setTurn(turning.angle + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1));
      }
      return;
    }
    if (meta && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save();
      return;
    }
    if (meta && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redoEdit();
      else undoEdit();
      return;
    }
    // The selection's clipboard is the editor's own, not the system one: what is
    // on it is a block of palette characters, which nothing outside this tool
    // would know what to do with.
    if (meta && e.key.toLowerCase() === "a") {
      e.preventDefault();
      editor.tool = "select";
      selectAll();
      return;
    }
    if (meta && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copySelection();
      return;
    }
    if (meta && e.key.toLowerCase() === "x") {
      e.preventDefault();
      cutSelection();
      return;
    }
    if (meta && e.key.toLowerCase() === "v") {
      e.preventDefault();
      editor.tool = "select";
      pasteClipboard();
      return;
    }
    // Layout: the same keys every editor uses for the same three regions.
    if (meta && e.code === "KeyB") {
      e.preventDefault();
      toggleRegion(e.altKey ? "right" : "left");
      return;
    }
    if (meta && e.code === "KeyJ") {
      e.preventDefault();
      toggleRegion("dock");
      return;
    }
    if (meta) return;
    // The Escape ladder, one rung per press: abort the drag in progress, then
    // cancel the floating paste (putting back what it covered — the same CANCEL
    // a turn answers with, where deselecting would quietly bake it), then
    // deselect. Escape never commits anything.
    if (e.key === "Escape") {
      if (gesture.abort) {
        gesture.abort();
        return;
      }
      if (floating.on) {
        cancelPaste();
        return;
      }
      clearSelection();
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      // The selected thing: a block of pixels when one is marked, otherwise the
      // selected part under the Move tool. Both are one undo away.
      if (hasSelection()) {
        e.preventDefault();
        deleteSelection();
      } else if (editor.tool === "move" && editor.path.length) {
        e.preventDefault();
        removePart(editor.path);
      }
      return;
    }
    // Frame stepping that always works, whatever is selected — Aseprite's keys.
    if (e.key === ",") editor.frame = Math.max(0, editor.frame - 1);
    if (e.key === ".") editor.frame = Math.min(activeNode().frames.length - 1, editor.frame + 1);
    if (e.key === "p" && activeNode().frames.length > 1) {
      editor.playing = !editor.playing;
      return;
    }
    if (e.key === "n") {
      editor.onion = !editor.onion;
      return;
    }
    const tool = TOOLS.find((x) => x.key === e.key.toLowerCase());
    if (tool) {
      editor.tool = tool.id as Tool;
      return;
    }
    // The arrows move the thing in hand: a marked block of pixels, or the
    // selected part under the Move tool. With neither, they step frames.
    if (e.key.startsWith("Arrow")) {
      const step = e.shiftKey ? (hasSelection() ? 4 : 10) : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (hasSelection()) {
        e.preventDefault();
        nudgeSelection(dx, dy);
        return;
      }
      if (editor.tool === "move" && editor.path.length) {
        e.preventDefault();
        nudgePart(dx, dy);
        return;
      }
      // Frame stepping on the arrows too, for the thumb that is already there.
      if (e.key === "ArrowLeft") editor.frame = Math.max(0, editor.frame - 1);
      if (e.key === "ArrowRight")
        editor.frame = Math.min(activeNode().frames.length - 1, editor.frame + 1);
      return;
    }
    // View keys, as in nib: 0 fits, +/− step the zoom.
    if (e.key === "0") fit(stageBox().w, stageBox().h);
    if (e.key === "+" || e.key === "=" || e.key === "]") zoomIn();
    if (e.key === "-" || e.key === "_" || e.key === "[") zoomOut();
  }

  /**
   * Come back where we left off.
   *
   * The dev server reloads the page on every source edit, so "where we left
   * off" is a state this tool is in constantly. Order matters: the folder comes
   * back first (silently, if the browser kept the grant), then the file that was
   * open, and any unsaved draft wins over the saved copy of the same file.
   */
  // The desk comes back before the drawing: tool, toggles, speeds, backdrop.
  const prefs = recallPrefs();
  if (prefs.tool && TOOLS.some((t) => t.id === prefs.tool)) editor.tool = prefs.tool as Tool;
  if (prefs.onion !== undefined) editor.onion = prefs.onion;
  if (prefs.grid !== undefined) editor.grid = prefs.grid;
  if (prefs.fps) editor.fps = prefs.fps;
  if (prefs.backdrop && BACKDROPS.some((b) => b.id === prefs.backdrop)) {
    backdrop = prefs.backdrop as Backdrop;
  }

  // And it is remembered as it changes — cheap enough to write on every change,
  // and a blob nobody parses on a hot path.
  $effect(() => {
    rememberPrefs({
      tool: editor.tool,
      onion: editor.onion,
      grid: editor.grid,
      fps: editor.fps,
      backdrop,
    });
  });

  $effect(() => watchTheme());

  onMount(async () => {
    const saved = await restoreFolder();
    if (saved) {
      if (await isWritable(saved)) {
        folder = saved;
        await refresh();
        const want = recallFile();
        const entry = want ? entries.find((e) => e.file === want) : null;
        if (entry) {
          loadSprite(cloneSprite(entry.sprite), entry.file);
          rememberSaved(entry.sprite, entry.file);
        }
        say(`${saved.name}: ${entries.length} sprites`);
      } else {
        // The handle is still ours, the permission is not. One click fixes it,
        // and it has to be a click — the browser will not grant without one.
        folder = saved;
        needsReconnect = true;
        say(`${saved.name} needs one click to reconnect`);
      }
    }
    // A draft outranks whatever was just loaded: it is the newer state, and it
    // is the one nobody else has a copy of.
    const draft = recallDraft();
    if (draft) {
      loadSprite(draft.sprite, draft.file);
      editor.dirty = true;
      say("restored unsaved work");
    } else if (firstVisit && !editor.file) {
      // Nothing restored and nothing ever seen: open on the example rather
      // than a blank 16×16 — the car is what the format exists to say.
      await openExample();
    }
  });

  async function reconnect() {
    if (!folder) return;
    if (!(await ensureWritable(folder))) return sayBad("permission refused");
    needsReconnect = false;
    await refresh();
    say(`${folder.name}: ${entries.length} sprites`);
  }

  // Keep a copy of unsaved work, so a reload — hot or otherwise — cannot eat a
  // drawing. Written on a timer rather than per stroke: a 72×18 sprite is a few
  // kB, but a pencil drag is hundreds of edits.
  $effect(() => {
    const sprite = editor.sprite;
    const file = editor.file;
    if (!editor.dirty) return;
    const id = setTimeout(() => rememberDraft(sprite, file), 400);
    return () => clearTimeout(id);
  });

  // A tab close with unsaved work is the one loss this tool can actually cause.
  $effect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (editor.dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  });
</script>

<svelte:window oncontextmenu={contextmenu} onkeydown={keydown} />

<div
  class="app"
  class:dropping
  style:grid-template-columns={`${showing("left") ? "16rem" : "0"} auto 1fr ${
    showing("right") ? "16rem" : "0"
  }`}
  role="application"
  aria-label="Sprite editor"
  ondragover={(e) => {
    e.preventDefault();
    dropping = true;
  }}
  ondragleave={() => (dropping = false)}
  ondrop={(e) => {
    e.preventDefault();
    void drop(e);
  }}
>
  <header class="bar">
    <strong>sprite editor</strong>

    <!-- A MODE, so it sits where modes are reachable rather than folded into a
         rail. Solid is the default: a part on a body is a solid thing on a
         body, and see-through says something about the art that is not true. -->
    <label class="bg">
      Parts
      <SegmentedControl
        label="How the parts you are not drawing on are drawn"
        options={UNDERLAYS}
        value={panels.underlay}
        onchange={(id) => setUnderlay(id as Underlay)}
      />
    </label>

    <label class="bg">
      Backdrop
      <select bind:value={backdrop} aria-label="Canvas backdrop">
        {#each BACKDROPS as b (b.id)}
          <option value={b.id}>{b.label}</option>
        {/each}
      </select>
    </label>

    <button class="size" onclick={openResize} title="Canvas size — crops or pads">
      {activeNode().w}×{activeNode().h}
      {#if editor.path.length}<span class="who">{editor.path.join("/")}</span>{/if}
    </button>

    <div class="acts">
      <button onclick={undoEdit} disabled={history.undo === 0} title="Undo (⌘Z)">Undo</button>
      <button onclick={redoEdit} disabled={history.redo === 0} title="Redo (⇧⌘Z)">Redo</button>
      <button onclick={() => (making = true)} title="New sprite (name and size)">New…</button>
      {#if needsReconnect}
        <button class="save" onclick={reconnect} title="Grant access to the remembered folder">
          Reconnect {folder?.name}
        </button>
      {:else}
        <button onclick={openFolder} title="Pick packages/player/src/sprites">
          {folder ? `Folder: ${folder.name}` : "Open folder…"}
        </button>
      {/if}
      <!-- Only while there is something to throw away, and only when there is
           somewhere to throw it back to. Undo is the answer within a session;
           this is the answer after a reload, when the draft came back and the
           undo stack did not. -->
      {#if editor.dirty}
        <button
          onclick={revert}
          disabled={!savedName}
          title={savedName
            ? `Throw away the unsaved change and go back to ${savedName}`
            : "Nothing saved to go back to — this sprite has never been written"}
        >
          Revert
        </button>
      {/if}
      <button class="save" onclick={save} title="Save (⌘S)">
        Save{editor.dirty ? " •" : ""}
      </button>
      <!-- The app's own two, rightmost — where every app in this family keeps
           them: what it is, and how you like it. -->
      <IconButton
        ghost
        active={helpOpen}
        label="How dab works"
        hint="How dab works (?)"
        onclick={() => (helpOpen = true)}
      >
        <CircleHelp size={15} />
      </IconButton>
      <IconButton
        ghost
        active={settingsOpen}
        label="Settings"
        hint="Settings — theme"
        onclick={() => (settingsOpen = true)}
      >
        <SettingsIcon size={15} />
      </IconButton>
    </div>
  </header>

  {#if showing("left")}
    <aside class="left">
      <!-- What you are drawing first; where you might go next below it. The
           folder listing is navigation you use for a moment and then leave,
           and thirty of them used to push the parts tree off a laptop. -->
      <Inspector />
      <Parts
        ondetach={detach}
        onopensprite={(name) => {
          const entry = entries.find((e) => e.sprite.name === name);
          if (entry) open(entry);
          else say(`${name} is not in this folder`);
        }}
      />
      <Sprites
        {entries}
        {problems}
        {folder}
        canWrite={canWriteToDisk()}
        onopen={open}
        onrename={renameEntry}
        onduplicate={duplicateEntry}
        ondelete={deleteEntry}
        onforget={forgetFolder}
      />
    </aside>
  {/if}

  <ToolRail />

  <main><Canvas {backdrop} /></main>

  <!-- Across, under the canvas: a frame strip is horizontal and a rail is not.
       Clips sit beside it because a clip is a sentence about those frames. -->
  {#if showing("dock")}
    <div class="dock">
      <Frames />
      <Clips />
    </div>
  {/if}

  {#if showing("right")}
    <aside class="right">
      <Palette />
      <Preview {backdrop} />
    </aside>
  {/if}

  <footer class="status">
    <!-- A paste is a state, not an event, so it says so for as long as it lasts.
         GIMP puts the same thing in the layer list with an Anchor button; there
         is no list here, and the status bar is the one place that is always on
         screen and never over the art. Ahead of the message, and nowhere near
         the region toggles: this is about the document, they are about the
         furniture. -->
    {#if floating.on}
      <span class="afloat" data-testid="afloat">
        Floating
        <button title="Put it down here and stop floating" onclick={dropPaste}>Drop</button>
      </span>
    {/if}
    <span class="msg" class:bad={editor.statusBad}>{editor.status}</span>
    <!-- Where every editor puts them. A region toggle is the one thing folding
         a panel cannot do: fold all of them and the rail is still there, 16rem
         of empty background beside the drawing. -->
    <div class="chrome">
      <IconButton
        size="sm"
        ghost
        active={showing("left")}
        label="Sprite and parts"
        hint="Sprite and parts (⌘B)"
        onclick={() => toggleRegion("left")}
      >
        <PanelLeft size={13} />
      </IconButton>
      <IconButton
        size="sm"
        ghost
        active={showing("dock")}
        label="Frames and clips"
        hint="Frames and clips (⌘J)"
        onclick={() => toggleRegion("dock")}
      >
        <PanelBottom size={13} />
      </IconButton>
      <IconButton
        size="sm"
        ghost
        active={showing("right")}
        label="Palette and preview"
        hint="Palette and preview (⌘⌥B)"
        onclick={() => toggleRegion("right")}
      >
        <PanelRight size={13} />
      </IconButton>
    </div>
  </footer>
</div>

<!-- Mounted once, outside the layout: these have to be able to sit over any
     panel whatever that panel does with overflow. -->
<ContextMenu />
<AskDialog />
<ResizeDialog />
<NewSpriteDialog open={making} onclose={() => (making = false)} />
<SettingsDialog open={settingsOpen} onclose={() => (settingsOpen = false)} />
<HelpDialog open={helpOpen} onclose={closeHelp} onexample={openExample} />

<style>
  .app {
    height: 100dvh;
    display: grid;
    /* The frame strip and the clips run ACROSS, under the canvas, the way every
       timeline does — they were the bottom two of six panels in one 16rem
       column, which put the clips off the screen entirely on a laptop. The
       structure panels (sprite, parts) sit left with the document; what a cell
       looks like (palette, variants, preview) sits right. */
    grid-template-rows: auto 1fr auto auto;
    grid-template-areas:
      "bar bar bar bar"
      "left rail main right"
      "left dock dock right"
      "status status status status";
    background: var(--halo-body);
    color: var(--halo-text-main);
    font-family: var(--halo-font-body);
  }
  .app.dropping {
    outline: 2px solid var(--halo-accent);
    outline-offset: -6px;
  }
  .bar {
    grid-area: bar;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--halo-border);
    background: var(--halo-bg-light);
  }
  .bar strong {
    letter-spacing: 0.04em;
  }
  .acts {
    display: flex;
    gap: 0.25rem;
  }
  .size {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-variant-numeric: tabular-nums;
  }
  .size .who {
    color: var(--halo-text-light);
  }
  .bg {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    color: var(--halo-text-muted);
  }
  .bg select {
    background: var(--halo-bg-main);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: var(--halo-radius-pill);
    padding: 0.2rem 0.3rem;
    font: inherit;
    font-size: 0.78rem;
  }
  .acts {
    margin-left: auto;
  }
  aside {
    padding: 0.75rem;
    display: grid;
    gap: 1rem;
    align-content: start;
    overflow-y: auto;
    /* Without this the panel's content sets its minimum height, the middle grid
       row grows past the viewport, and the bottom of the rail — the frame strip —
       goes off the screen with no scrollbar to bring it back. A grid item has to
       be allowed to be shorter than its contents before `auto` can scroll. */
    min-height: 0;
    background: var(--halo-bg-light);
  }
  /* Placed, not auto-placed. The tool rail had never been given its area and
     had been landing in the right cell by luck: hiding the left rail freed the
     cell it was falling into and the tools went with it. */
  .app :global(nav.rail) {
    grid-area: rail;
  }
  .left {
    grid-area: left;
    border-right: 1px solid var(--halo-border);
  }
  .right {
    grid-area: right;
    border-left: 1px solid var(--halo-border);
  }
  main {
    grid-area: main;
    display: grid;
    /* The canvas pane owns its own panning, so nothing here scrolls. */
    overflow: hidden;
    min-width: 0;
  }
  .dock {
    grid-area: dock;
    display: grid;
    /* Side by side, so the bar is as tall as the taller half rather than as
       tall as both. The FRAMES are the flexible half: the strip is the primary
       object down here and scrolls inside whatever it gets, so it takes the
       remainder. The clips size to their content up to a third — sizing the
       frames by content instead (fit-content through an overflow container)
       squeezed a twelve-frame strip to two thumbnails while the clips sat on
       width they were not using. */
    grid-template-columns: minmax(0, 1fr) fit-content(38%);
    gap: 0.5rem 1.25rem;
    align-content: start;
    padding: 0.6rem 0.75rem;
    border-top: 1px solid var(--halo-border);
    background: var(--halo-bg-light);
    /* Bounded, and its own scroller: a sprite with thirty frames must not push
       the canvas off the top of the window. */
    max-height: 40dvh;
    overflow-y: auto;
    min-width: 0;
  }
  .status {
    grid-area: status;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0.4rem 0.2rem 0.75rem;
    border-top: 1px solid var(--halo-border);
    background: var(--halo-bg-light);
    color: var(--halo-text-muted);
    font-size: 0.78rem;
    min-height: 1.6rem;
  }
  .msg {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Refusals and failures in the error colour — "not saved" must not read with
     the same weight as "opened car.json". */
  .msg.bad {
    color: var(--halo-error);
  }
  .chrome {
    display: flex;
    gap: 0.1rem;
  }
  /* Accent, matching the ants round the block it is about — the two are one
     statement said in two places, and the colour is the thread between them. */
  .afloat {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: none;
    padding: 0.05rem 0.1rem 0.05rem 0.4rem;
    border: 1px solid var(--halo-accent);
    border-radius: 999px;
    background: var(--halo-accent-soft);
    color: var(--halo-accent);
    font-size: 0.72rem;
    white-space: nowrap;
  }
  .afloat button {
    background: none;
    border: 0;
    border-radius: 999px;
    padding: 0.1rem 0.45rem;
    color: var(--halo-accent);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .afloat button:hover {
    background: var(--halo-accent);
    color: var(--halo-bg-main);
  }
  button {
    background: var(--halo-bg-main);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: var(--halo-radius-pill);
    padding: 0.3rem 0.55rem;
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--halo-accent);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .save {
    border-color: var(--halo-accent);
  }
</style>
