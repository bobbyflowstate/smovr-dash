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
  
  // Check if we're on a patient landing page
  const isPatientLandingPage = PATIENT_LANDING_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // For patient landing pages, don't show header/footer
  if (isPatientLandingPage) {
    return <>{children}</>;
  }

  // For admin pages, show header and footer
  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto p-4">{children}</main>
      <Footer />
    </>
  );
}

