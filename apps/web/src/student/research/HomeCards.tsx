import type { StudentHomeRes } from '@shabd/core';
import { StudyDayCard } from './cards/StudyDayCard.tsx';
import { TestCard } from './cards/TestCard.tsx';
import { RevisionCard } from './cards/RevisionCard.tsx';
import { FeedbackCard } from './cards/FeedbackCard.tsx';

export function HomeCards({ home }: { home: StudentHomeRes }) {
  return <><StudyDayCard home={home} /><TestCard home={home} /><RevisionCard home={home} /><FeedbackCard home={home} /></>;
}
