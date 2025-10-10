import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import GeneradorCertificados from './GeneradorCertificados';
import Herramientas from './Herramientas';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<GeneradorCertificados />} />
        <Route path="/herramientas" element={<Herramientas />} />
      </Routes>
    </Router>
  );
}

export default App;
