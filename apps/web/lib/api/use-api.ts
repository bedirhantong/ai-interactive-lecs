"use client";

import { useCallback, useEffect, useState } from "react";
import { type ApiResult, api, errorMessage } from "./client";

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  pagination: ApiResult<T>["pagination"];
  reload: () => Promise<void>;
}

/** GET a path and keep the result in state. `path === null` skips the request. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; pagination: ApiResult<T>["pagination"] }>({
    data: null,
    error: null,
    loading: path !== null,
    pagination: null,
  });

  const load = useCallback(async () => {
    if (path === null) return;
    try {
      const result = await api<T>(path);
      setState({ data: result.data, error: null, loading: false, pagination: result.pagination });
    } catch (err) {
      setState((s) => ({ ...s, error: errorMessage(err), loading: false }));
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
