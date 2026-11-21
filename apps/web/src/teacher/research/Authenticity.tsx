import { useParams } from 'react-router-dom';
import { Page } from '../ui.tsx';

export default function Authenticity() {
  const { classId } = useParams();
  return <Page classId={classId ? Number(classId) : undefined} title="Authenticity"><p className="muted">Coming soon</p></Page>;
}
