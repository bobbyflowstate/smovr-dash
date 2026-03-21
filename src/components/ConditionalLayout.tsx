import { headers } from "next/headers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const PATIENT_LANDING_ROUTES = ["/15-late", "/30-late", "/reschedule-cancel"];

export default async function ConditionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";
  
  const isPatientLandingPage = PATIENT_LANDING_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (isPatientLandingPage) {
    return <>{children}</>;
  }

  // /ops has its own layout
  if (pathname.startsWith("/ops")) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto p-4">{children}</main>
      <Footer />
    </>
  );
}

