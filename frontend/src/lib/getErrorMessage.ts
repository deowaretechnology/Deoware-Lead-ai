import { AxiosError } from 'axios';

export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof AxiosError) {
    return err.response?.data?.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
