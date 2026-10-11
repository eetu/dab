// Whether the "new part" dialog is open.
//
// A module because several places ask for it — the sprites panel's actions, a
// row's menu and a right-click on a selection — and none of them is anywhere
// near the others in the tree.

export const partDialog = $state({ open: false });

export const openPartDialog = (): void => {
  partDialog.open = true;
};

export const closePartDialog = (): void => {
  partDialog.open = false;
};
