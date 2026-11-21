import { useParams } from 'react-router-dom';
import { Page } from '../ui.tsx';

export default function Results() {
  const { classId } = useParams();
  return <Page classId={classId ? Number(classId) : undefined} title="Results"><p className="muted">Coming soon</p></Page>;
}
