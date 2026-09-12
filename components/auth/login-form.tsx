"use client";

import { useActionState } from "react";
import { loginAction, type AuthFormState } from "@/lib/actions/auth";
import { FormField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

const initialState: AuthFormState = { attempt: 0 };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-3" key={state.attempt}>
      <FormField
        label="E-Mail-Adresse"
        type="email"
        name="email"
        required
        autoFocus
        defaultValue={state.values?.email}
      />
      <FormField label="Passwort" type="password" name="password" required autoComplete="current-password" />
      {state.error && (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Anmelden…" : "Anmelden"}
      </Button>
    </form>
  );
}
