export type ApiRequest = <T>(path: string, init?: RequestInit & { auth?: boolean }) => Promise<T>;
