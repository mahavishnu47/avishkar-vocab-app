import { createContext, useContext } from 'react';
import type { Teacher } from '@shabd/core';

export interface SchoolCtxValue { me: Teacher; schoolName: string }
export const SchoolCtx = createContext<SchoolCtxValue | null>(null);
export function useSchoolCtx(): SchoolCtxValue {
  const v = useContext(SchoolCtx);
  if (!v) throw new Error('SchoolCtx missing');
  return v;
}
