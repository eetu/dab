// The editor store, one module per concern under editor/. This file is its
// public surface: what a component may call. The helpers the modules share —
// commit, the active frame, the float — stay among them.

export {
  addAnimation,
  animationRun,
  appendToAnimation,
  canPlay,
  moveAnimation,
  playLength,
  removeAnimation,
  renameAnimation,
  rewind,
  setAnimationFrames,
  setPlaying,
  shownFrame,
} from "./editor/animations.svelte";
export {
  cancelPaste,
  copySelection,
  cutSelection,
  deleteSelection,
  flipNode,
  flipSelection,
  nudgeSelection,
  pasteClipboard,
} from "./editor/blocks.svelte";
export {
  addCycle,
  cycleShowing,
  removeCycle,
  renameCycle,
  reverseCycle,
  shownVariant,
} from "./editor/cycles.svelte";
export {
  adoptFromDisk,
  holdingWork,
  loadSprite,
  newSprite,
  pickAllParts,
  pickNode,
  rename,
  selectNode,
} from "./editor/document.svelte";
export { fillAt, paint, pickAt, setTool, strokePoints } from "./editor/drawing.svelte";
export { exportImage, type ExportKind, exportPlan } from "./editor/export.svelte";
export { addFrame, duplicateFrame, moveFrame, removeFrame } from "./editor/frames.svelte";
export { canRedo, canUndo, history, redoEdit, undoEdit } from "./editor/history.svelte";
export { addLevel, removeLevel, renameLevel } from "./editor/levels.svelte";
export {
  addColour,
  adoptFromBundle,
  clashingChars,
  importColours,
  movePaletteChar,
  paletteElsewhere,
  pushColour,
  pushPalette,
  pushTargets,
  removeColour,
  removeUnusedColours,
  renameChar,
  setColour,
} from "./editor/palette.svelte";
export {
  addPart,
  duplicatePart,
  flattenedNode,
  inlinePart,
  movePart,
  moveParts,
  nudgePart,
  padNode,
  partFromSelection,
  pickedPaths,
  placePart,
  removePart,
  removePickedParts,
  renamePart,
  setPartBehind,
  setPartFlip,
  spriteFromPart,
  usePartInstead,
} from "./editor/parts.svelte";
export {
  beginPerspective,
  brush,
  endPerspective,
  perspective,
  perspectiveAt,
  plane,
  setAnchor,
  setPlane,
  stampPerspective,
} from "./editor/perspective.svelte";
export {
  clearSelection,
  clipboard,
  dropPaste,
  floating,
  gesture,
  hasSelection,
  isSelected,
  pasteFloating,
  selectAll,
  selectBox,
  selectColour,
  selectColourAt,
  selection,
  selectShapeAt,
} from "./editor/selection.svelte";
export { editor, type Tool, TOOLS } from "./editor/state.svelte";
export {
  activeHidden,
  activeNode,
  activeRef,
  allNodes,
  frameOf,
  nodeOrigin,
  parentNode,
  partAt,
  pathKey,
  readOnly,
  resolvePart,
  sheet,
  stageBox,
  stageNode,
  stepOf,
  usedBy,
} from "./editor/tree.svelte";
export {
  applyTurn,
  type Axis,
  beginTurn,
  cancelTurn,
  setAxis,
  setHinge,
  setTurn,
  setTurnFrames,
  turnFrame,
  turning,
} from "./editor/turn.svelte";
export {
  addVariant,
  clearVariantColour,
  duplicateVariant,
  removeVariant,
  renameVariant,
  setVariantColour,
} from "./editor/variants.svelte";
