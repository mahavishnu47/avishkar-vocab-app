import { useParams } from 'react-router-dom';
import { Page } from '../ui.tsx';

export default function Instruments() {
  const { classId } = useParams();
  return <Page classId={classId ? Number(classId) : undefined} title="Instruments"><p className="muted">Coming soon</p></Page>;
}
