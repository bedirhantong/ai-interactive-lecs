"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import type { NotebookState, NotebookStore } from "@/lib/notebook/store";
import type { PythonRuntime, RuntimeSnapshot } from "@/lib/runtime/python-runtime";

interface NotebookContextValue {
  store: NotebookStore;
  runtime: PythonRuntime;
}

export const NotebookContext = createContext<NotebookContextValue | null>(null);

function useCtx(): NotebookContextValue {
  const ctx = useContext(NotebookContext);
  if (!ctx) throw new Error("NotebookContext eksik");
  return ctx;
}

export function useNotebook<T>(selector: (s: NotebookState) => T): T {
  return useStore(useCtx().store, selector);
}

export function useNotebookStore(): NotebookStore {
  return useCtx().store;
}

export function useRuntime(): PythonRuntime {
  return useCtx().runtime;
}

export function useRuntimeSnapshot(): RuntimeSnapshot {
  const runtime = useRuntime();
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
}

/** Typed access to one cell's state. */
export function useCellState<T>(cellId: string): T {
  return useNotebook((s) => s.cells[cellId]) as T;
}
