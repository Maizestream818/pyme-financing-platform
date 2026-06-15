'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { getSession, Session } from '../auth/session';
import { Role } from '../lib/types';

type Props = {
  roles?: Role[];
  children: (session: Session) => ReactNode;
};

export function AuthGuard({ roles, children }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const current = getSession();
    setSession(current);

    if (!current) {
      router.replace('/login');
      return;
    }

    if (roles?.length && !roles.includes(current.user.role)) {
      router.replace('/dashboard');
    }
  }, [roles, router]);

  if (session === undefined) {
    return <main className="centered">Cargando sesion...</main>;
  }

  if (!session) {
    return <main className="centered">Redirigiendo a login...</main>;
  }

  if (roles?.length && !roles.includes(session.user.role)) {
    return <main className="centered">No tienes permisos para esta vista.</main>;
  }

  return <>{children(session)}</>;
}
