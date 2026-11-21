import type { StudentHomeRes, StudyDayRes } from '@shabd/core';
import { StudyDayCard } from './cards/StudyDayCard.tsx';
import { TestCard } from './cards/TestCard.tsx';
import { RevisionCard } from './cards/RevisionCard.tsx';
import { FeedbackCard } from './cards/FeedbackCard.tsx';

export function HomeCards({ home, day }: { home: StudentHomeRes; day?: StudyDayRes | null }) {
  return <><StudyDayCard home={home} day={day} /><TestCard home={home} /><RevisionCard home={home} /><FeedbackCard home={home} /></>;
}
