'use client';

import { FormEvent, ReactNode } from 'react';
import { formatApiError } from '../lib/api';

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }

  return <div className="alert error">{formatApiError(error)}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-heading">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function submitHandler(
  callback: () => Promise<void>,
  setError: (error: unknown) => void,
  setBusy?: (busy: boolean) => void,
) {
  return async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy?.(true);

    try {
      await callback();
    } catch (error) {
      setError(error);
    } finally {
      setBusy?.(false);
    }
  };
}

export function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(number);
}

export function formatDate(value?: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function statusLabel(value?: string | null) {
  return value ? value.replaceAll('_', ' ') : '-';
}
