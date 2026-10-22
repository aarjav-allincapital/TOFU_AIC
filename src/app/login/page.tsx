import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-static";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen justify-center bg-white px-6 pt-24 sm:pt-36">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
