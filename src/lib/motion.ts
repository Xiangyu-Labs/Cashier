import type { Transition } from "framer-motion";

export const MOTION_DURATION = {
  press: 0.1,
  feedback: 0.16,
  state: 0.2,
  expand: 0.28,
  menuEnter: 0.18,
  menuExit: 0.14,
} as const;

export const MOTION_EASING = {
  enter: [0.16, 1, 0.3, 1],
  exit: [0.7, 0, 0.84, 0],
  state: [0.65, 0, 0.35, 1],
} as const;

export const EXPAND_TRANSITION: Transition = {
  duration: MOTION_DURATION.expand,
  ease: MOTION_EASING.state,
};

export const REDUCED_MOTION_TRANSITION: Transition = { duration: 0 };
