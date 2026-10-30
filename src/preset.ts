/** The selectors and names that fit an app built on MUI, for the options of the checks and the meter. */
export const muiPreset = {
  /** Ripples fade out in a commit of their own; that is the library's animation, not the page settling. */
  ignoreCommitsOf: ['TouchRipple'],
  /** Building blocks every MUI component renders through; a report should name the app's own components instead. */
  libraryNames:
    /^(Insertion|Styled\(|Mui|Box$|Typography$|ButtonBase$|anonymous$|TouchRipple|Ripple$|Popper|Portal$|Grow$|Fade$|Collapse$|Transition|SvgIcon$|Tooltip$|Modal$|Dialog$|Paper$|Button$|IconButton$|InputBase$|FormControl$|Chip$|Menu$|List|TableCell$|TableRow$)/,
  ownClassPrefix: 'Mui',
  /** Surfaces content sits on, which never count as a card. */
  surfaces: '.MuiDialog-paper, .MuiPopover-paper, .MuiMenu-paper, .MuiTooltip-tooltip',
  /** Controls that draw their own box. */
  controls: '.MuiButtonBase-root, .MuiChip-root, input, textarea',
  /** Elements whose insides the spacing check leaves alone. */
  skip: '.MuiButtonBase-root, .MuiChip-root, .MuiInputBase-root, svg',
} as const
