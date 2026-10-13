"use client";

import { SignInButton, SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut } from "lucide-react";

export default function AuthButton({ user }) {
  if (user) {
    return (
      <SignOutButton redirectUrl="/">
        <Button variant="ghost" size="sm" className="gap-2">
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </SignOutButton>
    );
  }

  return (
    <SignInButton mode="modal">
      <Button
        variant="default"
        size="sm"
        className="bg-orange-500 hover:bg-orange-600 gap-2"
      >
        <LogIn className="w-4 h-4" />
        Sign In
      </Button>
    </SignInButton>
  );
}
