// Whether the canvas-size dialog is open.
//
// A module rather than a prop because the thing that opens it (a button in the
// top bar) and the thing that draws it (a modal mounted beside the app shell,
// so it can sit over anything) are nowhere near each other in the tree.

export const resizer = $state({ open: false });

export const openResize = (): void => {
  resizer.open = true;
};

export const closeResize = (): void => {
  resizer.open = false;
};
