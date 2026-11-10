"use client";

import { useSyncExternalStore } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";

let currentUser: User | null | undefined = undefined;
let listeners: Array<() => void> = [];
let initialized = false;

function subscribe(listener: () => void) {
  if (!initialized) {
    initialized = true;
    // Set initial state from current user — may still be null while SDK resolves.
    currentUser = firebaseAuth.currentUser ?? null;
    onAuthStateChanged(firebaseAuth, (user) => {
      currentUser = user;
      listeners.forEach((fn) => fn());
    });
  }
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((fn) => fn !== listener);
  };
}

function getSnapshot(): User | null | undefined {
  return currentUser;
}

function getServerSnapshot() {
  return undefined as User | null | undefined;
}

/** Single shared Firebase auth subscription for the entire app.
 *  Returns `undefined` while auth state is still resolving, `null` if
 *  confirmed logged out, or the Firebase `User` when logged in. */
export function useAuth(): User | null | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
