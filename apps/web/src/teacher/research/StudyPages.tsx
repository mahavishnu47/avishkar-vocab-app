import { useParams } from 'react-router-dom';
import { Page } from '../ui.tsx';

export default function StudyPages() {
  const { classId } = useParams();
  return <Page classId={classId ? Number(classId) : undefined} title="StudyPages"><p className="muted">Coming soon</p></Page>;
}
