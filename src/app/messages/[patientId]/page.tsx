import ConversationWrapper from './ConversationWrapper';

interface PageProps {
  params: { patientId: string };
}

export default function ConversationPage({ params }: PageProps) {
  return <ConversationWrapper patientId={params.patientId} />;
}

