'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearSession } from '../auth/session';
import { Session } from '../auth/session';

const applicantLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/companies', label: 'Empresas' },
  { href: '/applications', label: 'Solicitudes' },
];

const operatorLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/companies', label: 'Empresas' },
  { href: '/applications', label: 'Solicitudes' },
  { href: '/financial-products', label: 'Productos y reglas' },
];

export function Shell({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const links =
    session.user.role === 'internal_operator' ? operatorLinks : applicantLinks;

  function logout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">PyME Financing</p>
          <h1>Pre-evaluacion</h1>
        </div>
        <nav>
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <strong>{session.user.fullName}</strong>
            <span>{session.user.role}</span>
          </div>
          <button type="button" className="secondary" onClick={logout}>
            Salir
          </button>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
