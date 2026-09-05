import { HttpContext } from '@angular/common/http';

export type ApiOptions = {
  params?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  context?: HttpContext;
  withCredentials?: boolean;
  baseUrl?: string;
};
