import { useParams } from 'react-router-dom';
import { Page } from '../ui.tsx';

export default function Assessments() {
  const { classId } = useParams();
  return <Page classId={classId ? Number(classId) : undefined} title="Assessments"><p className="muted">Coming soon</p></Page>;
}
