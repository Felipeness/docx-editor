export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

export const api = {
  async post<T>(
    path: string,
    body: any,
    init: RequestInit = {}
  ): Promise<{ data: T }> {
    const isFormData =
      typeof FormData !== "undefined" && body instanceof FormData;

    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      body,
      // Não defina Content-Type para FormData
      headers: isFormData
        ? (init.headers as any)
        : { "Content-Type": "application/json", ...(init.headers || {}) },
      ...init,
    });

    // Mensagem de erro mais útil
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${txt ? ` - ${txt}` : ""}`);
    }

    const data = await res.json();
    return { data };
  },
};
