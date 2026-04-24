// Global on/off switch for each sidebar menu. Flip a value to `false` to hide
// the menu from every user (admins included) and redirect away from its route.
//
// This is a UI-level toggle. Backend routes remain reachable; use the per-user
// UserProjectMembership.menuAccess (backend/src/constants/roles.ts) for real
// access control. Most "turn off a nav link" use cases are happy with this
// file — disabling the sidebar entry is usually all you want.
//
// Changing a value requires a frontend rebuild.

export type MenuFlagKey =
  | "dashboard"
  | "brand-brain"
  | "product-brain"
  | "topic-generator"
  | "content-generator"
  | "campaign-generator"
  | "topic-library"
  | "content-library"
  | "learning-center"
  | "research-hub"
  | "competitor-analyzer";

export const MENU_FLAGS: Record<MenuFlagKey, boolean> = {
  "dashboard": false,
  "brand-brain": true,
  "product-brain": true,
  "topic-generator": true,
  "content-generator": true,
  "campaign-generator": false,
  "topic-library": true,
  "content-library": true,
  "learning-center": false,
  "research-hub": false,
  "competitor-analyzer": false,
};

export function isMenuEnabled(key: MenuFlagKey): boolean {
  return MENU_FLAGS[key] !== false;
}
