/**
 * app/app/home/page.tsx
 * Thin redirect — My Workflows is the default landing surface (D-16).
 *
 * /app/home is kept as a redirect target (not removed) so no existing links
 * break. The middleware also redirects /app and /app/home before this page
 * renders, but this server-side redirect acts as a belt-and-suspenders guard.
 */
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/app/workflows");
}
