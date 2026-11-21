import { useParams } from 'react-router-dom';
import { Page } from '../ui.tsx';

export default function Progress() {
  const { classId } = useParams();
  return <Page classId={classId ? Number(classId) : undefined} title="Progress"><p className="muted">Coming soon</p></Page>;
}
