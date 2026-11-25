/**
 * The family games that take over the whole screen. None of the app's chrome (the
 * mobile bottom nav, the board's sheet, the icon rail, the AI status bar) belongs on
 * them, on any screen size. Add a new game here and every piece of chrome steps aside.
 */
export const GAME_ROUTES = ['/mow', '/catlife', '/rescue', '/pickleball', '/volleyball', '/soccer'] as const;

export function isGameRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return GAME_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`) || pathname.startsWith(`${r}?`));
}
