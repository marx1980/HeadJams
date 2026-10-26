import { useState } from 'react';
import { createProject, toggleStep } from '../model/project';

export function App() {
  const [project, setProject] = useState(createProject);
  return (
    <main>
      <h1>MusicMaker</h1>
      {project.channels.map((c) => (
        <div key={c.id}>
          <strong>{c.name}</strong>{' '}
          {c.steps.map((on, i) => (
            <button key={i} aria-pressed={on} onClick={() => setProject(toggleStep(project, c.id, i))}>
              {on ? '■' : '□'}
            </button>
          ))}
        </div>
      ))}
    </main>
  );
}
