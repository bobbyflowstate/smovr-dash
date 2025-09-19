import Link from 'next/link';

export default function Header() {
  return (
    <header className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-xl font-bold">Smovr Dash</h1>
        <nav>
          <ul className="flex space-x-4">
            <li>
              <Link href="/submit" className="hover:text-gray-300">
                Submit Patient
              </Link>
            </li>
            <li>
              <Link href="/logs" className="hover:text-gray-300">
                Logs
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          {/* Placeholder for user profile/logout */}
          <a href="/api/logto/sign-out" className="hover:text-gray-300">Logout</a>
        </div>
      </div>
    </header>
  );
}
