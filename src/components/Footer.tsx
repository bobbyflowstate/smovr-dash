export default function Footer() {
  return (
    <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-8 transition-colors">
      <div className="container mx-auto px-4 py-6 text-center">
        <p className="text-gray-600 dark:text-gray-400 text-sm">&copy; {new Date().getFullYear()} AZ Integrated Medical. All rights reserved.</p>
      </div>
    </footer>
  );
}
