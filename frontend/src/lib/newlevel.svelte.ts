// Whether the "new level" dialog is open — a module because the sprite's row
// and every level's row both ask for it.

export const levelDialog = $state({ open: false });

export const openLevelDialog = (): void => {
  levelDialog.open = true;
};

export const closeLevelDialog = (): void => {
  levelDialog.open = false;
};
