import { CompanyHome } from './components/home/CompanyHome';
import { FamilyApp } from './components/family/FamilyApp';
import { isFamilyAppSurface } from './platform/surface';

export default function App() {
  return isFamilyAppSurface() ? <FamilyApp /> : <CompanyHome />;
}
