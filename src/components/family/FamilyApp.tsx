import { FamilyMapScreen } from './FamilyMapScreen';
import { Onboarding } from './Onboarding';
import { FamilyProvider, useFamily } from './session';

function FamilyRouter() {
  const { state } = useFamily();
  if (state.stage === 'map') return <FamilyMapScreen />;
  return <Onboarding />;
}

export function FamilyApp() {
  return (
    <FamilyProvider>
      <FamilyRouter />
    </FamilyProvider>
  );
}
