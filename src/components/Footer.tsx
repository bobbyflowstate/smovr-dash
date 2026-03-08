export default function Footer() {
  const officeName = process.env.NEXT_PUBLIC_OFFICE_NAME || "Medical Office";

  return (
    <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-8 transition-colors">
      <div className="container mx-auto px-4 py-6 text-center">
        <p className="text-gray-600 dark:text-gray-400 text-sm">&copy; {new Date().getFullYear()} {officeName}. All rights reserved.</p>
      </div>
    </footer>
  );
}
