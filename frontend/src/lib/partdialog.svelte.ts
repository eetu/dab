// Whether the "new part" dialog is open.
//
// A module because two places ask for it now — the Parts panel's plus button
// and a right-click on a selection — and neither of them is anywhere near the
// other in the tree.

export const partDialog = $state({ open: false });

export const openPartDialog = (): void => {
  partDialog.open = true;
};

export const closePartDialog = (): void => {
  partDialog.open = false;
};
