"use client";

import { useActionState } from "react";
import { registerAction, type AuthFormState } from "@/lib/actions/auth";
import { FormField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

const initialState: AuthFormState = { attempt: 0 };

export function RegisterForm({ isFirstAccount }: { isFirstAccount: boolean }) {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="space-y-3" key={state.attempt}>
      {isFirstAccount && (
        <p className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-accent">
          Dies ist das erste Konto auf dieser Instanz und wird automatisch Admin.
        </p>
      )}
      <FormField
        label="Anzeigename"
        type="text"
        name="displayName"
        required
        autoFocus
        maxLength={32}
        defaultValue={state.values?.displayName}
      />
      <FormField
        label="E-Mail-Adresse"
        type="email"
        name="email"
        required
        defaultValue={state.values?.email}
      />
      <FormField
        label="Passwort"
        type="password"
        name="password"
        required
        minLength={8}
        placeholder="mind. 8 Zeichen"
        autoComplete="new-password"
      />
      {state.error && (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Konto wird erstellt…" : "Konto erstellen"}
      </Button>
    </form>
  );
}
