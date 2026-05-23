import { redirect } from "next/navigation";

/**
 * Root entry. The product has no marketing landing page (per the design, the app
 * opens to My Workflows). Route `/` into the app; middleware redirects to /login
 * when unauthenticated.
 */
export default function Home() {
  redirect("/app/workflows");
}
