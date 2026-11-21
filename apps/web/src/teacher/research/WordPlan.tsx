import { useParams } from 'react-router-dom';
import { Page } from '../ui.tsx';

export default function WordPlan() {
  const { classId } = useParams();
  return <Page classId={classId ? Number(classId) : undefined} title="WordPlan"><p className="muted">Coming soon</p></Page>;
}
