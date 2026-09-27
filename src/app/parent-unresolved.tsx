import { Redirect } from 'expo-router';

export default function PreviousUnresolvedRoute() {
  return <Redirect href="/parent-review?tab=unresolved" />;
}
